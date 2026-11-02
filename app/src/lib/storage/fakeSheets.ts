// Test helper: runs apps-script/Code.gs against an in-memory imitation of Google Sheets.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

type Cell = string | number | Date
const looksAutoConverted = (v: string) => /^=/.test(v) || /^-?\d+([.,]\d+)?(e\d+)?$/i.test(v) || /^\d{1,4}[-./]\d{1,2}([-./]\d{1,4})?$/.test(v)

class FakeRange {
  s: FakeSheet
  r: number
  c: number
  nr: number
  nc: number
  constructor(s: FakeSheet, r: number, c: number, nr: number, nc: number) {
    this.s = s
    this.r = r
    this.c = c
    this.nr = nr
    this.nc = nc
  }
  getValues(): Cell[][] {
    const out: Cell[][] = []
    for (let i = 0; i < this.nr; i++) {
      const row: Cell[] = []
      for (let j = 0; j < this.nc; j++) row.push(this.s.grid[this.r - 1 + i]?.[this.c - 1 + j] ?? '')
      out.push(row)
    }
    return out
  }
  setNumberFormat(f: string) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.s.fmt.set(`${this.r + i},${this.c + j}`, f)
    return this
  }
  setValues(m: Cell[][]) {
    if (m.length !== this.nr || m.some((row) => row.length !== this.nc)) throw new Error('setValues: boyut uyuşmuyor')
    m.forEach((row, i) =>
      row.forEach((v, j) => {
        const rr = this.r - 1 + i, cc = this.c - 1 + j
        const isText = this.s.fmt.get(`${rr + 1},${cc + 1}`) === '@'
        // real Sheets turns "=1+1", "2026-01-01", "1-2", "007" into formulas/dates/numbers unless the cell is plain text
        const stored = !isText && typeof v === 'string' && looksAutoConverted(v) ? (v.startsWith('=') ? '#FORMULA' : Number(v.replace(',', '.')) || new Date(0)) : v
        while (this.s.grid.length <= rr) this.s.grid.push([])
        this.s.grid[rr][cc] = stored
      }),
    )
    return this
  }
  clearContent() {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) if (this.s.grid[this.r - 1 + i]) this.s.grid[this.r - 1 + i][this.c - 1 + j] = ''
    return this
  }
}

class FakeSheet {
  grid: Cell[][] = []
  fmt = new Map<string, string>()
  name: string
  constructor(name: string) {
    this.name = name
  }
  getName() { return this.name }
  getLastRow() {
    for (let i = this.grid.length - 1; i >= 0; i--) if (this.grid[i].some((v) => v !== '' && v !== undefined)) return i + 1
    return 0
  }
  getLastColumn() {
    let max = 0
    for (const row of this.grid) for (let j = row.length - 1; j >= 0; j--) if (row[j] !== '' && row[j] !== undefined) { max = Math.max(max, j + 1); break }
    return max
  }
  getRange(r: number, c: number, nr = 1, nc = 1) { return new FakeRange(this, r, c, nr, nc) }
  deleteRow(r: number) { this.grid.splice(r - 1, 1) }
}

export interface Backend {
  doPost(e: { postData: { contents: string } }): { text: string }
  setup(): string
  resetKey(): string
  sheets: Map<string, FakeSheet>
  props: Map<string, string>
  fetch: (url: string, init: RequestInit) => Promise<Response>
}

export function makeBackend(): Backend {
  const here = dirname(fileURLToPath(import.meta.url))
  const code = readFileSync(resolve(here, '../../../../apps-script/Code.gs'), 'utf8')
  const sheets = new Map<string, FakeSheet>()
  const props = new Map<string, string>()
  const env = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n: string) => sheets.get(n) ?? null,
        insertSheet: (n: string) => { const s = new FakeSheet(n); sheets.set(n, s); return s },
      }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => void props.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ text, setMimeType() { return this } }) },
    Utilities: { getUuid: () => crypto.randomUUID() },
    Logger: { log() {} },
  }
  const fn = new Function(...Object.keys(env), code + '\n;return { doPost, setup, resetKey };')
  const api = fn(...Object.values(env)) as Pick<Backend, 'doPost' | 'setup' | 'resetKey'>
  return {
    ...api,
    sheets,
    props,
    fetch: async (_url, init) => {
      const out = api.doPost({ postData: { contents: String(init.body) } })
      return { json: async () => JSON.parse(out.text) } as Response
    },
  }
}
