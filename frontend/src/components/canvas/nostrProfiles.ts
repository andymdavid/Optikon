const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.devvul.com',
  'wss://purplepag.es',
]

type ApplesauceLibs = {
  relay: any
  helpers: any
  rxjs: any
}

let applesauceLibs: ApplesauceLibs | null = null
let profilePool: any = null
const profileCache = new Map<string, string | null>()
const profileInFlight = new Map<string, Promise<string | null>>()

type NostrWindow = Window & {
  nostr?: {
    getRelays?: () => Promise<Record<string, { read?: boolean; write?: boolean }>> | Record<string, { read?: boolean; write?: boolean }>
  }
}

async function loadApplesauceLibs(): Promise<ApplesauceLibs> {
  if (applesauceLibs) return applesauceLibs
  const relayUrl = 'https://esm.sh/applesauce-relay@4.0.0?bundle'
  const helpersUrl = 'https://esm.sh/applesauce-core@4.0.0/helpers?bundle'
  const rxjsUrl = 'https://esm.sh/rxjs@7.8.1?bundle'
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
      .filter((url) => typeof url === 'string' && url.startsWith('wss://'))
    return entries.length > 0 ? entries : fallback
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
  if (profileCache.has(pubkey)) return profileCache.get(pubkey) ?? null
  if (profileInFlight.has(pubkey)) return profileInFlight.get(pubkey) ?? null

  const task = (async () => {
    try {
      const libs = await loadApplesauceLibs()
      const { RelayPool, onlyEvents } = libs.relay
      const { getProfilePicture } = libs.helpers
      const { firstValueFrom, take, takeUntil, timer } = libs.rxjs
      profilePool = profilePool || new RelayPool()
      const relays = await resolveRelayList()
      const observable = profilePool
        .subscription(relays, [{ authors: [pubkey], kinds: [0], limit: 1 }])
        .pipe(onlyEvents(), take(1), takeUntil(timer(5000)))
      const event = await firstValueFrom(observable, { defaultValue: null })
      if (!event) return null
      return getProfilePicture(event, null)
    } catch (_error) {
      return null
    }
  })()

  profileInFlight.set(pubkey, task)
  const result = await task
  profileCache.set(pubkey, result)
  profileInFlight.delete(pubkey)
  return result
}
