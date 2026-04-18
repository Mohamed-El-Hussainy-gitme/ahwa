'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from './storage';

type Initializer<T> = T | (() => T);

type DraftControls<T> = {
  hydrated: boolean;
  hasStoredDraft: boolean;
  clearDraft: () => void;
  resetDraft: () => void;
  restoreDraft: (next: T) => void;
};

function resolveInitialValue<T>(value: Initializer<T>) {
  return typeof value === 'function' ? (value as () => T)() : value;
}

export function usePersistentDraft<T>(storageKey: string, initialValue: Initializer<T>): [T, Dispatch<SetStateAction<T>>, DraftControls<T>] {
  const initialRef = useRef<T | null>(null);
  const skipNextPersistRef = useRef(true);
  if (initialRef.current === null) {
    initialRef.current = resolveInitialValue(initialValue);
  }

  const [state, setState] = useState<T>(initialRef.current);
  const [hydrated, setHydrated] = useState(false);
  const [hasStoredDraft, setHasStoredDraft] = useState(false);

  useEffect(() => {
    const fallback = initialRef.current as T;
    const stored = readLocalStorage<T | null>(storageKey, null);
    if (stored !== null) {
      skipNextPersistRef.current = false;
      setState(stored);
      setHasStoredDraft(true);
    } else {
      skipNextPersistRef.current = true;
      setState(fallback);
      setHasStoredDraft(false);
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    writeLocalStorage(storageKey, state);
    if (!hasStoredDraft) {
      setHasStoredDraft(true);
    }
  }, [hasStoredDraft, hydrated, state, storageKey]);

  const clearDraft = useCallback(() => {
    skipNextPersistRef.current = true;
    removeLocalStorage(storageKey);
    setHasStoredDraft(false);
  }, [storageKey]);

  const resetDraft = useCallback(() => {
    const fallback = resolveInitialValue(initialValue);
    initialRef.current = fallback;
    skipNextPersistRef.current = true;
    setState(fallback);
    removeLocalStorage(storageKey);
    setHasStoredDraft(false);
  }, [initialValue, storageKey]);

  const restoreDraft = useCallback((next: T) => {
    skipNextPersistRef.current = false;
    setState(next);
    writeLocalStorage(storageKey, next);
    setHasStoredDraft(true);
  }, [storageKey]);

  return useMemo<[T, Dispatch<SetStateAction<T>>, DraftControls<T>]>(
    () => [state, setState, { hydrated, hasStoredDraft, clearDraft, resetDraft, restoreDraft }],
    [state, hydrated, hasStoredDraft, clearDraft, resetDraft, restoreDraft],
  );
}
