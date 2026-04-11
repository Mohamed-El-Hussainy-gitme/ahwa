export const RUNTIME_RESUME_STORAGE_KEY = 'ahwa.runtime.resume.v1';
export const RUNTIME_LAST_PATH_STORAGE_KEY = 'ahwa.runtime.last-path.v1';

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export function readRuntimeResumeToken(): string | null {
  return getLocalStorage()?.getItem(RUNTIME_RESUME_STORAGE_KEY) ?? null;
}

export function writeRuntimeResumeToken(token: string | null): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  if (!token) {
    storage.removeItem(RUNTIME_RESUME_STORAGE_KEY);
    return;
  }

  storage.setItem(RUNTIME_RESUME_STORAGE_KEY, token);
}

export function readRuntimeLastPath(): string | null {
  return getLocalStorage()?.getItem(RUNTIME_LAST_PATH_STORAGE_KEY) ?? null;
}

export function writeRuntimeLastPath(path: string | null): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  if (!path) {
    storage.removeItem(RUNTIME_LAST_PATH_STORAGE_KEY);
    return;
  }

  storage.setItem(RUNTIME_LAST_PATH_STORAGE_KEY, path);
}
