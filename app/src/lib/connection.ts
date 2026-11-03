import { LocalStorageAdapter } from './storage/local'
import { Remote, type RemoteConfig } from './storage/remote'
import { SyncStorage } from './storage/sync'
import type { Storage } from './storage/types'

const CFG = 'remote'
const LOCAL_MODE = 'localMode'

const get = (k: string) => {
  try { return localStorage.getItem(k) } catch { return null }
}
const set = (k: string, v: string | null) => {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* private mode etc. */ }
}

export function loadConfig(): RemoteConfig | null {
  try {
    const c = JSON.parse(get(CFG) ?? 'null')
    return c?.url && c?.key ? c : null
  } catch {
    return null
  }
}

export const saveConfig = (c: RemoteConfig) => { set(CFG, JSON.stringify(c)); set(LOCAL_MODE, null) }
export const clearConfig = () => { set(CFG, null); set(LOCAL_MODE, null) }
export const isLocalMode = () => get(LOCAL_MODE) === '1'
export const setLocalMode = () => set(LOCAL_MODE, '1')

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))

/** One link that configures a new computer. Kept in the #fragment, which browsers never send to a server. */
export function makeLink(c: RemoteConfig): string {
  return `${location.origin}${location.pathname}#baglanti=${b64(JSON.stringify(c))}`
}

/** If the page was opened with a connection link, save it and clean the address bar. */
export function consumeLink(): boolean {
  const m = /^#baglanti=([\w-]+)/.exec(location.hash)
  if (!m) return false
  try {
    const c = JSON.parse(unb64(m[1]))
    if (c?.url && c?.key) {
      saveConfig(c)
      history.replaceState(null, '', location.pathname + location.search)
      return true
    }
  } catch { /* bad link: ignore */ }
  return false
}

/** Catches the usual copy-paste mistakes before a request is sent. */
export function urlProblem(url: string): string | null {
  if (!/^https:\/\//i.test(url)) return 'Adres "https://" ile başlamalı.'
  if (/\/dev(\?.*)?$/.test(url)) return 'Bu bir test adresi (/dev). Dağıt → Yeni dağıtım sonunda verilen "/exec" ile biten adresi kullanın.'
  if (!/\/exec(\?.*)?$/.test(url)) return 'Adres "/exec" ile bitmeli (Dağıt → Yeni dağıtım sonunda verilen Web uygulaması URL\'si).'
  return null
}

export async function testConfig(c: RemoteConfig): Promise<void> {
  const bad = urlProblem(c.url)
  if (bad) throw new Error(bad)
  await new Remote(c).ping()
}

export function buildStorage(): Storage {
  const cfg = loadConfig()
  if (!cfg) return new LocalStorageAdapter()
  return new SyncStorage(new LocalStorageAdapter('labstok-cache-v1', 'Google E-Tablo (yerel önbellekli)'), new Remote(cfg))
}
