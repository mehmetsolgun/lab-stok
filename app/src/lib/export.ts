import { formatDate, suggestedOrder } from './domain/rules'
import type { ItemRow } from './state.svelte'
import { locationOf, store } from './state.svelte'

type Cell = string | number | null

async function build(sheets: { name: string; head: string[]; rows: Cell[][] }[]): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name, { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.addRow(s.head).font = { bold: true }
    for (const r of s.rows) ws.addRow(r)
    ws.columns.forEach((col, i) => {
      let w = s.head[i].length
      for (const r of s.rows.slice(0, 500)) w = Math.max(w, String(r[i] ?? '').length)
      col.width = Math.min(60, w + 2)
    })
  }
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}_${p(d.getMonth() + 1)}_${d.getFullYear()}_${p(d.getHours())}${p(d.getMinutes())}`
}

export async function exportAll() {
  const stock = store.itemRows.map((r) => [
    r.item.brand, r.item.name, r.item.purpose, r.item.storage, r.item.unit, r.item.skt ? formatDate(r.item.skt) : '',
    r.item.bottleSize, r.item.sizeUnit, r.open.map((b) => b.remaining).join(' + '), r.item.sealed, r.total, r.item.minStock, locationOf(r.item), r.item.note,
  ])
  const primers = store.primers.map((p) => [p.gene, p.organism, p.fwSeq, p.rvSeq, p.fwTm, p.rvTm, p.amount, p.location, p.preparedAt ? formatDate(p.preparedAt) : '', p.note])
  const log = [...store.log].reverse().map((l) => [l.ts.replace('T', ' ').slice(0, 19), l.user, l.module, l.action, l.detail])
  const blob = await build([
    { name: 'Stok Sayım', head: ['Marka', 'Malzeme', 'Kullanım Amacı', 'Saklama', 'Birim', 'SKT', 'Şişe Hacmi', 'Hacim Birimi', 'Açık Şişelerde Kalan', 'Kapalı Adet', 'Toplam Adet', 'Min. Stok', 'Konum', 'Not'], rows: stock },
    { name: 'PCR Primerler', head: ['Hedef Gen', 'Canlı Türü', 'Forward (5\'→3\')', 'Reverse (5\'→3\')', 'Forward Tm', 'Reverse Tm', 'Miktar', 'Konum', 'Hazırlanma', 'Notlar'], rows: primers },
    { name: 'İşlem Geçmişi', head: ['Tarih/Saat', 'Kullanıcı', 'Modül', 'İşlem', 'Detay'], rows: log },
  ])
  download(blob, `Stok_Raporu_${stamp()}.xlsx`)
}

export async function exportOrders(rows: ItemRow[], qty: Map<string, number>) {
  const data = rows.map((r) => [r.item.brand, r.item.name, r.item.unit, r.total, r.item.minStock, qty.get(r.item.id) ?? suggestedOrder(r.item, r.open), locationOf(r.item)])
  download(await build([{ name: 'Sipariş Listesi', head: ['Marka', 'Malzeme', 'Birim', 'Mevcut', 'Min. Stok', 'Sipariş Adedi', 'Konum'], rows: data }]), `Siparis_Listesi_${stamp()}.xlsx`)
}
