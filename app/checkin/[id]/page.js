'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Ticket } from 'lucide-react';
import Navbar from '../../../components/Navbar';
import Footer from '../../../components/Footer';
import {
  getEvent,
  getCheckInPin,
  checkInTicket,
  getCheckInStatsByTickets,
} from '../../../lib/events';

export default function PublicCheckInPage() {
  const params = useParams();
  const eventId = params.id;

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState(null);
  const [error, setError] = useState('');

  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [manualRef, setManualRef] = useState('');

  const html5QrRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const ev = await getEvent(eventId);
        setEvent(ev);
      } catch (err) {
        setError('Event not found');
      } finally {
        setLoading(false);
      }
    }
    if (eventId) load();
  }, [eventId]);

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

  async function handleVerifyPin(e) {
    e.preventDefault();
    setPinError('');

    try {
      const actualPin = await getCheckInPin(eventId);
      if (!actualPin) {
        setPinError('No PIN set for this event. Organizer must set one first.');
        return;
      }

      if (actualPin === pinInput) {
        setUnlocked(true);
        loadStats();
      } else {
        setPinError('Incorrect PIN');
      }
    } catch (err) {
      setPinError('Failed to verify PIN');
    }
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
        </div>
        <Footer />
      </>
    );
  }

  // === PIN SCREEN ===
  if (!unlocked) {
    return (
      <>
        <Navbar />
        <div className="checkin-page">
          <div className="checkin-header">
            <h1>Enter PIN</h1>
            <p className="analytics-subtitle">{event.title}</p>
          </div>

          <form className="auth-form" onSubmit={handleVerifyPin}>
            {pinError && <div className="auth-error">{pinError}</div>}

            <input
              type="text"
              inputMode="numeric"
              placeholder="4-digit PIN"
              value={pinInput}
              onChange={(e) =>
                setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              maxLength={6}
              required
              autoFocus
            />
            <button type="submit">Unlock Scanner</button>
          </form>
        </div>
        <Footer />
      </>
    );
  }

  // === SCANNER SCREEN ===
  return (
    <>
      <Navbar />
      <div className="checkin-page">
        <div className="checkin-header">
          <h1>Check-in</h1>
          <p className="analytics-subtitle">{event.title}</p>
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
      </div>
      <Footer />
    </>
  );
}
