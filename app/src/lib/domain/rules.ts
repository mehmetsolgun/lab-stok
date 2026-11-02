import type { Bottle, Item } from './types'

export const LOW_BOTTLE_RATIO = 0.15
export const SKT_WARN_DAYS = 30

export type SpendResult =
  | { ok: true; item: Item; bottles: Bottle[]; opened: number; emptied: string[] }
  | { ok: false; error: string }

let seq = 0
export function newId(): string {
  seq = (seq + 1) % 1296
  return Date.now().toString(36) + seq.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6)
}

export function openBottlesOf(bottles: Bottle[], itemId: string): Bottle[] {
  return bottles.filter((b) => b.itemId === itemId).sort((a, b) => a.openedAt.localeCompare(b.openedAt))
}

/** Total boxes/bottles on hand: sealed + currently open ones. */
export function totalUnits(item: Item, open: Bottle[]): number {
  return item.sealed + open.length
}

/** Total consumable amount (volume or count) across open bottles and sealed ones. */
export function totalAmount(item: Item, open: Bottle[]): number {
  return open.reduce((s, b) => s + b.remaining, 0) + item.sealed * item.bottleSize
}

export function fillPercent(item: Item, bottle: Bottle): number {
  return item.bottleSize > 0 ? Math.round((bottle.remaining / item.bottleSize) * 100) : 100
}

/**
 * Take `amount` out of stock. Uses open bottles oldest-first; when none is left
 * a sealed one is opened automatically. Refuses to spend more than exists.
 */
export function spend(item: Item, allBottles: Bottle[], amount: number, today: string): SpendResult {
  if (!(amount > 0)) return { ok: false, error: 'Miktar sıfırdan büyük olmalı.' }
  if (item.bottleSize <= 0) return { ok: false, error: 'Bu ürün için şişe hacmi tanımlı değil; Adet Düş kullanın.' }
  const open = openBottlesOf(allBottles, item.id).map((b) => ({ ...b }))
  if (amount > totalAmount(item, open) + 1e-9) return { ok: false, error: 'Stoktaki toplam miktardan fazlası harcanamaz.' }

  let sealed = item.sealed
  let left = amount
  let opened = 0
  const emptied: string[] = []
  const queue = [...open]
  while (left > 1e-9) {
    let cur = queue[0]
    if (!cur) {
      sealed -= 1
      opened += 1
      cur = { id: newId(), itemId: item.id, remaining: item.bottleSize, openedAt: today }
      open.push(cur)
      queue.push(cur)
    }
    const take = Math.min(cur.remaining, left)
    cur.remaining = round(cur.remaining - take)
    left = round(left - take)
    if (cur.remaining <= 1e-9) {
      emptied.push(cur.id)
      queue.shift()
    }
  }
  const kept = open.filter((b) => !emptied.includes(b.id))
  return { ok: true, item: { ...item, sealed }, bottles: kept, opened, emptied }
}

/** Manually open one sealed unit (e.g. user starts a new bottle). */
export function openSealed(item: Item, today: string): { item: Item; bottle: Bottle } | null {
  if (item.sealed < 1) return null
  return {
    item: { ...item, sealed: item.sealed - 1 },
    bottle: { id: newId(), itemId: item.id, remaining: item.bottleSize, openedAt: today },
  }
}

export function round(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

// ---- dates ----

export function todayIso(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Accepts DD-MM-YYYY, DD.MM.YYYY, DD/MM/YYYY or ISO; returns ISO or null. */
export function parseDate(s: string): string | null {
  const t = s.trim()
  if (!t) return ''
  let y: number, m: number, d: number
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]]
  else if ((r = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(t))) [d, m, y] = [+r[1], +r[2], +r[3]]
  else return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function formatDate(iso: string): string {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return r ? `${r[3]}-${r[2]}-${r[1]}` : iso
}

export function daysUntil(iso: string, today: string): number | null {
  if (!iso) return null
  const a = Date.parse(iso + 'T00:00:00Z')
  const b = Date.parse(today + 'T00:00:00Z')
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((a - b) / 86400000)
}

// ---- alerts ----

export type Status = 'critical' | 'low' | 'expired' | 'expiring'

export function statusesOf(item: Item, open: Bottle[], today: string): Status[] {
  const out: Status[] = []
  if (item.minStock > 0 && totalUnits(item, open) < item.minStock) out.push('critical')
  if (item.bottleSize > 0 && open.some((b) => b.remaining / item.bottleSize < LOW_BOTTLE_RATIO)) out.push('low')
  const d = daysUntil(item.skt, today)
  if (d !== null) {
    if (d < 0) out.push('expired')
    else if (d <= SKT_WARN_DAYS) out.push('expiring')
  }
  return out
}

/** Suggested order quantity: refill to twice the minimum. */
export function suggestedOrder(item: Item, open: Bottle[]): number {
  return Math.max(1, item.minStock * 2 - totalUnits(item, open))
}

// ---- data completeness ("Eksikler" view) ----

export type Missing = 'skt' | 'location' | 'minStock' | 'size' | 'brand' | 'purpose' | 'storage'

export const MISSING_LABEL: Record<Missing, string> = {
  skt: 'SKT yok', location: 'Konum yok', minStock: 'Min. stok 0', size: 'Hacim yok', brand: 'Marka yok', purpose: 'Amaç yok', storage: 'Saklama yok',
}

/** Which useful fields of an item are still empty. Volume only counts for bottles (Şişe), where fill tracking matters. */
export function missingOf(item: Item): Missing[] {
  const out: Missing[] = []
  if (!item.skt) out.push('skt')
  if (!item.cabinet && !item.shelf && !item.box) out.push('location')
  if (item.minStock === 0) out.push('minStock')
  if (item.unit === 'Şişe' && item.bottleSize <= 0) out.push('size')
  if (!item.brand.trim()) out.push('brand')
  if (!item.purpose) out.push('purpose')
  if (!item.storage) out.push('storage')
  return out
}

// ---- primers ----

export function cleanSeq(s: string): string {
  return s.replace(/[^A-Za-z]/g, '').toUpperCase()
}

export function isValidSeq(s: string): boolean {
  return s === '' || /^[ACGTUNRYKMSWBDHV]+$/.test(s)
}

export function gcPercent(seq: string): number | null {
  const s = seq.toUpperCase()
  if (!s) return null
  const gc = [...s].filter((c) => c === 'G' || c === 'C').length
  return Math.round((gc / s.length) * 1000) / 10
}
