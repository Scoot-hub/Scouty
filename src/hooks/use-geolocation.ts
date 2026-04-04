import { useState, useEffect, useCallback } from 'react';

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number; // meters
}

interface UseGeolocationResult {
  position: GeoPosition | null;
  loading: boolean;
  error: string | null;
  locate: () => void;
}

const STORAGE_KEY = 'scouthub_geo';
const MAX_AGE = 30 * 60 * 1000; // Cache position for 30 min

function loadCached(): GeoPosition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { position, ts } = JSON.parse(raw);
    if (Date.now() - ts < MAX_AGE) return position;
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
  return null;
}

function saveCache(position: GeoPosition) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ position, ts: Date.now() })); } catch { /* quota */ }
}

export function useGeolocation(): UseGeolocationResult {
  const [position, setPosition] = useState<GeoPosition | null>(loadCached);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const geo: GeoPosition = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setPosition(geo);
        saveCache(geo);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: MAX_AGE }
    );
  }, []);

  return { position, loading, error, locate };
}

/** Haversine distance in km between two points */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
