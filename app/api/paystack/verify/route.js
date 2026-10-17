import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTransaction } from '../../../../lib/paystack';
import { sendTicketEmail } from '../../../../lib/email';
import { createTicketsForOrder } from '../../../../lib/events';
import { createNotification } from '../../../../lib/notifications';

const supabase = createClient(
process.env.NEXT_PUBLIC_SUPABASE_URL,
process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get('reference');

    if (!reference) {
      return NextResponse.json({ error: 'Missing reference' }, { status: 400 });
    }

    let order = null;
    let shouldSendEmail = false;

    if (reference.startsWith('TB-FREE-')) {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('paystack_reference', reference)
        .single();
      order = data;
    } else {
      const paystackData = await verifyTransaction(reference);

      if (paystackData.status !== 'success') {
        return NextResponse.json(
          { error: `Payment status: ${paystackData.status}` },
          { status: 400 }
        );
      }

      const { data: existingOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('paystack_reference', reference)
        .single();

      const isNewlyPaid =
        existingOrder && existingOrder.status !== 'paid';

      const { data: updatedOrder } = await supabase
        .from('orders')
        .update({ status: 'paid' })
        .eq('paystack_reference', reference)
        .select()
        .single();

      order = updatedOrder;
      shouldSendEmail = !!isNewlyPaid;

      if (isNewlyPaid && existingOrder) {
        // Increment sold count
        const { data: ticket } = await supabase
          .from('ticket_types')
          .select('*')
          .eq('id', existingOrder.ticket_type_id)
          .single();

        if (ticket) {
          const newSold =
            (ticket.quantity_sold || 0) + existingOrder.quantity;
          await supabase
            .from('ticket_types')
            .update({ quantity_sold: newSold })
            .eq('id', ticket.id);
        }

        // Create individual tickets
        try {
          await createTicketsForOrder(
            existingOrder.id,
            existingOrder.event_id,
            existingOrder.quantity
          );
        } catch (ticketErr) {
          console.error('Ticket creation error:', ticketErr);
        }

        // Increment promo usage
        if (existingOrder.promo_code_id) {
          try {
            const { data: promoRow } = await supabase
              .from('promo_codes')
              .select('times_used')
              .eq('id', existingOrder.promo_code_id)
              .single();

            if (promoRow) {
              await supabase
                .from('promo_codes')
                .update({
                  times_used: (promoRow.times_used || 0) + 1,
                })
                .eq('id', existingOrder.promo_code_id);
            }
          } catch (promoErr) {
            console.error('Promo increment error:', promoErr);
          }
        }

        // Log platform earnings permanently
        try {
          const { data: ev } = await supabase
            .from('events')
            .select('title')
            .eq('id', existingOrder.event_id)
            .single();

          // Check if this is the very first sale for this event
          const { count: previousSales } = await supabase
            .from('platform_earnings')
            .select('id', { count: 'exact', head: true })
            .eq('event_title', ev?.title || 'Unknown Event');

          const isFirstSale = previousSales === 0;

          await supabase.from('platform_earnings').insert([{
            order_reference: existingOrder.paystack_reference,
            event_title: ev?.title || 'Unknown Event',
            buyer_email: existingOrder.buyer_email,
            gross_amount: existingOrder.total,
            platform_fee: Math.round(existingOrder.total * 0.05),
            ticket_quantity: existingOrder.quantity,
            is_new_event: isFirstSale,
          }]);
        } catch (err) {
          console.error('Failed to log platform earnings:', err);
        }

        // Notify organizer
        try {
          const { data: ev } = await supabase
            .from('events')
            .select('title, organizer_id')
            .eq('id', existingOrder.event_id)
            .single();

          if (ev?.organizer_id) {
            await createNotification({
              userId: ev.organizer_id,
              type: 'ticket_sold',
              title: `🎟️ ${existingOrder.quantity} ticket${
                existingOrder.quantity === 1 ? '' : 's'
              } sold for ${ev.title}`,
              body: `${existingOrder.buyer_email} paid ₦${Number(
                existingOrder.total || 0
              ).toLocaleString()}.`,
              link: `/event/${existingOrder.event_id}/analytics`,
            });
          }
        } catch (notifErr) {
          console.error('Notification error:', notifErr);
        }
      }
    }

    // Send email if newly paid
    if (shouldSendEmail && order) {
      try {
        const { data: event } = await supabase
          .from('events')
          .select('*')
          .eq('id', order.event_id)
          .single();

        const { data: ticket } = await supabase
          .from('ticket_types')
          .select('*')
          .eq('id', order.ticket_type_id)
          .single();

        const { data: ticketRows } = await supabase
          .from('tickets')
          .select('id')
          .eq('order_id', order.id)
          .order('ticket_number', { ascending: true });

        const ticketIds = (ticketRows || []).map((t) => t.id);

        if (event && ticket) {
          await sendTicketEmail({
            to: order.buyer_email,
            name: order.buyer_email.split('@')[0],
            event,
            ticket,
            orderId: order.paystack_reference,
            quantity: order.quantity,
            total: order.total,
            ticketIds,
          });
        }
      } catch (emailErr) {
        console.error('TICKET EMAIL FAILED:', emailErr.message || emailErr);
      }
    }

    return NextResponse.json({
      order: order || null,
      paystack: {
        amount: 0,
        reference,
        paid_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Verify error:', err);
    return NextResponse.json(
      { error: err.message || 'Verification failed' },
      { status: 500 }
    );
  }
}
