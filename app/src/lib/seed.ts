import { DEFAULT_CATEGORIES, type Bottle, type Database, type Item, type Primer } from './domain/types'
import { newId } from './domain/rules'

const BRANDS = ['Sigma', 'Thermo', 'Merck', 'Qiagen', 'Bio-Rad', 'Roche', 'Invitrogen', 'Corning', 'Eppendorf', 'NEB']
const NAMES = ['Etanol %96', 'Trizol', 'Tris-HCl', 'Taq Polimeraz', 'dNTP Mix', 'Agaroz', 'Etidyum Bromür', 'SDS', 'PBS', 'DMEM',
  'FBS', 'Tripsin', 'Proteinaz K', 'Kloroform', 'İzopropanol', 'EDTA', 'Tween 20', 'BSA', 'Pipet Ucu 200µl', 'Ependorf 1.5ml']
const GENES = ['GAPDH', 'Beta-Aktin', 'TNF-alfa', 'IL-6', 'MC1R', 'MSTN', 'CD36', 'TP53', 'MYC', 'BRCA1']

/** Demo records get a recognizable id so they can be removed later without touching real data. */
export const DEMO_PREFIX = 'demo_'
export const isDemoId = (id: string) => id.startsWith(DEMO_PREFIX)
const did = () => DEMO_PREFIX + newId()

function rnd<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)]
}
function seq(n: number) {
  return Array.from({ length: n }, () => 'ACGT'[Math.floor(Math.random() * 4)]).join('')
}
function isoIn(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
}

export function makeDemo(nItems: number, nPrimers: number): Database {
  const items: Item[] = []
  const bottles: Bottle[] = []
  const now = new Date().toISOString()
  for (let i = 0; i < nItems; i++) {
    const size = rnd([0, 100, 250, 500, 1000])
    const it: Item = {
      id: did(), brand: rnd(BRANDS), name: `${rnd(NAMES)} ${i + 1}`, purpose: rnd(DEFAULT_CATEGORIES.purpose),
      storage: rnd(DEFAULT_CATEGORIES.storage), unit: rnd(DEFAULT_CATEGORIES.unit),
      skt: Math.random() < 0.8 ? isoIn(Math.floor(Math.random() * 700) - 20) : '',
      bottleSize: size, sizeUnit: size ? 'ml' : '', sealed: Math.floor(Math.random() * 5), minStock: Math.floor(Math.random() * 4),
      cabinet: 'Dolap ' + (1 + (i % 8)), shelf: 'Raf ' + (1 + (i % 4)), box: Math.random() < 0.5 ? 'Kutu ' + (1 + (i % 12)) : '',
      note: '', ordered: false, version: 1, updatedAt: now,
    }
    items.push(it)
    if (size > 0) {
      const n = Math.random() < 0.15 ? 2 : 1
      for (let k = 0; k < n; k++) {
        bottles.push({ id: did(), itemId: it.id, remaining: Math.round(size * Math.random()), openedAt: isoIn(-Math.floor(Math.random() * 90)) })
      }
    }
  }
  const primers: Primer[] = []
  for (let i = 0; i < nPrimers; i++) {
    primers.push({
      id: did(), organism: rnd(DEFAULT_CATEGORIES.organism), gene: `${rnd(GENES)}-${i + 1}`,
      fwSeq: seq(18 + (i % 6)), rvSeq: seq(18 + (i % 5)), fwTm: 55 + Math.round(Math.random() * 100) / 10,
      rvTm: 55 + Math.round(Math.random() * 100) / 10, amount: '100 µM / 200 µl', location: 'Kutu ' + (1 + (i % 10)),
      preparedAt: isoIn(-Math.floor(Math.random() * 400)), note: '', version: 1, updatedAt: now,
    })
  }
  return { items, bottles, primers, log: [], categories: DEFAULT_CATEGORIES, members: [], admin: null, digest: null }
}
