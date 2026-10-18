'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, Calendar } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { supabase } from '../../lib/supabase';
import {
  getMyEvents,
  deleteEvent,
  publishEvent,
  unpublishEvent,
  getEventStats,
} from '../../lib/events';

function formatNaira(n) {
  return `₦${Number(n || 0).toLocaleString()}`;
}

export default function MyEventsPage() {
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const router = useRouter();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      try {
        const myEvents = await getMyEvents(user.id);
        setEvents(myEvents);

        const statsMap = {};
        await Promise.all(
          myEvents.map(async (e) => {
            try {
              statsMap[e.id] = await getEventStats(e.id);
            } catch (err) {
              statsMap[e.id] = { ticketsSold: 0, revenue: 0 };
            }
          })
        );
        setStats(statsMap);
      } catch (err) {
        setError(err.message || 'Failed to load events');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const now = new Date();

  function isEnded(e) {
    const dateStr = e.end_date || e.event_date;
    if (!dateStr) return false;
    const endDateTime = e.end_time
      ? new Date(`${dateStr}T${e.end_time}`)
      : new Date(`${dateStr}T23:59`);
    return endDateTime < now;
  }

  const allEvents = events;
  const publishedEvents = events.filter(
    (e) => e.status !== 'draft' && !isEnded(e)
  );
  const draftEvents = events.filter((e) => e.status === 'draft');
  const endedEvents = events.filter(
    (e) => e.status !== 'draft' && isEnded(e)
  );

  const visibleEvents =
    tab === 'published'
      ? publishedEvents
      : tab === 'drafts'
      ? draftEvents
      : tab === 'ended'
      ? endedEvents
      : allEvents;

  async function handleDelete(id, title) {
    const confirmed = window.confirm(
      `Delete "${title}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setBusyId(id);
    try {
      await deleteEvent(id);
      setEvents(events.filter((e) => e.id !== id));
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handlePublish(id) {
    setBusyId(id);
    try {
      await publishEvent(id);
      setEvents(
        events.map((e) =>
          e.id === id ? { ...e, status: 'published' } : e
        )
      );
    } catch (err) {
      alert('Failed to publish: ' + err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnpublish(id) {
    const confirmed = window.confirm(
      'Unpublish this event? It will be hidden from the public and moved to Drafts.'
    );
    if (!confirmed) return;

    setBusyId(id);
    try {
      await unpublishEvent(id);
      setEvents(
        events.map((e) =>
          e.id === id ? { ...e, status: 'draft' } : e
        )
      );
    } catch (err) {
      alert('Failed to unpublish: ' + err.message);
    } finally {
      setBusyId(null);
    }
  }

  const tabs = [
    { id: 'all', label: 'All', count: allEvents.length },
    { id: 'published', label: 'Published', count: publishedEvents.length },
    { id: 'drafts', label: 'Drafts', count: draftEvents.length },
    { id: 'ended', label: 'Ended', count: endedEvents.length },
  ];

  return (
    <>
      <Navbar />
      <div className="dashboard-page">
        <div className="dashboard-header">
          <div>
            <h1>My Events</h1>
            <p>Manage the events you&apos;ve created.</p>
          </div>
          <Link href="/create" className="dashboard-create-btn">
            + Create event
          </Link>
        </div>

        <div className="dash-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`dash-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.count > 0 && (
                <span className="dash-tab-count">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {error && <div className="auth-error">{error}</div>}

        {loading ? (
          <p style={{ color: '#64748b' }}>Loading your events...</p>
        ) : visibleEvents.length === 0 ? (
          <div className="empty-state">
            {tab === 'all' && (
              <>
                <p>You haven&apos;t created any events yet.</p>
                <Link href="/create">Create your first event</Link>
              </>
            )}
            {tab === 'published' && <p>No published events.</p>}
            {tab === 'drafts' && <p>No drafts saved.</p>}
            {tab === 'ended' && <p>No ended events yet.</p>}
          </div>
        ) : (
          <div className="dashboard-list">
            {visibleEvents.map((e) => {
              const ended = isEnded(e);
              const isDraft = e.status === 'draft';
              const s = stats[e.id] || { ticketsSold: 0, revenue: 0 };

              return (
                <div key={e.id} className="dashboard-row">
                  <div className="dashboard-row-img">
                    {e.image_url ? (
                      <img src={e.image_url} alt={e.title} />
                    ) : (
                      <span>{e.emoji || '🎉'}</span>
                    )}
                  </div>
                  <div className="dashboard-row-info">
                    <div className="dashboard-row-title">
                      {e.title}
                      {isDraft && (
                        <span className="draft-badge">Draft</span>
                      )}
                      {!isDraft && ended && (
                        <span className="ended-badge">Ended</span>
                      )}
                    </div>
                    <div
                      className="dashboard-row-meta"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <MapPin size={13} /> {e.location}
                      </span>
                      <span>·</span>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Calendar size={13} />{' '}
                        {e.event_date
                          ? new Date(e.event_date).toLocaleDateString(
                              'en-GB',
                              {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              }
                            )
                          : 'TBA'}
                      </span>
                    </div>
                    <div className="dashboard-row-stats">
                      <span className="dash-stat">
                        🎟️ <strong>{s.ticketsSold}</strong> sold
                      </span>
                      <span className="dash-stat">
                        💰 <strong>{formatNaira(s.revenue)}</strong> earned
                      </span>
                      <Link
                        href={`/event/${e.id}/analytics`}
                        className="dash-stat-link"
                      >
                        View analytics →
                      </Link>
                    </div>
                  </div>
                  <div className="dashboard-row-actions">
                    <Link href={`/event/${e.id}`} className="dash-btn">
                      View
                    </Link>
                    <Link
                      href={`/my-events/edit/${e.id}`}
                      className="dash-btn"
                    >
                      Edit
                    </Link>
                    {!isDraft && (
                      <Link
                        href={`/my-events/checkin/${e.id}`}
                        className="dash-btn"
                      >
                        Check-in
                      </Link>
                    )}
                    {isDraft ? (
                      <button
                        onClick={() => handlePublish(e.id)}
                        disabled={busyId === e.id}
                        className="dash-btn dash-btn-primary"
                      >
                        {busyId === e.id ? '...' : 'Publish'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUnpublish(e.id)}
                        disabled={busyId === e.id}
                        className="dash-btn"
                      >
                        {busyId === e.id ? '...' : 'Unpublish'}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(e.id, e.title)}
                      disabled={busyId === e.id}
                      className="dash-btn dash-btn-danger"
                    >
                      {busyId === e.id ? '...' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
          }
