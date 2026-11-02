import { DEFAULT_CATEGORIES, type Bottle, type Categories, type Item, type Primer } from './domain/types'
import { isValidSeq } from './domain/rules'
import { toBottle, toItem, toPrimer } from './storage/schema'

export const IMPORT_FORMAT = 'labstok-import-v1'

export interface ImportPayload {
  items: Item[]
  bottles: Bottle[]
  primers: Primer[]
  categories: Categories | null
  members: string[] | null // only backups carry the member list
}

export type ParseResult = { ok: true; payload: ImportPayload; warnings: string[] } | { ok: false; error: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const strList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? [...new Set(v.map((x) => x.trim()).filter(Boolean))] : null

/** Validates a labstok-import-v1 file. Never throws; every problem is reported in Turkish. */
export function parseImport(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Dosya geçerli bir JSON değil.' }
  }
  if (!isObj(raw) || raw.format !== IMPORT_FORMAT) return { ok: false, error: `Bu dosya Lab Stok içe aktarma dosyası değil (format: ${IMPORT_FORMAT}).` }
  const arr = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as unknown[]) : [])
  for (const k of ['items', 'bottles', 'primers']) if (raw[k] !== undefined && !Array.isArray(raw[k])) return { ok: false, error: `"${k}" bir liste olmalı.` }

  const warnings: string[] = []
  const items = arr('items').filter(isObj).map(toItem)
  const bottles = arr('bottles').filter(isObj).map(toBottle)
  const primers = arr('primers').filter(isObj).map(toPrimer)

  const ids = new Set<string>()
  for (const [kind, list] of [['ürün', items], ['şişe', bottles], ['primer', primers]] as const) {
    ids.clear()
    for (const r of list) {
      if (!r.id) return { ok: false, error: `Kimliği (id) olmayan bir ${kind} kaydı var.` }
      if (ids.has(r.id)) return { ok: false, error: `Aynı kimlik iki kez kullanılmış (${kind}): ${r.id}` }
      ids.add(r.id)
    }
  }
  const itemIds = new Set(items.map((i) => i.id))
  for (const i of items) if (!i.name.trim()) return { ok: false, error: `Adı boş ürün: ${i.id}` }
  for (const p of primers) {
    if (!p.gene.trim()) return { ok: false, error: `Hedef geni boş primer: ${p.id}` }
    if (!isValidSeq(p.fwSeq) || !isValidSeq(p.rvSeq)) return { ok: false, error: `Geçersiz dizilim harfi: ${p.gene} (${p.id})` }
  }
  for (const b of bottles) {
    if (!itemIds.has(b.itemId)) return { ok: false, error: `Ürünü olmayan açık şişe: ${b.id}` }
    const it = items.find((i) => i.id === b.itemId)!
    if (it.bottleSize <= 0) warnings.push(`'${it.name}': açık şişe var ama hacim tanımlı değil.`)
    else if (b.remaining > it.bottleSize) warnings.push(`'${it.name}': kalan miktar şişe hacminden büyük.`)
  }

  let categories: Categories | null = null
  if (raw.categories !== undefined) {
    if (!isObj(raw.categories)) return { ok: false, error: '"categories" bir nesne olmalı.' }
    const c = { ...DEFAULT_CATEGORIES }
    for (const k of Object.keys(DEFAULT_CATEGORIES) as (keyof Categories)[]) {
      if (raw.categories[k] === undefined) continue
      const list = strList(raw.categories[k])
      if (!list) return { ok: false, error: `Kategori listesi geçersiz: ${k}` }
      c[k] = list
    }
    categories = c
    // a category value an imported record uses must exist, otherwise the form dropdown shows it blank
    const need: [keyof Categories, string, string][] = [
      ...items.flatMap((i) => [['purpose', i.purpose, i.name], ['storage', i.storage, i.name], ['unit', i.unit, i.name]] as [keyof Categories, string, string][]),
      ...primers.map((p) => ['organism', p.organism, p.gene] as [keyof Categories, string, string]),
    ]
    for (const [k, v, who] of need) if (v && !c[k].includes(v)) return { ok: false, error: `'${who}' için kategori listesinde olmayan değer: ${k} = '${v}'` }
  }
  let members: string[] | null = null
  if (raw.members !== undefined) {
    members = strList(raw.members)
    if (!members) return { ok: false, error: '"members" bir isim listesi olmalı.' }
  }
  return { ok: true, payload: { items, bottles, primers, categories, members }, warnings }
}
