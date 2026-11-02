import {
  DEFAULT_CATEGORIES, type Bottle, type Categories, type Database, type Item, type LogEntry, type Primer,
} from './domain/types'
import {
  daysUntil, newId, openBottlesOf, openSealed, spend, statusesOf, todayIso, totalUnits, type Status,
} from './domain/rules'
import type { Op, Storage } from './storage/types'
import { checkAdminPassword, makeAdminSecret, type AdminSecret } from './auth'

export interface ItemRow {
  item: Item
  open: Bottle[]
  total: number
  statuses: Status[]
  daysLeft: number | null
  location: string
  search: string
}

const lc = (s: string) => s.toLocaleLowerCase('tr')

export function locationOf(i: Item): string {
  return [i.cabinet, i.shelf, i.box].filter(Boolean).join(' / ')
}

class Store {
  items = $state.raw<Item[]>([])
  bottles = $state.raw<Bottle[]>([])
  primers = $state.raw<Primer[]>([])
  log = $state.raw<LogEntry[]>([])
  categories = $state.raw<Categories>(DEFAULT_CATEGORIES)
  user = $state('')
  ready = $state(false)
  pending = $state(0)
  syncError = $state('')
  storageName = $state('')
  today = $state(todayIso())

  private storage!: Storage

  itemRows = $derived.by<ItemRow[]>(() => {
    const byItem = new Map<string, Bottle[]>()
    for (const b of this.bottles) {
      const a = byItem.get(b.itemId)
      if (a) a.push(b)
      else byItem.set(b.itemId, [b])
    }
    const today = this.today
    return this.items.map((item) => {
      const open = (byItem.get(item.id) ?? []).sort((a, b) => a.openedAt.localeCompare(b.openedAt))
      const location = locationOf(item)
      return {
        item,
        open,
        total: totalUnits(item, open),
        statuses: statusesOf(item, open, today),
        daysLeft: daysUntil(item.skt, today),
        location,
        search: lc([item.brand, item.name, item.purpose, item.storage, location, item.note].join(' ')),
      }
    })
  })

  members = $state.raw<string[]>([])
  adminSecret = $state.raw<AdminSecret | null>(null)
  isAdmin = $state(false) // unlocked for this session only

  queued = $state(0)
  private pollTimer = 0

  /**
   * Loads the local copy instantly. With a syncing storage, a brand-new computer (nothing cached)
   * waits for the first server pull and throws if it fails; otherwise the pull happens in the background.
   */
  async init(storage: Storage) {
    this.storage = storage
    this.storageName = storage.name
    storage.onStatus = (s) => {
      this.queued = s.queued
      this.syncError = s.error
    }
    const db = await storage.load()
    this.applyAll(db)
    if (storage.pull) {
      const first = storage.pull().then((fresh) => fresh && this.applyAll(fresh))
      if (!db.admin) await first
      else first.catch((e) => (this.syncError = e instanceof Error ? e.message : String(e)))
      this.startPolling()
    }
    this.ready = true
  }

  private startPolling() {
    clearInterval(this.pollTimer)
    this.pollTimer = window.setInterval(async () => {
      if (document.hidden || !this.storage.poll) return
      try {
        const fresh = await this.storage.poll()
        if (fresh) this.applyAll(fresh)
        if (!this.queued) this.syncError = ''
      } catch (e) {
        this.syncError = e instanceof Error ? e.message : String(e)
      }
    }, 20_000)
  }

  /** Pull the latest from the server right now (e.g. after the tab becomes visible). */
  async refresh() {
    if (!this.storage?.poll) return
    try {
      const fresh = await this.storage.poll()
      if (fresh) this.applyAll(fresh)
    } catch (e) {
      this.syncError = e instanceof Error ? e.message : String(e)
    }
  }

  private applyAll(db: Database) {
    this.apply(db)
    this.members = db.members
    this.adminSecret = db.admin
  }

  apply(db: Database) {
    this.items = db.items
    this.bottles = db.bottles
    this.primers = db.primers
    this.log = db.log
    this.categories = db.categories
  }

  // ---- members & admin ----
  login(name: string) {
    this.user = name
  }

  logout() {
    this.user = ''
    this.isAdmin = false
  }

  async setupAdmin(password: string, names: string[]) {
    const secret = await makeAdminSecret(password)
    this.adminSecret = secret
    this.members = names
    this.isAdmin = true
    await this.commit([{ t: 'admin', value: secret }, { t: 'members', value: names }])
  }

