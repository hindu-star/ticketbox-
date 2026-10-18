'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import Navbar from '../../../../components/Navbar';
import Footer from '../../../../components/Footer';
import { supabase } from '../../../../lib/supabase';
import { getEvent, getTicketTypes } from '../../../../lib/events';
import { validatePromoCode } from '../../../../lib/promo';

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const { eventId, ticketId } = params;

  const [event, setEvent] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [user, setUser] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  // Promo state
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [promoChecking, setPromoChecking] = useState(false);

  useEffect(() => {
    if (!eventId || !ticketId) return;

    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          router.push(`/login?next=/checkout/${eventId}/${ticketId}`);
          return;
        }
        setUser(user);

        const ev = await getEvent(eventId);
        setEvent(ev);

        const tickets = await getTicketTypes(eventId);
        const t = tickets.find((x) => x.id === ticketId);

        if (!t) throw new Error('Ticket not found');
        setTicket(t);
      } catch (err) {
        console.error('Checkout load error:', err);
        setError(err.message || 'Failed to load checkout');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [eventId, ticketId, router]);

  const subtotal = ticket ? Number(ticket.price) * quantity : 0;

  const discount = appliedPromo
    ? Math.min(appliedPromo.discount, subtotal)
    : 0;

  const discountedSubtotal = subtotal - discount;
  const serviceFee = Math.round(discountedSubtotal * 0.05);
  const total = discountedSubtotal + serviceFee;

  async function applyPromoCode() {
    setPromoError('');
    setPromoChecking(true);

    try {
      const result = await validatePromoCode(eventId, promoInput, subtotal);
      if (!result.valid) {
        setPromoError(result.reason);
        setAppliedPromo(null);
        setPromoChecking(false);
        return;
      }

      setAppliedPromo({
        id: result.code.id,
        code: result.code.code,
        discount: result.discount,
        discount_type: result.code.discount_type,
        discount_value: result.code.discount_value,
      });
      setPromoInput('');
    } catch (err) {
      console.error(err);
      setPromoError(err.message || 'Failed to check code');
    } finally {
      setPromoChecking(false);
    }
  }

  function removePromo() {
    setAppliedPromo(null);
    setPromoError('');
  }

  async function handlePay() {
    setPaying(true);
    setError('');

    if (total === 0) {
      try {
        const res = await fetch('/api/paystack/free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId,
            ticketId,
            quantity,
            buyerEmail: user.email,
            promoCodeId: appliedPromo?.id || null,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to register');

        window.location.href = `/checkout/success?reference=${data.reference}`;
      } catch (err) {
        console.error('Free ticket error:', err);
        setError(err.message || 'Failed to register');
        setPaying(false);
      }
      return;
    }

    try {
      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          ticketId,
          quantity,
          buyerEmail: user.email,
          promoCodeId: appliedPromo?.id || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment init failed');

      window.location.href = data.authorization_url;
    } catch (err) {
      console.error('Pay error:', err);
      setError(err.message || 'Payment failed to start');
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="auth-page">
          <p style={{ color: '#64748b' }}>Loading checkout...</p>
        </div>
        <Footer />
      </>
    );
  }

  if (error && !event) {
    return (
      <>
        <Navbar />
        <div className="auth-page">
          <div className="auth-error">{error}</div>
          <Link href="/browse" className="content-btn-secondary">
            Back to events
          </Link>
        </div>
        <Footer />
      </>
    );
  }

  if (!event || !ticket) {
    return (
      <>
        <Navbar />
        <div className="auth-page">
          <p>Loading...</p>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="auth-page" style={{ maxWidth: 520 }}>
        <h1>Checkout</h1>
        <p>Review your order and complete payment.</p>

        {error && <div className="auth-error">{error}</div>}

        <div className="checkout-card">
          <div className="checkout-event-title">{event.title}</div>
          <div
            className="checkout-event-meta"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <MapPin size={14} /> {event.location}
          </div>
        </div>

        <div className="checkout-card">
          <div className="checkout-ticket-name">{ticket.name}</div>
          {ticket.description && (
            <div className="checkout-ticket-desc">{ticket.description}</div>
          )}

          <div className="quantity-row">
            <span>Quantity</span>
            <div className="quantity-controls">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                −
              </button>
              <span className="quantity-value">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(Math.min(10, quantity + 1))}
                disabled={quantity >= 10}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="checkout-card">
          {!appliedPromo ? (
            <>
              <label className="field-label">Have a promo code?</label>
              <div className="promo-checkout-row">
                <input
                  type="text"
                  placeholder="Enter code"
                  value={promoInput}
                  onChange={(e) =>
                    setPromoInput(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 20)
                    )
                  }
                />
                <button
                  type="button"
                  onClick={applyPromoCode}
                  disabled={!promoInput || promoChecking}
                  className="promo-apply-btn"
                >
                  {promoChecking ? '...' : 'Apply'}
                </button>
              </div>
              {promoError && (
                <p className="promo-error-text">{promoError}</p>
              )}
            </>
          ) : (
            <div className="promo-applied-row">
              <div>
                <div className="promo-applied-label">
                  Code applied: <strong>{appliedPromo.code}</strong>
                </div>
                <div className="promo-applied-meta">
                  {appliedPromo.discount_type === 'percent'
                    ? `${appliedPromo.discount_value}% off`
                    : `₦${Number(
                        appliedPromo.discount_value
                      ).toLocaleString()} off`}
                </div>
              </div>
              <button
                type="button"
                className="promo-remove-btn"
                onClick={removePromo}
              >
                Remove
              </button>
            </div>
          )}
        </div>

        <div className="checkout-summary">
          <div className="summary-row">
            <span>
              Subtotal ({quantity} × ₦{Number(ticket.price).toLocaleString()})
            </span>
            <span>₦{subtotal.toLocaleString()}</span>
          </div>

          {appliedPromo && discount > 0 && (
            <div className="summary-row summary-discount">
              <span>
                Discount ({appliedPromo.code})
              </span>
              <span>−₦{discount.toLocaleString()}</span>
            </div>
          )}

          <div className="summary-row">
            <span>Service fee (5%)</span>
            <span>₦{serviceFee.toLocaleString()}</span>
          </div>

          <div className="summary-row summary-total">
            <span>Total</span>
            <span>₦{total.toLocaleString()}</span>
          </div>
        </div>

        <button
          onClick={handlePay}
          disabled={paying}
          className="checkout-pay-btn"
        >
          {paying
            ? 'Please wait...'
            : total === 0
            ? 'Get free ticket'
            : `Pay ₦${total.toLocaleString()}`}
        </button>

        <p
          style={{
            fontSize: 13,
            color: '#64748b',
            textAlign: 'center',
            marginTop: 12,
          }}
        >
          {total === 0
            ? 'Free event — no payment required'
            : 'Secure payment powered by Paystack'}
        </p>
      </div>
      <Footer />
    </>
  );
      }
