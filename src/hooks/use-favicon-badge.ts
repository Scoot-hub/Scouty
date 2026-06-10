import { useEffect, useRef } from 'react';

// ── Cross-tab favicon sync ─────────────────────────────────────────────────────
// Same channel name as use-notifications.ts. BroadcastChannel instances with the
// same name are all connected — the sender never receives its own message.
const faviconBc = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('scouty-notifications')
  : null;

// ── Helpers ────────────────────────────────────────────────────────────────────

function getFaviconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  return link;
}

function renderFavicon(count: number, base: HTMLImageElement | null): string {
  const SIZE = 32;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  if (base) {
    ctx.drawImage(base, 0, 2, SIZE, SIZE - 2);
  } else {
    ctx.fillStyle = '#6366f1';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(2, 2, SIZE - 4, SIZE - 4, 8);
    } else {
      ctx.rect(2, 2, SIZE - 4, SIZE - 4);
    }
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', SIZE / 2, SIZE / 2);
  }

  if (count <= 0) return canvas.toDataURL('image/png');

  // Cap at 9 — show "9+" beyond that
  const label = count > 9 ? '9+' : String(count);
  const isLong = label.length > 1; // "9+"
  if (!isLong) {
    // Single digit → perfect circle top-left
    const r = 11;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 19px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, r, r + 0.5);
  } else {
    // "9+" → rounded rectangle
    const fontSize = 15;
    ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const PAD = 1;
    const CORNER = 7;
    const metrics = ctx.measureText(label);
    const tw = metrics.width;
    const th = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const rw = Math.round(tw) + PAD * 2;
    const rh = Math.round(th) + PAD + 3;

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(0, 0, rw, rh, CORNER);
    } else {
      ctx.rect(0, 0, rw, rh);
    }
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, PAD, PAD);
  }

  return canvas.toDataURL('image/png');
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useFaviconBadge(unreadCount: number) {
  const baseImgRef       = useRef<HTMLImageElement | null>(null);
  const originalHrefRef  = useRef<string | null>(null);
  const originalTitleRef = useRef<string>(document.title);
  const prevCountRef     = useRef<number>(unreadCount);

  // Timer refs — separate alarm phase from steady blink
  const alarmTimeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef         = useRef(unreadCount);
  countRef.current       = unreadCount;

  // ── Load /logo.png once as favicon base ───────────────────────────────────
  useEffect(() => {
    const link = getFaviconLink();
    originalHrefRef.current = link.href;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    const paint = () => { getFaviconLink().href = renderFavicon(countRef.current, baseImgRef.current); };
    img.onload  = () => { baseImgRef.current = img; paint(); };
    img.onerror = () => { paint(); };
    img.src = '/logo.png';

    return () => {
      if (originalHrefRef.current !== null) getFaviconLink().href = originalHrefRef.current;
    };
  }, []);

  // ── Cross-tab favicon sync: receive count from other tabs ─────────────────
  // Only updates the favicon — does NOT trigger any refetch or popup logic.
  useEffect(() => {
    if (!faviconBc) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'UNREAD_COUNT_CHANGED') return;
      const count = event.data.count as number;
      getFaviconLink().href = renderFavicon(count, baseImgRef.current);
    };
    faviconBc.addEventListener('message', handler);
    return () => faviconBc.removeEventListener('message', handler);
  }, []);

  // ── Main effect: fires on every count change ──────────────────────────────
  useEffect(() => {
    const BASE_TITLE   = originalTitleRef.current;
    const NOTIF_TITLE  = `(${unreadCount > 9 ? '9+' : unreadCount}) 🔔 Scouty`;
    const increased    = unreadCount > prevCountRef.current;
    prevCountRef.current = unreadCount;

    // 1. Repaint favicon badge
    getFaviconLink().href = renderFavicon(unreadCount, baseImgRef.current);

    // 2. Broadcast the new count to other tabs so their favicon updates immediately.
    //    Using a dedicated message type (UNREAD_COUNT_CHANGED) keeps this separate
    //    from NOTIFICATIONS_CHANGED, which would trigger refetches and popup logic.
    faviconBc?.postMessage({ type: 'UNREAD_COUNT_CHANGED', count: unreadCount });

    // ── Helpers ──────────────────────────────────────────────────────────────
    const clearAll = () => {
      if (alarmTimeoutRef.current)  { clearTimeout(alarmTimeoutRef.current);  alarmTimeoutRef.current  = null; }
      if (flashIntervalRef.current) { clearInterval(flashIntervalRef.current); flashIntervalRef.current = null; }
    };

    const stopFlash = () => {
      clearAll();
      document.title = BASE_TITLE;
    };

    // Steady slow blink while tab stays hidden
    const startSlowBlink = () => {
      if (flashIntervalRef.current) return;
      let alt = false;
      flashIntervalRef.current = setInterval(() => {
        document.title = alt ? BASE_TITLE : NOTIF_TITLE;
        alt = !alt;
      }, 1200);
    };

    // Rapid "alarm" phase: N fast blinks, then switch to slow blink
    const startAlarm = () => {
      clearAll();
      const FAST_MS    = 320;
      const ALARM_REPS = 5; // 5 × 320 ms ≈ 1.6 s of rapid flash
      let   tick       = 0;
      document.title = NOTIF_TITLE;

      const alarmInterval = setInterval(() => {
        tick++;
        document.title = (tick % 2 === 0) ? NOTIF_TITLE : BASE_TITLE;
        if (tick >= ALARM_REPS * 2) {
          clearInterval(alarmInterval);
          // Transition to slow blink
          startSlowBlink();
        }
      }, FAST_MS);

      // Store in flashIntervalRef so stopFlash() can clear it too
      flashIntervalRef.current = alarmInterval;
    };

    // 3. Handle count transitions
    if (unreadCount === 0) {
      stopFlash();
      return;
    }

    if (increased && document.hidden) {
      // New notification arrived while tab is hidden → Outlook-style alarm (title flash)
      startAlarm();
    } else if (unreadCount > 0 && document.hidden) {
      // Tab was already hidden, count changed but didn't increase — just slow blink
      startSlowBlink();
    }
    // If tab is visible: don't blink, title stays clean

    // 4. Stop blinking as soon as the user comes back to the tab
    const handleVisibility = () => {
      if (!document.hidden) stopFlash();
      else if (countRef.current > 0) startSlowBlink();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearAll();
    };
  }, [unreadCount]); // eslint-disable-line react-hooks/exhaustive-deps
}
