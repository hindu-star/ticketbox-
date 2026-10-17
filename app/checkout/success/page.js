'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../../../components/Navbar';
import Footer from '../../../components/Footer';

function SuccessContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get('reference');
  const [status, setStatus] = useState('verifying');
  const [order, setOrder] = useState(null);
  const [eventName, setEventName] = useState('');

  useEffect(() => {
    async function verify() {
      if (!reference) {
        setStatus('error');
        return;
      }

      try {
        const res = await fetch(`/api/paystack/verify?reference=${reference}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Verification failed');

        setOrder(data.order);
        // The verify API returns the order which contains event_id
        // We fetch the event title directly for the display block
        if (data.order?.event_id) {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
          );
          const { data: ev } = await supabase
            .from('events')
            .select('title')
            .eq('id', data.order.event_id)
            .single();
          
          if (ev) setEventName(ev.title);
        }

        setStatus('success');
      } catch (err) {
        console.error(err);
        setStatus('error');
      }
    }
    verify();
  }, [reference]);

  if (status === 'verifying') {
    return (
      <div className="auth-page" style={{ textAlign: 'center' }}>
        <div className="success-icon">⏳</div>
        <h1>Verifying payment...</h1>
        <p>Please wait a moment.</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="auth-page" style={{ textAlign: 'center' }}>
        <div className="success-icon">⚠️</div>
        <h1>Something went wrong</h1>
        <p>We couldn't verify your payment. Please check your email or contact support.</p>
        <Link href="/browse" className="content-btn-primary">
          Back to events
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-page" style={{ textAlign: 'center', maxWidth: 520 }}>
      <div className="success-icon">🎉</div>
      <h1>You're going!</h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>
        Your payment was successful and your ticket confirmation has been sent to your email.
      </p>

      {order && (
        <div className="checkout-summary" style={{ textAlign: 'left', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          
          <div className="summary-row" style={{ alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, color: '#64748b' }}>Event</span>
            <span style={{ fontWeight: 700, color: '#111' }}>
              {eventName || 'Your Event'}
            </span>
          </div>

          <div className="summary-row" style={{ alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, color: '#64748b' }}>Order ID</span>
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#111', background: '#fff', padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              {order.paystack_reference}
            </span>
          </div>

          <div className="summary-row summary-total" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
            <span>Total Paid</span>
            <span style={{ fontSize: 20, color: '#16a34a' }}>
              ₦{Number(order.total).toLocaleString()}
            </span>
          </div>

        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <Link href="/browse" className="content-btn-primary">
          Browse more events
        </Link>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <>
      <Navbar />
      <Suspense fallback={
        <div className="auth-page" style={{ textAlign: 'center' }}>
          <p>Loading...</p>
        </div>
      }>
        <SuccessContent />
      </Suspense>
      <Footer />
    </>
  );
              }