  async unlockAdmin(password: string): Promise<boolean> {
    if (!this.adminSecret || !(await checkAdminPassword(password, this.adminSecret))) return false
    this.isAdmin = true
    return true
  }

  async changePassword(password: string) {
    if (!this.isAdmin) return
    const secret = await makeAdminSecret(password)
    this.adminSecret = secret
    await this.commit([{ t: 'admin', value: secret }])
  }

  saveMembers(names: string[], what: string) {
    if (!this.isAdmin) return
    this.members = names
    const e = this.entry('Ayarlar', 'GÜNCELLEME', what)
    return this.commit([{ t: 'members', value: names }, { t: 'log', entries: [e] }])
  }

  // ---- persistence ----
  private async commit(ops: Op[]) {
    this.pending++
    try {
      await this.storage.apply(ops)
    } catch (e) {
      this.syncError = e instanceof Error ? e.message : String(e)
    } finally {
      this.pending--
    }
  }

  private entry(module: string, action: LogEntry['action'], detail: string): LogEntry {
    const e: LogEntry = { ts: new Date().toISOString(), user: this.user, module, action, detail }
    this.log = [...this.log, e]
    return e
  }

  // ---- items ----
  saveItem(input: Item, isNew: boolean) {
    const item = { ...input, version: input.version + 1, updatedAt: new Date().toISOString() }
    this.items = isNew ? [...this.items, item] : this.items.map((i) => (i.id === item.id ? item : i))
    const e = this.entry('Stok Sayım', isNew ? 'EKLEME' : 'GÜNCELLEME', `'${item.name}' ${isNew ? 'eklendi' : 'güncellendi'}.`)
    return this.commit([{ t: 'put', table: 'items', rows: [item] }, { t: 'log', entries: [e] }])
  }

  deleteItem(id: string) {
    const item = this.items.find((i) => i.id === id)
    if (!item) return
    const gone = this.bottles.filter((b) => b.itemId === id).map((b) => b.id)
    this.items = this.items.filter((i) => i.id !== id)
    this.bottles = this.bottles.filter((b) => b.itemId !== id)
    const e = this.entry('Stok Sayım', 'SİLME', `'${item.name}' silindi.`)
    return this.commit([
      { t: 'del', table: 'items', ids: [id] },
      { t: 'del', table: 'bottles', ids: gone },
      { t: 'log', entries: [e] },
    ])
  }

  /** +1 / -1 sealed box. Returns an error message or ''. */
  adjustSealed(id: string, delta: 1 | -1): string {
    const item = this.items.find((i) => i.id === id)
    if (!item) return 'Ürün bulunamadı.'
    if (item.sealed + delta < 0) return 'Kapalı adet sıfırın altına düşemez.'
    const next = { ...item, sealed: item.sealed + delta, version: item.version + 1, updatedAt: new Date().toISOString() }
    // a delivery clears the "ordered" flag
    if (delta > 0) next.ordered = false
    this.items = this.items.map((i) => (i.id === id ? next : i))
    const e = this.entry('Stok Sayım', 'GÜNCELLEME', `'${item.name}' kapalı adedi ${delta > 0 ? 'artırıldı' : 'azaltıldı'} (Yeni: ${next.sealed}).`)
    void this.commit([{ t: 'put', table: 'items', rows: [next] }, { t: 'log', entries: [e] }])
    return ''
  }

  spendItem(id: string, amount: number): string {
    const item = this.items.find((i) => i.id === id)
    if (!item) return 'Ürün bulunamadı.'
    const r = spend(item, this.bottles, amount, this.today)
    if (!r.ok) return r.error
    const updated = { ...r.item, version: item.version + 1, updatedAt: new Date().toISOString() }
    const keptIds = new Set(r.bottles.map((b) => b.id))
    const before = this.bottles.filter((b) => b.itemId === id)
    const removed = before.filter((b) => !keptIds.has(b.id)).map((b) => b.id)
    this.items = this.items.map((i) => (i.id === id ? updated : i))
    this.bottles = [...this.bottles.filter((b) => b.itemId !== id), ...r.bottles]
    const extra = r.opened ? ` (${r.opened} yeni ${item.unit.toLocaleLowerCase('tr')} açıldı)` : ''
    const e = this.entry('Stok Sayım', 'HARCAMA', `'${item.name}' ürününden ${amount} birim harcandı${extra}.`)
    void this.commit([
      { t: 'put', table: 'items', rows: [updated] },
      { t: 'put', table: 'bottles', rows: r.bottles },
      { t: 'del', table: 'bottles', ids: removed },
      { t: 'log', entries: [e] },
    ])
    return ''
  }

