'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import InviteUnlocker from './InviteUnlocker';

export default function EventTickets({ eventId, tickets, ended }) {
  const [unlockedIds, setUnlockedIds] = useState([]);

  const publicTickets = tickets.filter((t) => !t.is_invite_only);
  const inviteTickets = tickets.filter((t) => t.is_invite_only);

  const visibleInviteTickets = inviteTickets.filter((t) =>
    unlockedIds.includes(t.id)
  );

  const visibleTickets = [...publicTickets, ...visibleInviteTickets];

  function handleUnlock(ids) {
    setUnlockedIds(ids);
  }

  return (
    <>
      {visibleTickets.length === 0 && inviteTickets.length === 0 ? (
        <p style={{ color: '#64748b' }}>No tickets available yet.</p>
      ) : visibleTickets.length === 0 ? (
        <p style={{ color: '#64748b' }}>This event is invite-only.</p>
      ) : (
        <div className="ticket-list">
          {visibleTickets.map((t) => {
            const remaining = t.capacity
              ? t.capacity - (t.quantity_sold || 0)
              : null;
            const soldOut = remaining !== null && remaining <= 0;
            const isFree =
              t.ticket_kind === 'free' || Number(t.price) === 0;
            const perks = Array.isArray(t.perks) ? t.perks : [];

            return (
              <div key={t.id} className="ticket-row">
                <div className="ticket-row-main">
                  <div className="ticket-name">
                    {t.name}
                    {t.is_invite_only && (
                      <span className="ticket-badge invite">Invite-only</span>
                    )}
                  </div>
                  <div className="ticket-desc">
                    {t.description || 'General admission'}
                  </div>

                  {perks.length > 0 && (
                    <ul className="ticket-perks">
                      {perks.map((p, idx) => (
                        <li
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Check size={14} color="#16a34a" /> {p}
                        </li>
                      ))}
                    </ul>
                  )}

                  {t.capacity && (
                    <div
                      className={`ticket-remaining ${
                        soldOut ? 'sold-out' : ''
                      }`}
                    >
                      {soldOut
                        ? 'Sold out'
                        : `${remaining} of ${t.capacity} remaining`}
                    </div>
                  )}
                  {t.order_limit && t.order_limit > 1 && (
                    <div className="ticket-order-limit">
                      Max {t.order_limit} per person
                    </div>
                  )}
                </div>
                <div className="ticket-right">
                  <div className="ticket-price">
                    {isFree
                      ? 'Free'
                      : `₦${Number(t.price).toLocaleString()}`}
                  </div>
                  {ended ? (
                    <span className="ticket-soldout-btn">Ended</span>
                  ) : soldOut ? (
                    <span className="ticket-soldout-btn">Sold out</span>
                  ) : (
                    <Link
                      href={`/checkout/${eventId}/${t.id}`}
                      className="ticket-buy"
                    >
                      Buy
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!ended && inviteTickets.length > 0 && (
        <InviteUnlocker
          inviteTickets={inviteTickets}
          onUnlock={handleUnlock}
        />
      )}
    </>
  );
                    }
