'use client';

export function isBrowser() {
  return typeof window !== 'undefined';
}

export function readLocalStorage<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocalStorage<T>(key: string, value: T) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / serialization failures
  }
}

export function removeLocalStorage(key: string) {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
