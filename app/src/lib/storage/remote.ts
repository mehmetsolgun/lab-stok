import type { Database } from '../domain/types'
import { toDatabase, type RemoteLoad } from './schema'
import type { Op } from './types'

export interface RemoteConfig {
  url: string
  key: string
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>

/** Talks to the Google Apps Script web app that fronts the lab's Google Sheet. */
export class Remote {
  constructor(private cfg: RemoteConfig, private fetchFn: FetchFn = (u, i) => fetch(u, i)) {}

  private async call<T>(body: Record<string, unknown>): Promise<T> {
    let res: Response
    try {
      // text/plain keeps this a "simple" request, so the browser skips the CORS preflight Apps Script cannot answer
      res = await this.fetchFn(this.cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ key: this.cfg.key, ...body }),
        redirect: 'follow',
      })
    } catch {
      throw new Error('Sunucuya ulaşılamıyor (internet bağlantısını kontrol edin).')
    }
    let json: { ok: boolean; error?: string } & Record<string, unknown>
    try {
      json = await res.json()
    } catch {
      throw new Error('Sunucudan geçersiz yanıt geldi (bağlantı adresi doğru mu?).')
    }
    if (!json.ok) throw new Error(json.error ?? 'Bilinmeyen sunucu hatası')
    return json as unknown as T
  }

  async ping(): Promise<number> {
    return (await this.call<{ version: number }>({ action: 'ping' })).version
  }

  async version(): Promise<number> {
    return (await this.call<{ version: number }>({ action: 'version' })).version
  }

  async load(): Promise<{ version: number; db: Database }> {
    const r = await this.call<RemoteLoad & { version: number }>({ action: 'load' })
    return { version: r.version, db: toDatabase(r) }
  }

  async apply(ops: Op[]): Promise<number> {
    return (await this.call<{ version: number }>({ action: 'apply', ops })).version
  }
}
