export interface Bottle {
  id: string
  itemId: string
  remaining: number
  openedAt: string // ISO date
}

export interface Item {
  id: string
  brand: string
  name: string
  purpose: string
  storage: string
  unit: string
  skt: string // ISO YYYY-MM-DD or ''
  bottleSize: number // capacity of one bottle/pack; 0 = not volume tracked
  sealed: number // unopened boxes/bottles
  minStock: number
  cabinet: string
  shelf: string
  box: string
  note: string
  ordered: boolean // order placed, waiting for delivery
  version: number
  updatedAt: string
}

export interface Primer {
  id: string
  organism: string
  gene: string
  fwSeq: string
  rvSeq: string
  fwTm: number | null
  rvTm: number | null
  amount: string
  location: string
  preparedAt: string
  note: string
  version: number
  updatedAt: string
}

export interface LogEntry {
  ts: string
  user: string
  module: string
  action: 'EKLEME' | 'GÜNCELLEME' | 'SİLME' | 'HARCAMA'
  detail: string
}

export interface Categories {
  purpose: string[]
  storage: string[]
  unit: string[]
  organism: string[]
}

export interface Database {
  items: Item[]
  bottles: Bottle[]
  primers: Primer[]
  log: LogEntry[]
  categories: Categories
  members: string[]
  admin: { salt: string; hash: string } | null
}

export const DEFAULT_CATEGORIES: Categories = {
  purpose: ['Sarf Malzeme', 'Kimyasal', 'PCR', 'Western Blot', 'Hücre Kültürü'],
  storage: ['Oda Sıcaklığı', '+4°C', '-20°C', '-80°C', 'Çekmece'],
  unit: ['Adet', 'Kutu', 'Şişe', 'Paket', 'Tüp'],
  organism: ['İnsan', 'Fare', 'Sıçan', 'Köpek', 'Bakteri'],
}
