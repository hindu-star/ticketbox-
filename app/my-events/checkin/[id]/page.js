'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Ticket } from 'lucide-react';
import Navbar from '../../../../components/Navbar';
import Footer from '../../../../components/Footer';
import { supabase } from '../../../../lib/supabase';
import {
  getEvent,
  getCheckInPin,
  setCheckInPin,
  checkInTicket,
  getCheckInStatsByTickets,
} from '../../../../lib/events';

const PIN_STORAGE_PREFIX = 'tb_checkin_pin_';

export default function CheckInPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.id;

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState(null);
  const [error, setError] = useState('');

  const [storedPin, setStoredPin] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupPin, setSetupPin] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);

  const [showChangePin, setShowChangePin] = useState(false);
  const [copied, setCopied] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [manualRef, setManualRef] = useState('');

  const html5QrRef = useRef(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      try {
        const ev = await getEvent(eventId);

        if (ev.organizer_id !== user.id) {
          router.push('/my-events');
          return;
        }

        setEvent(ev);

        const pin = await getCheckInPin(eventId);

        if (!pin) {
          setNeedsSetup(true);
        } else {
          setStoredPin(pin);
          loadStats();
        }
      } catch (err) {
        setError(err.message || 'Failed to load event');
      } finally {
        setLoading(false);
      }
    }
    if (eventId) load();
  }, [eventId, router]);

  useEffect(() => {
    return () => {
      if (html5QrRef.current) {
        try {
          html5QrRef.current.stop().catch(() => {});
        } catch (e) {}
      }
    };
  }, []);

  async function loadStats() {
    try {
      const s = await getCheckInStatsByTickets(eventId);
      setStats(s);
    } catch (err) {
      console.error('Stats error:', err);
    }
  }

  async function handleSetupPin(e) {
    e.preventDefault();
    if (setupPin.length < 4) {
      setPinError('PIN must be at least 4 digits');
      return;
    }
    if (setupPin !== setupConfirm) {
      setPinError('PINs do not match');
      return;
    }

    setSetupSaving(true);
    try {
      await setCheckInPin(eventId, setupPin);
      localStorage.setItem(PIN_STORAGE_PREFIX + eventId, setupPin);
      setStoredPin(setupPin);
      setNeedsSetup(false);
      setPinError('');
      setShowChangePin(false);
      setSetupPin('');
      setSetupConfirm('');
      loadStats();
    } catch (err) {
      setPinError(err.message || 'Failed to save PIN');
    } finally {
      setSetupSaving(false);
    }
  }

  function copyShareLink() {
    const url = `${window.location.origin}/checkin/${eventId}`;
    navigator.clipboard.writeText(`${url}\nPIN: ${storedPin}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function startScanner() {
    setScanResult(null);
    setScanning(true);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      await new Promise((r) => setTimeout(r, 100));

      const scanner = new Html5Qrcode('qr-reader');
      html5QrRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          try {
            await scanner.pause(true);
          } catch (e) {}
          await handleDecoded(decodedText);
        },
        () => {}
      );
    } catch (err) {
      console.error('Scanner error:', err);
      setScanResult({
        status: 'camera_error',
        message: 'Could not access camera. Check permissions.',
      });
      setScanning(false);
    }
  }

  async function stopScanner() {
    const scanner = html5QrRef.current;
    if (scanner) {
      try {
        await scanner.stop();
        await scanner.clear();
      } catch (e) {}
      html5QrRef.current = null;
    }
    setScanning(false);
  }

  async function handleDecoded(decodedText) {
    let ticketId = decodedText;
    try {
      const parsed = JSON.parse(decodedText);
      if (parsed && parsed.ticketId) ticketId = parsed.ticketId;
    } catch (e) {}
    await processReference(ticketId);
  }

  async function processReference(reference) {
    try {
      const result = await checkInTicket(reference);
      setScanResult(result);
      loadStats();
    } catch (err) {
      setScanResult({
        status: 'error',
        message: err.message || 'Something went wrong',
      });
    }
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    if (!manualRef.trim()) return;
    setScanResult(null);
    processReference(manualRef.trim());
    setManualRef('');
  }

  async function handleScanNext() {
    setScanResult(null);
    if (html5QrRef.current) {
      try {
        await html5QrRef.current.resume();
      } catch (e) {
        await stopScanner();
        startScanner();
      }
    } else {
      startScanner();
    }
  }

  function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="checkin-page">
          <p style={{ color: '#64748b' }}>Loading...</p>
        </div>
        <Footer />
      </>
    );
  }

  if (error || !event) {
    return (
      <>
        <Navbar />
        <div className="checkin-page">
          <div className="auth-error">{error || 'Event not found'}</div>
          <Link href="/my-events" className="content-btn-secondary">
            Back to My Events
          </Link>
        </div>
        <Footer />
      </>
    );
  }

  // === PIN SETUP / CHANGE ===
  if (needsSetup || showChangePin) {
    return (
      <>
        <Navbar />
        <div className="checkin-page">
          <div className="checkin-header">
            <Link href="/my-events" className="analytics-back">
              ← Back to My Events
            </Link>
            <h1>{needsSetup ? 'Set up check-in' : 'Change PIN'}</h1>
            <p className="analytics-subtitle">
              {needsSetup
                ? 'Create a PIN for scanning tickets. Share it with door staff.'
                : 'Enter a new PIN. Old links will stop working immediately.'}
            </p>
          </div>

          <form className="auth-form" onSubmit={handleSetupPin}>
            {pinError && <div className="auth-error">{pinError}</div>}

            <input
              type="text"
              inputMode="numeric"
              placeholder="New 4-digit PIN"
              value={setupPin}
              onChange={(e) =>
                setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              maxLength={6}
              required
              autoFocus
            />
            <input
              type="text"
              inputMode="numeric"
              placeholder="Confirm new PIN"
              value={setupConfirm}
              onChange={(e) =>
                setSetupConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              maxLength={6}
              required
            />
            <button type="submit" disabled={setupSaving}>
              {setupSaving ? 'Saving...' : 'Save new PIN'}
            </button>

            {showChangePin && (
              <button
                type="button"
                className="promo-cancel-btn"
                onClick={() => setShowChangePin(false)}
                style={{ marginTop: 10 }}
              >
                Cancel
              </button>
            )}
          </form>
        </div>
        <Footer />
      </>
    );
  }

  // === SCANNER ===
  return (
    <>
      <Navbar />
      <div className="checkin-page">
        <div className="checkin-header">
          <Link href="/my-events" className="analytics-back">
            ← Back to My Events
          </Link>
          <h1>Check-in</h1>
          <p className="analytics-subtitle">{event.title}</p>
        </div>

        {/* SHARE BOX */}
        <div className="share-link-box">
          <div className="share-link-title">Share with door staff</div>
          <p className="share-link-desc">
            Send this link and PIN to your helpers. They won&apos;t need to log in.
          </p>
          <div className="share-link-row">
            <span className="share-link-text">
              {typeof window !== 'undefined'
                ? `${window.location.origin}/checkin/${eventId}`
                : `/checkin/${eventId}`}
            </span>
            <span className="share-pin-text">PIN: {storedPin}</span>
          </div>
          <div className="share-link-actions">
            <button
              type="button"
              className="share-copy-btn"
              onClick={copyShareLink}
            >
              {copied ? '✅ Copied!' : '📋 Copy Link & PIN'}
            </button>
            <button
              type="button"
              className="share-change-pin-btn"
              onClick={() => setShowChangePin(true)}
            >
              Change PIN
            </button>
          </div>
        </div>

        {stats && (
          <div className="checkin-stats">
            <div className="checkin-stat">
              <div
                className="checkin-stat-label"
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <CheckCircle2 size={12} /> Checked in
              </div>
              <div className="checkin-stat-value">
                {stats.checkedInTickets} / {stats.totalTickets}
              </div>
            </div>
            <div className="checkin-stat">
              <div
                className="checkin-stat-label"
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Ticket size={12} /> Remaining
              </div>
              <div className="checkin-stat-value">
                {stats.totalTickets - stats.checkedInTickets}
              </div>
            </div>
          </div>
        )}

        <div
          id="qr-reader"
          className="qr-reader-box"
          style={{
            display: scanning ? 'block' : 'none',
            width: '100%',
            borderRadius: '16px',
            overflow: 'hidden',
            background: '#000',
          }}
        />

        {!scanning && !scanResult && (
          <button type="button" className="checkin-scan-btn" onClick={startScanner}>
            📷 Start scanning
          </button>
        )}

        {scanning && !scanResult && (
          <button type="button" className="checkin-stop-btn" onClick={stopScanner}>
            Stop camera
          </button>
        )}

        {scanResult && (
          <div className={`scan-result scan-result-${scanResult.status}`}>
            {scanResult.status === 'success' && (
              <>
                <div className="scan-result-icon">✅</div>
                <div className="scan-result-title">Checked in!</div>
                <div className="scan-result-body">
                  <div>{scanResult.order?.buyer_email || 'Valid ticket'}</div>
                  <div>Ticket #{scanResult.ticket_number || '1'}</div>
                </div>
              </>
            )}

            {scanResult.status === 'already_checked_in' && (
              <>
                <div className="scan-result-icon">⚠️</div>
                <div className="scan-result-title">Already checked in</div>
                <div className="scan-result-body">
                  <div>{scanResult.order?.buyer_email || 'Valid ticket'}</div>
                  <div>Scanned at {formatTime(scanResult.ticket?.checked_in_at)}</div>
                </div>
              </>
            )}

            {scanResult.status === 'not_paid' && (
              <>
                <div className="scan-result-icon">❌</div>
                <div className="scan-result-title">Not paid</div>
                <div className="scan-result-body">
                  <div>{scanResult.order?.buyer_email || ''}</div>
                </div>
              </>
            )}

            {scanResult.status === 'not_found' && (
              <>
                <div className="scan-result-icon">❌</div>
                <div className="scan-result-title">Invalid ticket</div>
              </>
            )}

            {scanResult.status === 'camera_error' && (
              <>
                <div className="scan-result-icon">📷</div>
                <div className="scan-result-title">Camera error</div>
                <div className="scan-result-body">{scanResult.message}</div>
              </>
            )}

            {scanResult.status === 'error' && (
              <>
                <div className="scan-result-icon">⚠️</div>
                <div className="scan-result-title">Error</div>
                <div className="scan-result-body">{scanResult.message}</div>
              </>
            )}

            <button type="button" className="scan-next-btn" onClick={handleScanNext}>
              Scan next →
            </button>
          </div>
        )}

        <div className="checkin-manual">
          <label>Or paste a ticket ID manually</label>
          <form onSubmit={handleManualSubmit} className="checkin-manual-form">
            <input
              type="text"
              placeholder="Paste ticket ID from email"
              value={manualRef}
              onChange={(e) => setManualRef(e.target.value)}
            />
            <button type="submit">Check in</button>
          </form>
        </div>

        {stats && stats.recent.length > 0 && (
          <div className="checkin-recent">
            <h2>Recently checked in</h2>
            <div className="checkin-recent-list">
              {stats.recent.map((t) => (
                <div key={t.id} className="checkin-recent-row">
                  <div>
                    <div className="checkin-recent-email">
                      {t.orders?.buyer_email || 'Buyer'}
                    </div>
                    <div className="checkin-recent-meta">
                      Ticket #{t.ticket_number}
                    </div>
                  </div>
                  <div className="checkin-recent-time">
                    {formatTime(t.checked_in_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
                }
