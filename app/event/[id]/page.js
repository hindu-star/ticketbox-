import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { Calendar, Clock, MapPin } from 'lucide-react';
import Navbar from '../../../components/Navbar';
import Footer from '../../../components/Footer';
import ShareButton from '../../../components/ShareButton';
import EventTickets from '../../../components/EventTickets';
import DraftBanner from '../../../components/DraftBanner';
import { getEvent, getTicketTypes, isEventEnded } from '../../../lib/events';

export const dynamic = 'force-dynamic';

const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function generateMetadata({ params }) {
  try {
    const event = await getEvent(params.id);

    if (!event) {
      return { title: 'Event not found — TicketBox' };
    }

    const descPlain = (event.description || '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 160)
      .trim();

    const description =
      descPlain || `Get your tickets for ${event.title} on TicketBox.`;

    const imageUrl = event.image_url;

    return {
      title: `${event.title} — TicketBox`,
      description,
      metadataBase: new URL('https://ticketbox.com.ng'),
      alternates: {
        canonical: `https://ticketbox.com.ng/event/${event.id}`,
      },
      openGraph: {
        title: event.title,
        description,
        url: `https://ticketbox.com.ng/event/${event.id}`,
        siteName: 'TicketBox',
        locale: 'en_NG',
        type: 'website',
        images: imageUrl
          ? [
              {
                url: imageUrl,
                secureUrl: imageUrl,
                width: 1200,
                height: 630,
                alt: event.title,
              },
            ]
          : [],
      },
      twitter: {
        card: 'summary_large_image',
        title: event.title,
        description,
        images: imageUrl ? [imageUrl] : [],
      },
    };
  } catch (err) {
    return { title: 'Event — TicketBox' };
  }
}

export default async function EventPage({ params }) {
  let event;
  let tickets = [];
  let organizer = null;

  try {
    event = await getEvent(params.id);
    tickets = await getTicketTypes(params.id);

    if (event.organizer_id) {
      const { data } = await supabasePublic
        .from('profiles')
        .select('username, display_name, profile_picture_url')
        .eq('id', event.organizer_id)
        .maybeSingle();
      organizer = data;
    }
  } catch (err) {
    notFound();
  }

  if (!event) notFound();

  const isDraft = event.status === 'draft';
  const ended = isEventEnded(event);
  const theme = event.theme || 'classic';

  const formattedDate = event.event_date
    ? new Date(event.event_date).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Date coming soon';

  return (
    <>
      <Navbar />
      {isDraft && <DraftBanner eventId={event.id} />}
      <div className={`event-detail theme-${theme}`}>
        {event.image_url ? (
          <img
            src={event.image_url}
            alt={event.title}
            className="event-hero-img"
          />
        ) : (
          <div className="event-hero">{event.emoji || '🎉'}</div>
        )}
        <div className="event-info">
          <div className="event-title-row">
            <h1>{event.title}</h1>
            <ShareButton eventId={event.id} title={event.title} />
          </div>

          {organizer && organizer.username && (
            <Link
              href={`/u/${organizer.username}`}
              className="event-organizer-link"
            >
              {organizer.profile_picture_url ? (
                <img
                  src={organizer.profile_picture_url}
                  alt={organizer.display_name || organizer.username}
                  className="event-organizer-avatar"
                />
              ) : (
                <div className="event-organizer-avatar event-organizer-avatar-fallback">
                  {(organizer.display_name || organizer.username)[0].toUpperCase()}
                </div>
              )}
              <span>
                Organized by{' '}
                <strong>{organizer.display_name || organizer.username}</strong>
              </span>
            </Link>
          )}

          <div className="event-meta">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={16} /> {formattedDate}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} /> {event.event_time || 'Time TBA'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={16} /> {event.location}
            </div>
          </div>

          {ended && (
            <div className="event-ended-banner">
              <strong>This event has ended.</strong> Tickets are no longer
              available.
            </div>
          )}

          <div
            className="event-desc"
            dangerouslySetInnerHTML={{
              __html: event.description || '<p>Full details coming soon.</p>',
            }}
          />

          <h2 className="ticket-heading">Tickets</h2>
          <EventTickets
            eventId={event.id}
            tickets={tickets}
            ended={ended}
          />
        </div>
      </div>
      <Footer />
    </>
  );
  }
