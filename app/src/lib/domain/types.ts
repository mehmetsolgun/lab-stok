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
  sizeUnit: string // unit of bottleSize and of every open bottle: ml, g, adet, % ...
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
  ref?: string // id of the item/primer this entry is about (older entries have none)
}

/** Weekly e-mail summary, sent by the Apps Script on the server. day: 1 = Monday … 7 = Sunday. */
export interface DigestConfig {
  enabled: boolean
  emails: string[]
  day: number
  backup: boolean // attach a backup file to the e-mail
  appUrl?: string // link shown in the e-mail
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
  digest: DigestConfig | null
}

export const DEFAULT_CATEGORIES: Categories = {
  purpose: ['Sarf Malzeme', 'Kimyasal', 'PCR', 'Western Blot', 'Hücre Kültürü'],
  storage: ['Oda Sıcaklığı', '+4°C', '-20°C', '-80°C', 'Çekmece'],
  unit: ['Adet', 'Kutu', 'Şişe', 'Paket', 'Tüp'],
  organism: ['İnsan', 'Fare', 'Sıçan', 'Köpek', 'Bakteri'],
}
