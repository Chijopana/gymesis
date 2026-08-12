type CacheEnvelope<T> = {
  v: number
  savedAt: number
  value: T
}

type CacheOptions = {
  ttlMs?: number
  version?: number
  useStaleOnError?: boolean
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

function nowMs() {
  return Date.now()
}

function readEnvelope<T>(key: string): CacheEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEnvelope<T>
    if (!parsed || typeof parsed.savedAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writeEnvelope<T>(key: string, value: T, version: number) {
  const payload: CacheEnvelope<T> = { v: version, savedAt: nowMs(), value }
  localStorage.setItem(key, JSON.stringify(payload))
}

export async function getCachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<{ data: T; fromCache: boolean; stale: boolean }> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const version = options.version ?? 1
  const useStaleOnError = options.useStaleOnError ?? true

  const envelope = readEnvelope<T>(key)
  const cacheFresh = !!envelope && envelope.v === version && nowMs() - envelope.savedAt <= ttlMs

  if (cacheFresh) {
    return { data: envelope.value, fromCache: true, stale: false }
  }

  try {
    const fresh = await fetcher()
    writeEnvelope(key, fresh, version)
    return { data: fresh, fromCache: false, stale: false }
  } catch (error) {
    if (useStaleOnError && envelope && envelope.v === version) {
      return { data: envelope.value, fromCache: true, stale: true }
    }
    throw error
  }
}

export function clearCacheByPrefix(prefix: string) {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(prefix))
    .forEach((key) => localStorage.removeItem(key))
}
