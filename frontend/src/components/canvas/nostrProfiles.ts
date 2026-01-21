const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.devvul.com',
  'wss://purplepag.es',
  'wss://relay.snort.social',
  'wss://relay.primal.net',
  'wss://nostr.wine',
]

type ApplesauceLibs = {
  relay: any
  helpers: any
  rxjs: any
}

let applesauceLibs: ApplesauceLibs | null = null
let profilePool: any = null
const profileCache = new Map<string, { profile: NostrProfile | null; ts: number }>()
const profileInFlight = new Map<string, Promise<NostrProfile | null>>()

type NostrWindow = Window & {
  nostr?: {
    getRelays?: () => Promise<Record<string, { read?: boolean; write?: boolean }>> | Record<string, { read?: boolean; write?: boolean }>
  }
}

const DEBUG_STORAGE_KEY = 'nostrProfileDebug'

function isDebugEnabled() {
  try {
    return window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1'
  } catch (_err) {
    return false
  }
}

async function loadApplesauceLibs(): Promise<ApplesauceLibs> {
  if (applesauceLibs) return applesauceLibs
  applesauceLibs = {
    relay: await import('applesauce-relay'),
    helpers: await import('applesauce-core/helpers'),
    rxjs: await import('rxjs'),
  }
  return applesauceLibs
}

async function resolveRelayList() {
  const fallback = DEFAULT_RELAYS
  try {
    const windowWithNostr = window as NostrWindow
    const relays = await windowWithNostr.nostr?.getRelays?.()
    if (!relays || typeof relays !== 'object') return fallback
    const entries = Object.entries(relays)
      .filter(([_url, perms]) => perms?.read !== false)
      .map(([url]) => url)
      .filter(
        (url) =>
          typeof url === 'string' &&
          (url.startsWith('wss://') || url.startsWith('ws://'))
      )
    if (entries.length > 0) return entries
    return fallback
  } catch (_err) {
    return fallback
  }
}

export function getAvatarFallback(pubkey?: string | null) {
  const key = pubkey || 'nostr'
  return `https://robohash.org/${encodeURIComponent(key)}.png?set=set3`
}

export type NostrProfile = {
  name: string | null
  displayName: string | null
  nip05: string | null
  picture: string | null
}

function parseProfileEvent(event: { content?: string } | null): NostrProfile | null {
  if (!event?.content || typeof event.content !== 'string') return null
  try {
    const parsed = JSON.parse(event.content) as Record<string, unknown>
    const normalize = (value: unknown) =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
    return {
      name: normalize(parsed.name),
      displayName: normalize(parsed.display_name ?? parsed.displayName),
      nip05: normalize(parsed.nip05),
      picture: normalize(parsed.picture),
    }
  } catch (_err) {
    return null
  }
}

export function formatProfileName(profile: NostrProfile | null): string | null {
  if (!profile) return null
  return profile.displayName ?? profile.name ?? profile.nip05 ?? null
}

export async function fetchProfile(pubkey: string): Promise<NostrProfile | null> {
  if (!pubkey) return null
  const cached = profileCache.get(pubkey)
  if (cached) {
    const ageMs = Date.now() - cached.ts
    if (cached.profile || ageMs < 60_000) {
      return cached.profile ?? null
    }
    profileCache.delete(pubkey)
  }
  if (profileInFlight.has(pubkey)) return profileInFlight.get(pubkey) ?? null

  const task = (async () => {
    try {
      const libs = await loadApplesauceLibs()
      const { RelayPool, onlyEvents } = libs.relay
      const { firstValueFrom, take, takeUntil, timer } = libs.rxjs
      profilePool = profilePool || new RelayPool()
      const relays = await resolveRelayList()
      if (isDebugEnabled()) {
        console.log('[nostrProfile] relays', relays)
      }
      const observable = profilePool
        .subscription(relays, [{ authors: [pubkey], kinds: [0], limit: 1 }])
        .pipe(onlyEvents(), take(1), takeUntil(timer(5000)))
      const event = await firstValueFrom(observable, { defaultValue: null })
      if (!event) {
        if (isDebugEnabled()) {
          console.log('[nostrProfile] no kind-0 event found')
        }
        return null
      }
      const profile = parseProfileEvent(event)
      if (isDebugEnabled()) {
        console.log('[nostrProfile] picture', profile?.picture ?? null)
      }
      return profile
    } catch (_error) {
      return null
    }
  })()

  profileInFlight.set(pubkey, task)
  const result = await task
  profileCache.set(pubkey, { profile: result, ts: Date.now() })
  profileInFlight.delete(pubkey)
  return result
}

export async function fetchProfilePicture(pubkey: string): Promise<string | null> {
  const profile = await fetchProfile(pubkey)
  return profile?.picture ?? null
}
