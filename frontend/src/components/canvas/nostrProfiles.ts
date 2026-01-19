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
const profileCache = new Map<string, { url: string | null; ts: number }>()
const profileInFlight = new Map<string, Promise<string | null>>()

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
  const relayUrl = 'https://esm.sh/applesauce-relay@4.0.0?bundle&no-sourcemap=1'
  const helpersUrl = 'https://esm.sh/applesauce-core@4.0.0/helpers?bundle&no-sourcemap=1'
  const rxjsUrl = 'https://esm.sh/rxjs@7.8.1?bundle&no-sourcemap=1'
  applesauceLibs = {
    relay: await import(/* @vite-ignore */ relayUrl),
    helpers: await import(/* @vite-ignore */ helpersUrl),
    rxjs: await import(/* @vite-ignore */ rxjsUrl),
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

export async function fetchProfilePicture(pubkey: string): Promise<string | null> {
  if (!pubkey) return null
  const cached = profileCache.get(pubkey)
  if (cached) {
    const ageMs = Date.now() - cached.ts
    if (cached.url || ageMs < 60_000) {
      return cached.url ?? null
    }
    profileCache.delete(pubkey)
  }
  if (profileInFlight.has(pubkey)) return profileInFlight.get(pubkey) ?? null

  const task = (async () => {
    try {
      const libs = await loadApplesauceLibs()
      const { RelayPool, onlyEvents } = libs.relay
      const { getProfilePicture } = libs.helpers
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
      const picture = getProfilePicture(event, null)
      if (isDebugEnabled()) {
        console.log('[nostrProfile] picture', picture ?? null)
      }
      return picture
    } catch (_error) {
      return null
    }
  })()

  profileInFlight.set(pubkey, task)
  const result = await task
  profileCache.set(pubkey, { url: result, ts: Date.now() })
  profileInFlight.delete(pubkey)
  return result
}
