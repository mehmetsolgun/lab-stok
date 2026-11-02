import { describe, expect, it } from 'vitest'
import { IMPORT_FORMAT, parseImport } from './importer'

const base = (o: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: IMPORT_FORMAT,
    categories: { purpose: ['PCR / qPCR'], storage: ['+4°C Dolap'], unit: ['Şişe'], organism: ['Sıçan'] },
    items: [{ id: 'i1', name: 'Etanol', purpose: 'PCR / qPCR', storage: '+4°C Dolap', unit: 'Şişe', bottleSize: 500, sizeUnit: 'ml', sealed: 1 }],
    bottles: [{ id: 'b1', itemId: 'i1', remaining: 200, openedAt: '2026-11-02' }],
    primers: [{ id: 'p1', gene: 'GAPDH', organism: 'Sıçan', fwSeq: 'ACGT', rvSeq: '', fwTm: 59.9, rvTm: '' }],
    ...o,
  })

describe('parseImport', () => {
  it('accepts a valid file and coerces types', () => {
    const r = parseImport(base())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payload.items[0]).toMatchObject({ sealed: 1, bottleSize: 500, sizeUnit: 'ml', ordered: false })
    expect(r.payload.primers[0]).toMatchObject({ fwTm: 59.9, rvTm: null })
    expect(r.warnings).toEqual([])
  })
  it('rejects broken input with a clear reason', () => {
    expect(parseImport('{').ok).toBe(false)
    expect(parseImport('{"format":"x"}').ok).toBe(false)
    const dup = parseImport(base({ items: [{ id: 'a', name: 'x' }, { id: 'a', name: 'y' }], bottles: [] }))
    expect(dup.ok === false && dup.error).toContain('iki kez')
    const orphan = parseImport(base({ bottles: [{ id: 'b', itemId: 'yok', remaining: 1 }] }))
    expect(orphan.ok === false && orphan.error).toContain('Ürünü olmayan')
    const badSeq = parseImport(base({ primers: [{ id: 'p', gene: 'G', fwSeq: 'ACGX' }] }))
    expect(badSeq.ok === false && badSeq.error).toContain('dizilim')
  })
  it('rejects category values missing from the lists', () => {
    const r = parseImport(base({ items: [{ id: 'i', name: 'x', storage: 'Bilinmeyen Dolap' }], bottles: [] }))
    expect(r.ok === false && r.error).toContain('Bilinmeyen Dolap')
  })
  it('warns about inconsistent open bottles', () => {
    const r = parseImport(base({ bottles: [{ id: 'b1', itemId: 'i1', remaining: 900 }] }))
    expect(r.ok && r.warnings[0]).toContain('büyük')
  })
})
