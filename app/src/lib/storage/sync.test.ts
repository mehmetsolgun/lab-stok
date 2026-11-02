import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeBackend, type Backend } from './fakeSheets'
import { LocalStorageAdapter } from './local'
import { Remote } from './remote'
import { SyncStorage } from './sync'
import type { Item, Primer } from '../domain/types'
import { DEFAULT_CATEGORIES } from '../domain/types'

let be: Backend
let key: string
let n = 0
const client = (fetchFn = be.fetch, retryMs = 20) => {
  const local = new LocalStorageAdapter(`test-${++n}`, 't')
  const sync = new SyncStorage(local, new Remote({ url: 'x', key }, fetchFn), retryMs)
  return { local, sync }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(cond: () => boolean | Promise<boolean>, ms = 1500) {
  const t = Date.now()
  while (!(await cond())) {
    if (Date.now() - t > ms) throw new Error('zaman aşımı')
    await wait(10)
  }
}

const item = (id: string, o: Partial<Item> = {}): Item => ({
  id, brand: 'Sigma', name: 'Etanol', purpose: 'Kimyasal', storage: '+4°C', unit: 'Şişe', skt: '2027-03-05', bottleSize: 500,
  sealed: 2, minStock: 1, cabinet: 'Dolap 1', shelf: 'Raf 2', box: '', note: '', ordered: false, version: 1, updatedAt: '2026-11-02', ...o,
})
const primer = (id: string): Primer => ({
  id, organism: 'Fare', gene: 'GAPDH', fwSeq: 'ACGT', rvSeq: 'TTGA', fwTm: 58.5, rvTm: null, amount: '', location: '', preparedAt: '', note: '', version: 1, updatedAt: '',
})
const entry = (detail: string) => ({ ts: new Date().toISOString(), user: 'Ayşe', module: 'Stok Sayım', action: 'EKLEME' as const, detail })

beforeEach(() => {
  be = makeBackend()
  key = be.setup()
})

describe('Apps Script backend + sync', () => {
  it('rejects a wrong key and an unconfigured sheet', async () => {
    const bad = new Remote({ url: 'x', key: 'yanlis' }, be.fetch)
    await expect(bad.ping()).rejects.toThrow('Erişim anahtarı geçersiz')
  })

  it('round-trips every table between two computers with correct types', async () => {
    const a = client(), b = client()
    await a.sync.load()
    await a.sync.apply([
      { t: 'put', table: 'items', rows: [item('i1', { ordered: true, skt: '' })] },
      { t: 'put', table: 'bottles', rows: [{ id: 'b1', itemId: 'i1', remaining: 120.5, openedAt: '2026-10-01' }] },
      { t: 'put', table: 'primers', rows: [primer('p1')] },
      { t: 'log', entries: [entry('eklendi')] },
      { t: 'categories', value: { ...DEFAULT_CATEGORIES, unit: ['Adet'] } },
      { t: 'members', value: ['Ayşe Yılmaz', 'Mehmet Demir'] },
      { t: 'admin', value: { salt: 's', hash: 'h' } },
    ])
    await until(() => (a.sync as unknown as { outbox: unknown[] }).outbox.length === 0)

    await b.sync.load()
    const db = await b.sync.pull()
    expect(db).not.toBeNull()
    expect(db!.items[0]).toMatchObject({ id: 'i1', sealed: 2, bottleSize: 500, ordered: true, skt: '', name: 'Etanol' })
    expect(db!.bottles[0]).toMatchObject({ remaining: 120.5, openedAt: '2026-10-01' })
    expect(db!.primers[0]).toMatchObject({ fwTm: 58.5, rvTm: null, gene: 'GAPDH' })
    expect(db!.log).toHaveLength(1)
    expect(db!.categories.unit).toEqual(['Adet'])
    expect(db!.members).toEqual(['Ayşe Yılmaz', 'Mehmet Demir'])
    expect(db!.admin).toEqual({ salt: 's', hash: 'h' })
    // second computer now also has it cached locally
    expect((await b.local.load()).items).toHaveLength(1)
  })

  it('updates in place, appends new rows and deletes by id', async () => {
    const a = client()
    await a.sync.load()
    await a.sync.apply([{ t: 'put', table: 'items', rows: [item('i1'), item('i2', { name: 'Trizol' })] }])
    await a.sync.apply([{ t: 'put', table: 'items', rows: [item('i1', { sealed: 9 }), item('i3', { name: 'PBS' })] }])
    await a.sync.apply([{ t: 'del', table: 'items', ids: ['i2'] }])
    await until(() => (a.sync as unknown as { outbox: unknown[] }).outbox.length === 0)
    const { db } = await new Remote({ url: 'x', key }, be.fetch).load()
    expect(db.items.map((i) => i.id).sort()).toEqual(['i1', 'i3'])
    expect(db.items.find((i) => i.id === 'i1')!.sealed).toBe(9)
  })

  it('handles bulk rewrites (many updates / many deletes)', async () => {
    const a = client()
    await a.sync.load()
    const many = Array.from({ length: 120 }, (_, i) => item('x' + i))
    await a.sync.apply([{ t: 'put', table: 'items', rows: many }])
    await a.sync.apply([{ t: 'put', table: 'items', rows: many.map((m) => ({ ...m, sealed: 7 })) }])
    await until(() => (a.sync as unknown as { outbox: unknown[] }).outbox.length === 0)
    let { db } = await new Remote({ url: 'x', key }, be.fetch).load()
    expect(db.items).toHaveLength(120)
    expect(db.items.every((i) => i.sealed === 7)).toBe(true)
    await a.sync.apply([{ t: 'del', table: 'items', ids: many.slice(0, 100).map((m) => m.id) }])
    await until(() => (a.sync as unknown as { outbox: unknown[] }).outbox.length === 0)
    ;({ db } = await new Remote({ url: 'x', key }, be.fetch).load())
    expect(db.items.map((i) => i.id).sort()).toEqual(many.slice(100).map((m) => m.id).sort())
  })

  it('stores risky text literally (formulas, dates, number-like names)', async () => {
    const a = client()
    await a.sync.load()
    await a.sync.apply([{ t: 'put', table: 'items', rows: [item('i1', { name: '=1+1', note: '1-2', brand: '007', skt: '2027-03-05' })] }])
    await until(() => (a.sync as unknown as { outbox: unknown[] }).outbox.length === 0)
    const { db } = await new Remote({ url: 'x', key }, be.fetch).load()
    expect(db.items[0]).toMatchObject({ name: '=1+1', note: '1-2', brand: '007', skt: '2027-03-05' })
  })

  it('keeps edits while offline and delivers them after reconnecting', async () => {
    let online = false
    const flaky = (u: string, i: RequestInit) => (online ? be.fetch(u, i) : Promise.reject(new Error('offline')))
    const a = client(flaky)
    await a.sync.load()
    const states: string[] = []
    a.sync.onStatus = (s) => states.push(`${s.queued}:${s.error}`)
    await a.sync.apply([{ t: 'put', table: 'items', rows: [item('i1')] }])
    await until(() => states.some((s) => s.includes('Sunucuya ulaşılamıyor')))
    // still readable locally while offline
    expect((await a.local.load()).items).toHaveLength(1)
    // a reload while offline keeps the queue
    const reloaded = new SyncStorage(a.local, new Remote({ url: 'x', key }, flaky), 20)
    online = true
    const db = await reloaded.load()
    expect(db.items).toHaveLength(1)
    await until(async () => (await new Remote({ url: 'x', key }, be.fetch).load()).db.items.length === 1)
    await until(async () => ((await a.local.getMeta<unknown[]>('outbox')) ?? []).length === 0)
  })

  it('poll sees other computers\' changes but not its own, and never overwrites pending edits', async () => {
    const a = client(), b = client()
    await a.sync.load(); await b.sync.load()
    await a.sync.pull(); await b.sync.pull()
    expect(await a.sync.poll()).toBeNull()

    await b.sync.apply([{ t: 'put', table: 'items', rows: [item('i1')] }])
    await until(() => (b.sync as unknown as { outbox: unknown[] }).outbox.length === 0)
    expect(await b.sync.poll()).toBeNull() // own write
    const seen = await a.sync.poll()
    expect(seen!.items.map((i) => i.id)).toEqual(['i1'])

    // pending local edit blocks pulling
    let online = true
    const gated = (u: string, i: RequestInit) => (online ? be.fetch(u, i) : Promise.reject(new Error('offline')))
    const c = client(gated)
    await c.sync.load()
    online = false
    await c.sync.apply([{ t: 'put', table: 'items', rows: [item('i9')] }])
    online = true
    expect(await c.sync.pull()).toBeNull()
  })
})
