import { hasIntersectingTags, uniqueTags } from './cache-tags';

type WorkspaceCacheEntry<T = unknown> = {
  data: T;
  loadedAt: number;
  tags: readonly string[];
};

const workspaceCache = new Map<string, WorkspaceCacheEntry>();

export function getCachedWorkspace<T>(key: string | null | undefined) {
  if (!key) {
    return null;
  }
  const cached = workspaceCache.get(key) as WorkspaceCacheEntry<T> | undefined;
  return cached ?? null;
}

export function setCachedWorkspace<T>(key: string | null | undefined, value: T, loadedAt: number, tags: readonly string[]) {
  if (!key) {
    return;
  }
  workspaceCache.set(key, {
    data: value,
    loadedAt,
    tags: uniqueTags(tags),
  });
}

export function invalidateWorkspaceCacheByTags(tags?: readonly string[]) {
  if (!tags?.length) {
    workspaceCache.clear();
    return;
  }
  for (const [key, entry] of workspaceCache.entries()) {
    if (hasIntersectingTags(entry.tags, tags)) {
      workspaceCache.delete(key);
    }
  }
}
