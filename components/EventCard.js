import Link from 'next/link';
import { MapPin } from 'lucide-react';

export default function EventCard({ event }) {
  return (
    <Link href={`/event/${event.id}`} className="event-card">
      <div className="event-card-media">
        {event.image_url ? (
          <img
            src={event.image_url}
            alt={event.title}
            className="event-card-img-real"
          />
        ) : (
          <div className="event-card-img">
            {/* Fallback for events without images */}
            <span style={{ fontSize: '32px' }}>
              {event.emoji || '🎉'}
            </span>
          </div>
        )}
        {event.soldOut && (
          <div className="sold-out-badge">SOLD OUT</div>
        )}
      </div>
      <div className="event-card-body">
        <div className="event-card-date">{event.date}</div>
        <div className="event-card-title">{event.title}</div>
        
        {/* Replaced the 📍 emoji with a Lucide MapPin icon */}
        <div className="event-card-loc" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <MapPin size={14} />
          {event.location}
        </div>
        
        <div className="event-card-price">{event.price}</div>
      </div>
    </Link>
  );
          }
