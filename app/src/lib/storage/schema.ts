import { DEFAULT_CATEGORIES, type Bottle, type Categories, type Database, type Item, type LogEntry, type Primer } from '../domain/types'

// Sheets stores every cell as text, so values come back as strings and are coerced here.
type Raw = Record<string, unknown>

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const n = (v: unknown) => {
  const x = Number(v)
  return v === '' || v === null || v === undefined || Number.isNaN(x) ? 0 : x
}
const nn = (v: unknown) => {
  if (v === '' || v === null || v === undefined) return null
  const x = Number(v)
  return Number.isNaN(x) ? null : x
}
const b = (v: unknown) => v === true || v === 'true' || v === 'TRUE'

export const toItem = (r: Raw): Item => ({
  id: s(r.id), brand: s(r.brand), name: s(r.name), purpose: s(r.purpose), storage: s(r.storage), unit: s(r.unit),
  skt: s(r.skt), bottleSize: n(r.bottleSize), sealed: n(r.sealed), minStock: n(r.minStock), cabinet: s(r.cabinet),
  shelf: s(r.shelf), box: s(r.box), note: s(r.note), ordered: b(r.ordered), version: n(r.version), updatedAt: s(r.updatedAt),
})

export const toBottle = (r: Raw): Bottle => ({
  id: s(r.id), itemId: s(r.itemId), remaining: n(r.remaining), openedAt: s(r.openedAt),
})

export const toPrimer = (r: Raw): Primer => ({
  id: s(r.id), organism: s(r.organism), gene: s(r.gene), fwSeq: s(r.fwSeq), rvSeq: s(r.rvSeq), fwTm: nn(r.fwTm), rvTm: nn(r.rvTm),
  amount: s(r.amount), location: s(r.location), preparedAt: s(r.preparedAt), note: s(r.note), version: n(r.version), updatedAt: s(r.updatedAt),
})

export const toLog = (r: Raw): LogEntry => ({
  ts: s(r.ts), user: s(r.user), module: s(r.module), action: s(r.action) as LogEntry['action'], detail: s(r.detail),
})

function parseMeta<T>(v: unknown, fallback: T): T {
  if (typeof v !== 'string' || !v) return fallback
  try {
    return JSON.parse(v) as T
  } catch {
    return fallback
  }
}

export interface RemoteLoad {
  tables: { items: Raw[]; bottles: Raw[]; primers: Raw[]; log: Raw[] }
  meta: Record<string, unknown>
}

export function toDatabase(r: RemoteLoad): Database {
  const cats = parseMeta<Partial<Categories>>(r.meta.categories, {})
  return {
    items: r.tables.items.map(toItem).filter((x) => x.id),
    bottles: r.tables.bottles.map(toBottle).filter((x) => x.id),
    primers: r.tables.primers.map(toPrimer).filter((x) => x.id),
    log: r.tables.log.map(toLog).sort((a, c) => a.ts.localeCompare(c.ts)),
    categories: { ...DEFAULT_CATEGORIES, ...cats },
    members: parseMeta<string[]>(r.meta.members, []),
    admin: parseMeta<Database['admin']>(r.meta.admin, null),
  }
}
