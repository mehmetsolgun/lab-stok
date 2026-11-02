import {
  DEFAULT_CATEGORIES, type Bottle, type Categories, type Database, type DigestConfig, type Item, type LogEntry, type Primer,
} from './domain/types'
import {
  daysUntil, newId, openBottlesOf, openSealed, spend, statusesOf, todayIso, totalUnits, type Status,
} from './domain/rules'
import type { Op, Storage } from './storage/types'
import { checkAdminPassword, makeAdminSecret, type AdminSecret } from './auth'
import { isDemoId } from './seed'
import type { ImportPayload } from './importer'
import { ui } from './ui.svelte'

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

export interface ItemSnap {
  item: Item
  bottles: Bottle[]
}

const FIELD_LABEL: Partial<Record<keyof Item, string>> = {
  skt: 'SKT', cabinet: 'Dolap', shelf: 'Raf', box: 'Kutu', minStock: 'Minimum stok', bottleSize: 'Hacim', sizeUnit: 'Birim',
  storage: 'Saklama', purpose: 'Amaç', brand: 'Marka', unit: 'Ambalaj', name: 'Ad', note: 'Not',
}

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
  /** What the server (Apps Script) announced it can do; e.g. 'digest' for the weekly e-mail. */
  serverCaps = $state.raw<string[]>([])
  digest = $state.raw<DigestConfig | null>(null)
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
      const first = storage.pull().then((fresh) => {
        this.serverCaps = storage.caps ?? []
        if (fresh) this.applyAll(fresh)
      })
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
        if (fresh) {
          this.serverCaps = this.storage.caps ?? []
          this.applyAll(fresh)
        }
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
    this.digest = db.digest
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

  /** Admin only. The server must announce the 'digest' capability, otherwise an old Apps Script would reject the change. */
  saveDigest(cfg: DigestConfig) {
    if (!this.isAdmin || !this.serverCaps.includes('digest')) return
    this.digest = cfg
    const e = this.entry('Ayarlar', 'GÜNCELLEME', cfg.enabled ? `Haftalık e-posta özeti açıldı (${cfg.emails.length} alıcı).` : 'Haftalık e-posta özeti kapatıldı.')
    return this.commit([{ t: 'digest', value: cfg }, { t: 'log', entries: [e] }])
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

  private entry(module: string, action: LogEntry['action'], detail: string, ref?: string): LogEntry {
    const e: LogEntry = { ts: new Date().toISOString(), user: this.user, module, action, detail, ...(ref ? { ref } : {}) }
    this.log = [...this.log, e]
    return e
  }

  // ---- items ----
  saveItem(input: Item, isNew: boolean) {
    const item = { ...input, version: input.version + 1, updatedAt: new Date().toISOString() }
    this.items = isNew ? [...this.items, item] : this.items.map((i) => (i.id === item.id ? item : i))
    const e = this.entry('Stok Sayım', isNew ? 'EKLEME' : 'GÜNCELLEME', `'${item.name}' ${isNew ? 'eklendi' : 'güncellendi'}.`, item.id)
    return this.commit([{ t: 'put', table: 'items', rows: [item] }, { t: 'log', entries: [e] }])
  }

  deleteItem(id: string) {
    const item = this.items.find((i) => i.id === id)
    if (!item) return
    const gone = this.bottles.filter((b) => b.itemId === id).map((b) => b.id)
    this.items = this.items.filter((i) => i.id !== id)
    this.bottles = this.bottles.filter((b) => b.itemId !== id)
    const e = this.entry('Stok Sayım', 'SİLME', `'${item.name}' silindi.`, id)
    return this.commit([
      { t: 'del', table: 'items', ids: [id] },
      { t: 'del', table: 'bottles', ids: gone },
      { t: 'log', entries: [e] },
    ])
  }

  // ---- undo ----
  /** State of one item and its open bottles: enough to undo any stock action on it. */
  private snap(id: string): ItemSnap | null {
    const item = this.items.find((i) => i.id === id)
    return item ? { item: { ...item }, bottles: this.bottles.filter((b) => b.itemId === id).map((b) => ({ ...b })) } : null
  }

  private offerUndo(text: string, snap: ItemSnap | null) {
    if (snap) ui.toast(text, 'ok', { label: 'Geri al', run: () => this.restore(snap) })
  }

  /** Put an item back to an earlier snapshot (the "Geri al" button). */
  restore(s: ItemSnap) {
    const now = this.items.find((i) => i.id === s.item.id)
    if (!now) return ui.toast('Ürün artık yok, geri alınamadı.')
    const restored = { ...s.item, version: now.version + 1, updatedAt: new Date().toISOString() }
    const keep = new Set(s.bottles.map((b) => b.id))
    const drop = this.bottles.filter((b) => b.itemId === s.item.id && !keep.has(b.id)).map((b) => b.id)
    this.items = this.items.map((i) => (i.id === s.item.id ? restored : i))
    this.bottles = [...this.bottles.filter((b) => b.itemId !== s.item.id), ...s.bottles]
    const e = this.entry('Stok Sayım', 'GÜNCELLEME', `'${s.item.name}' için son işlem geri alındı.`, s.item.id)
    void this.commit([
      { t: 'put', table: 'items', rows: [restored] },
      { t: 'put', table: 'bottles', rows: s.bottles },
      { t: 'del', table: 'bottles', ids: drop },
      { t: 'log', entries: [e] },
    ])
    ui.toast('Geri alındı', 'ok')
  }

  // ---- stock actions (return an error message, or '' on success) ----
  /** +1 / -1 sealed box. */
  adjustSealed(id: string, delta: 1 | -1, quiet = false): string {
    const item = this.items.find((i) => i.id === id)
    if (!item) return 'Ürün bulunamadı.'
    if (item.sealed + delta < 0) return 'Kapalı adet sıfırın altına düşemez.'
    const before = this.snap(id)
    const next = { ...item, sealed: item.sealed + delta, version: item.version + 1, updatedAt: new Date().toISOString() }
    // a delivery clears the "ordered" flag
    if (delta > 0) next.ordered = false
    this.items = this.items.map((i) => (i.id === id ? next : i))
    const e = this.entry('Stok Sayım', 'GÜNCELLEME', `'${item.name}' kapalı adedi ${delta > 0 ? 'artırıldı' : 'azaltıldı'} (Yeni: ${next.sealed}).`, id)
    void this.commit([{ t: 'put', table: 'items', rows: [next] }, { t: 'log', entries: [e] }])
    if (!quiet) this.offerUndo(`'${item.name}': kapalı adet ${next.sealed}`, before)
    return ''
  }

  /** Counting: set the sealed count to what was actually counted. */
  setSealed(id: string, count: number): string {
    const item = this.items.find((i) => i.id === id)
    if (!item) return 'Ürün bulunamadı.'
    if (!Number.isInteger(count) || count < 0) return 'Adet 0 veya daha büyük bir tam sayı olmalı.'
    if (count === item.sealed) return ''
    const next = { ...item, sealed: count, version: item.version + 1, updatedAt: new Date().toISOString() }
    if (count > item.sealed) next.ordered = false
    this.items = this.items.map((i) => (i.id === id ? next : i))
    const e = this.entry('Stok Sayım', 'GÜNCELLEME', `Sayım: '${item.name}' kapalı adedi ${item.sealed} → ${count}.`, id)
    void this.commit([{ t: 'put', table: 'items', rows: [next] }, { t: 'log', entries: [e] }])
    return ''
  }

  /** Counting: set how much is left in one open bottle. */
  setBottleRemaining(bottleId: string, remaining: number): string {
    const b = this.bottles.find((x) => x.id === bottleId)
    const item = b && this.items.find((i) => i.id === b.itemId)
    if (!b || !item) return 'Şişe bulunamadı.'
    if (!(remaining >= 0) || remaining > item.bottleSize) return `Kalan miktar 0 ile ${item.bottleSize} arasında olmalı.`
    if (remaining === b.remaining) return ''
    const next = { ...b, remaining }
    this.bottles = this.bottles.map((x) => (x.id === bottleId ? next : x))
    const unit = item.sizeUnit ? ' ' + item.sizeUnit : ''
    const e = this.entry('Stok Sayım', 'GÜNCELLEME', `Sayım: '${item.name}' açık şişesi ${b.remaining} → ${remaining}${unit}.`, item.id)
    void this.commit([{ t: 'put', table: 'bottles', rows: [next] }, { t: 'log', entries: [e] }])
    return ''
  }

  spendItem(id: string, amount: number, quiet = false): string {
    const item = this.items.find((i) => i.id === id)
    if (!item) return 'Ürün bulunamadı.'
    const before = this.snap(id)
    const r = spend(item, this.bottles, amount, this.today)
    if (!r.ok) return r.error
    const updated = { ...r.item, version: item.version + 1, updatedAt: new Date().toISOString() }
    const keptIds = new Set(r.bottles.map((b) => b.id))
    const removed = this.bottles.filter((b) => b.itemId === id && !keptIds.has(b.id)).map((b) => b.id)
    this.items = this.items.map((i) => (i.id === id ? updated : i))
    this.bottles = [...this.bottles.filter((b) => b.itemId !== id), ...r.bottles]
    const extra = r.opened ? ` (${r.opened} yeni ${item.unit.toLocaleLowerCase('tr')} açıldı)` : ''
    const e = this.entry('Stok Sayım', 'HARCAMA', `'${item.name}' ürününden ${amount}${item.sizeUnit ? ' ' + item.sizeUnit : ' birim'} harcandı${extra}.`, id)
    void this.commit([
      { t: 'put', table: 'items', rows: [updated] },
      { t: 'put', table: 'bottles', rows: r.bottles },
      { t: 'del', table: 'bottles', ids: removed },
      { t: 'log', entries: [e] },
    ])
    if (!quiet) this.offerUndo(`'${item.name}': ${amount}${item.sizeUnit ? ' ' + item.sizeUnit : ''} harcandı`, before)
    return ''
  }

  openNew(id: string, quiet = false): string {
    const item = this.items.find((i) => i.id === id)
    if (!item) return 'Ürün bulunamadı.'
    const before = this.snap(id)
    const r = openSealed(item, this.today)
    if (!r) return 'Kapalı ürün kalmadı.'
    const updated = { ...r.item, version: item.version + 1, updatedAt: new Date().toISOString() }
    this.items = this.items.map((i) => (i.id === id ? updated : i))
    this.bottles = [...this.bottles, r.bottle]
    const e = this.entry('Stok Sayım', 'GÜNCELLEME', `'${item.name}' için yeni şişe/paket açıldı.`, id)
    void this.commit([
      { t: 'put', table: 'items', rows: [updated] },
      { t: 'put', table: 'bottles', rows: [r.bottle] },
      { t: 'log', entries: [e] },
    ])
    if (!quiet) this.offerUndo(`'${item.name}': yeni şişe açıldı`, before)
    return ''
  }

  /** Edit some fields of one or many items at once (inline editing, bulk editing). Returns how many changed. */
  patchItems(ids: string[], patch: Partial<Item>): number {
    const set = new Set(ids)
    const rows: Item[] = []
    const now = new Date().toISOString()
    this.items = this.items.map((i) => {
      if (!set.has(i.id)) return i
      const changed = (Object.keys(patch) as (keyof Item)[]).some((k) => i[k] !== patch[k])
      if (!changed) return i
      const n = { ...i, ...patch, version: i.version + 1, updatedAt: now }
      rows.push(n)
      return n
    })
    if (!rows.length) return 0
    const what = (Object.keys(patch) as (keyof Item)[]).map((k) => `${FIELD_LABEL[k] ?? k}: ${patch[k] === '' ? '(boş)' : patch[k]}`).join(', ')
    const e = rows.length === 1
      ? this.entry('Stok Sayım', 'GÜNCELLEME', `'${rows[0].name}' güncellendi (${what}).`, rows[0].id)
      : this.entry('Stok Sayım', 'GÜNCELLEME', `${rows.length} ürün toplu güncellendi (${what}).`)
    void this.commit([{ t: 'put', table: 'items', rows }, { t: 'log', entries: [e] }])
    return rows.length
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

  // ---- bulk (demo data / reset) ----
  /** Appends records; existing ones are left alone. */
  async addMany(db: Pick<Database, 'items' | 'bottles' | 'primers'>, note: string) {
    this.items = [...this.items, ...db.items]
    this.bottles = [...this.bottles, ...db.bottles]
    this.primers = [...this.primers, ...db.primers]
    const e = this.entry('Ayarlar', 'EKLEME', note)
    await this.commit([
      { t: 'put', table: 'items', rows: db.items },
      { t: 'put', table: 'bottles', rows: db.bottles },
      { t: 'put', table: 'primers', rows: db.primers },
      { t: 'log', entries: [e] },
    ])
  }

  /** Admin only. Upserts by id (re-importing the same file changes nothing); categories, if given, replace the lists. */
  async importData(p: ImportPayload) {
    if (!this.isAdmin) return
    const upsert = <T extends { id: string }>(cur: T[], inc: T[]) => {
      const ids = new Set(inc.map((x) => x.id))
      return [...cur.filter((x) => !ids.has(x.id)), ...inc]
    }
    this.items = upsert(this.items, p.items)
    this.bottles = upsert(this.bottles, p.bottles)
    this.primers = upsert(this.primers, p.primers)
    const ops: Op[] = [
      { t: 'put', table: 'items', rows: p.items },
      { t: 'put', table: 'bottles', rows: p.bottles },
      { t: 'put', table: 'primers', rows: p.primers },
    ]
    if (p.categories) {
      this.categories = p.categories
      ops.push({ t: 'categories', value: p.categories })
    }
    if (p.members?.length) {
      this.members = p.members
      ops.push({ t: 'members', value: p.members })
    }
    const e = this.entry('Ayarlar', 'EKLEME', `Dosyadan içe aktarıldı: ${p.items.length} ürün, ${p.bottles.length} açık şişe, ${p.primers.length} primer.`)
    await this.commit([...ops, { t: 'log', entries: [e] }])
  }

  /** Admin only: make the data exactly what the backup holds (everything else is deleted first). */
  async restoreAll(p: ImportPayload) {
    if (!this.isAdmin) return
    await this.clearAllData()
    await this.importData(p)
  }

  get demoCount() {
    return this.items.filter((i) => isDemoId(i.id)).length + this.primers.filter((p) => isDemoId(p.id)).length
  }

  /** Removes only the records created by "demo veri ekle". */
  async deleteDemo() {
    const items = this.items.filter((i) => isDemoId(i.id))
    const primers = this.primers.filter((p) => isDemoId(p.id))
    await this.purge(
      new Set(items.map((i) => i.id)), new Set(primers.map((p) => p.id)),
      `Demo veri silindi (${items.length} ürün, ${primers.length} primer).`,
    )
  }

  /** Admin only. Removes every stock item, open bottle and primer; log, members and categories stay. */
  async clearAllData() {
    if (!this.isAdmin) return
    const n = this.items.length, m = this.primers.length
    await this.purge(new Set(this.items.map((i) => i.id)), new Set(this.primers.map((p) => p.id)), `Tüm stok ve primer verisi silindi (${n} ürün, ${m} primer).`)
  }

  private async purge(itemIds: Set<string>, primerIds: Set<string>, note: string) {
    const bottleIds = this.bottles.filter((b) => itemIds.has(b.itemId)).map((b) => b.id)
    this.items = this.items.filter((i) => !itemIds.has(i.id))
    this.bottles = this.bottles.filter((b) => !itemIds.has(b.itemId))
    this.primers = this.primers.filter((p) => !primerIds.has(p.id))
    const e = this.entry('Ayarlar', 'SİLME', note)
    await this.commit([
      { t: 'del', table: 'items', ids: [...itemIds] },
      { t: 'del', table: 'bottles', ids: bottleIds },
      { t: 'del', table: 'primers', ids: [...primerIds] },
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
    id: newId(), brand: '', name: '', purpose: '', storage: '', unit: '', skt: '', bottleSize: 0, sizeUnit: '', sealed: 1,
    minStock: 1, cabinet: '', shelf: '', box: '', note: '', ordered: false, version: 0, updatedAt: '',
  }
}

export function blankPrimer(): Primer {
  return {
    id: newId(), organism: '', gene: '', fwSeq: '', rvSeq: '', fwTm: null, rvTm: null, amount: '',
    location: '', preparedAt: '', note: '', version: 0, updatedAt: '',
  }
}
