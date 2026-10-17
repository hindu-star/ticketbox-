import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTicketEmail } from '../../../../lib/email';
import { createTicketsForOrder } from '../../../../lib/events';
import { createNotification } from '../../../../lib/notifications';

const supabase = createClient(
process.env.NEXT_PUBLIC_SUPABASE_URL,
process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const {
      eventId,
      ticketId,
      quantity,
      buyerEmail,
      promoCodeId,
    } = await request.json();

    if (!eventId || !ticketId || !quantity || !buyerEmail) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('ticket_types')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    if (Number(ticket.price) > 0) {
      return NextResponse.json(
        { error: 'This ticket is not free' },
        { status: 400 }
      );
    }

    // Block if event has ended + get organizer info in one query
    const { data: eventData } = await supabase
      .from('events')
      .select('title, organizer_id, end_date, event_date, end_time')
      .eq('id', eventId)
      .single();

    if (eventData) {
      const dateStr = eventData.end_date || eventData.event_date;
      const endDT = eventData.end_time
        ? new Date(`${dateStr}T${eventData.end_time}`)
        : new Date(`${dateStr}T23:59:59`);

      if (endDT < new Date()) {
        return NextResponse.json(
          { error: 'This event has ended.' },
          { status: 400 }
        );
      }
    }

    // Capacity check
    if (ticket.capacity) {
      const sold = ticket.quantity_sold || 0;
      const remaining = ticket.capacity - sold;

      if (remaining <= 0) {
        return NextResponse.json({ error: 'Sold out' }, { status: 400 });
      }
      if (quantity > remaining) {
        return NextResponse.json(
          { error: `Only ${remaining} left` },
          { status: 400 }
        );
      }
    }

    const reference = `TB-FREE-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([
        {
          event_id: eventId,
          ticket_type_id: ticketId,
          buyer_email: buyerEmail,
          quantity,
          unit_price: 0,
          subtotal: 0,
          service_fee: 0,
          total: 0,
          paystack_reference: reference,
          status: 'paid',
          promo_code_id: promoCodeId || null,
        },
      ])
      .select()
      .single();

    if (orderError) {
      console.error('Order insert error:', orderError);
      throw orderError;
    }

    // Create individual tickets
    let ticketIds = [];
    try {
      await createTicketsForOrder(order.id, eventId, quantity);
      const { data: created } = await supabase
        .from('tickets')
        .select('id')
        .eq('order_id', order.id)
        .order('ticket_number', { ascending: true });
      ticketIds = (created || []).map((t) => t.id);
    } catch (ticketErr) {
      console.error('Ticket creation error:', ticketErr);
    }

    // Increment promo usage
    if (promoCodeId) {
      try {
        const { data: promoRow } = await supabase
          .from('promo_codes')
          .select('times_used')
          .eq('id', promoCodeId)
          .single();

        if (promoRow) {
          await supabase
            .from('promo_codes')
            .update({ times_used: (promoRow.times_used || 0) + 1 })
            .eq('id', promoCodeId);
        }
      } catch (promoErr) {
        console.error('Promo increment error:', promoErr);
      }
    }

    // Increment sold count
    const newSold = (ticket.quantity_sold || 0) + quantity;
    await supabase
      .from('ticket_types')
      .update({ quantity_sold: newSold })
      .eq('id', ticket.id);

    // Log permanent stats for free tickets
    try {
      const { count: previousSales } = await supabase
        .from('platform_earnings')
        .select('id', { count: 'exact', head: true })
        .eq('event_title', eventData?.title || 'Unknown Event');

      const isFirstSale = previousSales === 0;

      await supabase.from('platform_earnings').insert([{
        order_reference: reference,
        event_title: eventData?.title || 'Unknown Event',
        buyer_email: buyerEmail,
        gross_amount: 0,
        platform_fee: 0,
        ticket_quantity: quantity,
        is_new_event: isFirstSale,
      }]);
    } catch (err) {
      console.error('Failed to log free ticket stats:', err);
    }

    // Notify organizer
    if (eventData?.organizer_id) {
      try {
        await createNotification({
          userId: eventData.organizer_id,
          type: 'ticket_sold',
          title: `🎟️ ${quantity} ticket${quantity === 1 ? '' : 's'} claimed for ${eventData.title}`,
          body: `${buyerEmail} just claimed ${quantity} free ticket${
            quantity === 1 ? '' : 's'
          }.`,
          link: `/event/${eventId}/analytics`,
        });
      } catch (notifErr) {
        console.error('Notification error:', notifErr);
      }
    }

    // Send ticket email
    try {
      const { data: event } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (event && ticket) {
        const emailResult = await sendTicketEmail({
          to: buyerEmail,
          name: buyerEmail.split('@')[0],
          event,
          ticket,
          orderId: reference,
          quantity,
          total: 0,
          ticketIds,
        });
      }
    } catch (emailErr) {
      console.error('FREE TICKET EMAIL FAILED:', emailErr.message || emailErr);
    }

    return NextResponse.json({ reference, success: true });
  } catch (err) {
    console.error('Free ticket error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to register' },
      { status: 500 }
    );
  }
}
