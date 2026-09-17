import { useCallback, useState } from "react";

// Layout / sort preferences persist across visits (no login — per-browser
// localStorage). This is intentionally NOT used for anything sensitive; auth
// lives in the httpOnly session cookie the backend owns.
export function usePersistedState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch (error) {
      // Corrupt cache or private-mode storage: log once and fall back to the
      // caller's default so the UI keeps rendering.
      console.warn(`usePersistedState(${key}): failed to read`, error);
      return initial;
    }
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch (error) {
        // storage unavailable (private mode / quota) — session-only preference
        console.warn(`usePersistedState(${key}): failed to write`, error);
      }
    },
    [key],
  );

  return [value, update];
}

const FAVORITES_KEY = "catalog.favorites";

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch (error) {
    console.warn("readFavorites: failed to parse cache", error);
    return [];
  }
}

// Favorites are per-browser: ids live in localStorage as a UI-only star cache.
// Authoritative per-user favorites (and the derived catalog count) live in the
// backend ``favorites`` collection — see backend/routers/apps.py.
export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(readFavorites()));

  const toggle = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      } catch (error) {
        console.warn("useFavorites: failed to persist toggle", error);
      }
      return next;
    });
  }, []);

  return { favorites, toggle };
}
