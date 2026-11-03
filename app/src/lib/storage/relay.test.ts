import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
// @ts-ignore plain JS file that ships with the Apps Script folder
import relay from '../../../../apps-script/relay-worker.js'
import { Remote } from './remote'
import { urlProblem } from '../connection'

const TARGET = 'https://script.google.com/macros/s/x/exec'
const realFetch = globalThis.fetch

/** Stands in for script.google.com: POST .../exec -> 302 -> GET /echo -> the Apps Script answer. */
let server: Server
let base = ''
let answer = ''
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.method === 'POST') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        answer = JSON.stringify(JSON.parse(body).key === 'gizli' ? { ok: true, version: 7 } : { ok: false, error: 'Erişim anahtarı geçersiz.' })
        res.writeHead(302, { Location: `${base}/echo` }).end()
      })
    } else if (req.url === '/echo') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(answer)
    } else res.writeHead(404).end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  // the worker only talks to script.google.com; send exactly that address to the stand-in
  globalThis.fetch = ((u: string | URL | Request, init?: RequestInit) =>
    realFetch(String(u) === TARGET ? `${base}/exec` : u, init)) as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
  server.close()
})
afterEach(() => { answer = '' })

const call = (body: string, method = 'POST', env: Record<string, string> = { TARGET }) =>
  relay.fetch(new Request('https://relay.example/', { method, body: method === 'POST' ? body : undefined }), env) as Promise<Response>

describe('relay worker', () => {
  it('forwards the call, follows the redirect and adds CORS headers', async () => {
    const res = await call(JSON.stringify({ key: 'gizli', action: 'ping' }))
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(await res.json()).toEqual({ ok: true, version: 7 })
  })

  it('passes the server error through so the app can show it', async () => {
    const res = await call(JSON.stringify({ key: 'yanlis', action: 'ping' }))
    expect(await res.json()).toEqual({ ok: false, error: 'Erişim anahtarı geçersiz.' })
  })

  it('answers the CORS preflight and a plain visit', async () => {
    const pre = await call('', 'OPTIONS')
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-headers')).toContain('Content-Type')
    expect(await (await call('', 'GET')).text()).toContain('çalışıyor')
  })

  it('refuses to run until a real Apps Script address is configured', async () => {
    const res = await call('{}', 'POST', {})
    expect(res.status).toBe(500)
    expect(((await res.json()) as { error: string }).error).toContain('TARGET')
  })

  it('works end to end with the app client', async () => {
    const remote = new Remote({ url: 'https://relay.example/', key: 'gizli' }, (u, i) => relay.fetch(new Request(u, i), { TARGET }))
    expect(await remote.ping()).toBe(7)
    await expect(new Remote({ url: 'https://relay.example/', key: 'yanlis' }, (u, i) => relay.fetch(new Request(u, i), { TARGET })).ping()).rejects.toThrow('Erişim anahtarı geçersiz')
  })
})

describe('urlProblem', () => {
  it('accepts a normal deployment and a relay address', () => {
    expect(urlProblem('https://script.google.com/macros/s/AKfy-1_x/exec')).toBeNull()
    expect(urlProblem('https://lab-stok.ornek.workers.dev')).toBeNull()
  })
  it('explains the usual mistakes', () => {
    expect(urlProblem('script.google.com/macros/s/x/exec')).toContain('https')
    expect(urlProblem('http://script.google.com/macros/s/x/exec')).toContain('https')
    expect(urlProblem('https://script.google.com/macros/s/x/dev')).toContain('/dev')
    expect(urlProblem('https://script.google.com/macros/s/x/')).toContain('/exec')
  })
})
