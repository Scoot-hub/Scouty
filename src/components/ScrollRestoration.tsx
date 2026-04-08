import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const STORAGE_KEY = 'scroll-positions';

function getScrollPositions(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveScrollPosition(key: string, position: number) {
  const positions = getScrollPositions();
  positions[key] = position;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

export default function ScrollRestoration() {
  const location = useLocation();
  const prevKeyRef = useRef(location.key);

  // Save scroll position when leaving a page
  useEffect(() => {
    const prevKey = prevKeyRef.current;
    prevKeyRef.current = location.key;

    // Save the scroll position of the previous page
    if (prevKey && prevKey !== location.key) {
      saveScrollPosition(prevKey, window.scrollY);
    }

    // Restore scroll position for the new page (back/forward)
    const positions = getScrollPositions();
    const saved = positions[location.key];

    if (saved != null) {
      // Use requestAnimationFrame to wait for the DOM to render
      requestAnimationFrame(() => {
        window.scrollTo(0, saved);
      });
    } else {
      // New navigation: scroll to top
      window.scrollTo(0, 0);
    }
  }, [location.key]);

  // Save scroll position on beforeunload (refresh/close)
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveScrollPosition(location.key, window.scrollY);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [location.key]);

  return null;
}