  openNew(id: string): string {
    const item = this.items.find((i) => i.id === id)
    if (!item) return 'Ürün bulunamadı.'
    const r = openSealed(item, this.today)
    if (!r) return 'Kapalı ürün kalmadı.'
    const updated = { ...r.item, version: item.version + 1, updatedAt: new Date().toISOString() }
    this.items = this.items.map((i) => (i.id === id ? updated : i))
    this.bottles = [...this.bottles, r.bottle]
    const e = this.entry('Stok Sayım', 'GÜNCELLEME', `'${item.name}' için yeni şişe/paket açıldı.`)
    void this.commit([
      { t: 'put', table: 'items', rows: [updated] },
      { t: 'put', table: 'bottles', rows: [r.bottle] },
      { t: 'log', entries: [e] },
    ])
    return ''
  }

  setOrdered(ids: string[], ordered: boolean) {
    const set = new Set(ids)
    const rows: Item[] = []
    this.items = this.items.map((i) => {
      if (!set.has(i.id) || i.ordered === ordered) return i
      const n = { ...i, ordered, version: i.version + 1, updatedAt: new Date().toISOString() }
      rows.push(n)
      return n
    })
    if (!rows.length) return
    const e = this.entry('Sipariş', 'GÜNCELLEME', `${rows.length} ürün ${ordered ? 'sipariş verildi' : 'sipariş işareti kaldırıldı'}.`)
    void this.commit([{ t: 'put', table: 'items', rows }, { t: 'log', entries: [e] }])
  }

  // ---- primers ----
  savePrimer(input: Primer, isNew: boolean) {
    const p = { ...input, version: input.version + 1, updatedAt: new Date().toISOString() }
    this.primers = isNew ? [...this.primers, p] : this.primers.map((x) => (x.id === p.id ? p : x))
    const e = this.entry('PCR Primerler', isNew ? 'EKLEME' : 'GÜNCELLEME', `'${p.gene}' primeri ${isNew ? 'eklendi' : 'güncellendi'}.`)
    return this.commit([{ t: 'put', table: 'primers', rows: [p] }, { t: 'log', entries: [e] }])
  }

  deletePrimer(id: string) {
    const p = this.primers.find((x) => x.id === id)
    if (!p) return
    this.primers = this.primers.filter((x) => x.id !== id)
    const e = this.entry('PCR Primerler', 'SİLME', `'${p.gene}' primeri silindi.`)
    return this.commit([{ t: 'del', table: 'primers', ids: [id] }, { t: 'log', entries: [e] }])
  }

  // ---- categories ----
  saveCategories(c: Categories, what: string) {
    this.categories = c
    const e = this.entry('Kategori Ayarları', 'GÜNCELLEME', what)
    return this.commit([{ t: 'categories', value: c }, { t: 'log', entries: [e] }])
  }

  // ---- bulk (demo data / import) ----
  async replaceAll(db: Database, note: string) {
    this.apply(db)
    const e = this.entry('Ayarlar', 'EKLEME', note)
    await this.commit([
      { t: 'put', table: 'items', rows: db.items },
      { t: 'put', table: 'bottles', rows: db.bottles },
      { t: 'put', table: 'primers', rows: db.primers },
      { t: 'categories', value: db.categories },
      { t: 'log', entries: [e] },
    ])
  }

  openOf(id: string) {
    return openBottlesOf(this.bottles, id)
  }
}

export const store = new Store()

export function blankItem(): Item {
  return {
    id: newId(), brand: '', name: '', purpose: '', storage: '', unit: '', skt: '', bottleSize: 0, sealed: 1,
    minStock: 1, cabinet: '', shelf: '', box: '', note: '', ordered: false, version: 0, updatedAt: '',
  }
}

export function blankPrimer(): Primer {
  return {
    id: newId(), organism: '', gene: '', fwSeq: '', rvSeq: '', fwTm: null, rvTm: null, amount: '',
    location: '', preparedAt: '', note: '', version: 0, updatedAt: '',
  }
}
