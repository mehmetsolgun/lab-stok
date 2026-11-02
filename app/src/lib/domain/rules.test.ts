import { describe, expect, it } from 'vitest'
import {
  cleanSeq, daysUntil, gcPercent, isValidSeq, missingOf, parseDate, spend, statusesOf, suggestedOrder, totalUnits,
} from './rules'
import type { Bottle, Item } from './types'

const item = (o: Partial<Item> = {}): Item => ({
  id: 'i1', brand: 'Sigma', name: 'Etanol', purpose: 'Kimyasal', storage: 'Oda Sıcaklığı', unit: 'Şişe',
  skt: '', bottleSize: 500, sizeUnit: 'ml', sealed: 2, minStock: 1, cabinet: '', shelf: '', box: '', note: '',
  ordered: false, version: 1, updatedAt: '', ...o,
})
const bottle = (id: string, remaining: number, openedAt = '2026-01-01'): Bottle => ({ id, itemId: 'i1', remaining, openedAt })
const T = '2026-11-02'

describe('spend', () => {
  it('draws from the open bottle first', () => {
    const r = spend(item(), [bottle('b1', 300)], 100, T)
    expect(r.ok && r.bottles[0].remaining).toBe(200)
    expect(r.ok && r.item.sealed).toBe(2)
  })
  it('auto-opens a sealed bottle when open one runs out and carries remainder', () => {
    const r = spend(item(), [bottle('b1', 100)], 150, T)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.item.sealed).toBe(1)
    expect(r.opened).toBe(1)
    expect(r.bottles).toHaveLength(1)
    expect(r.bottles[0].remaining).toBe(450)
  })
  it('uses several open bottles oldest-first', () => {
    const r = spend(item(), [bottle('new', 400, '2026-03-01'), bottle('old', 50, '2026-01-01')], 100, T)
    if (!r.ok) throw new Error(r.error)
    expect(r.emptied).toEqual(['old'])
    expect(r.bottles.find((b) => b.id === 'new')!.remaining).toBe(350)
  })
  it('drops an exactly emptied bottle without opening a new one', () => {
    const r = spend(item(), [bottle('b1', 100)], 100, T)
    if (!r.ok) throw new Error(r.error)
    expect(r.bottles).toHaveLength(0)
    expect(r.item.sealed).toBe(2)
  })
  it('rejects spending more than total stock', () => {
    expect(spend(item({ sealed: 1 }), [bottle('b1', 100)], 700, T).ok).toBe(false)
    expect(spend(item({ sealed: 1 }), [bottle('b1', 100)], 600, T).ok).toBe(true)
  })
  it('rejects non-positive amounts', () => {
    expect(spend(item(), [], 0, T).ok).toBe(false)
    expect(spend(item(), [], -5, T).ok).toBe(false)
  })
})

describe('statuses', () => {
  it('critical when total units below minimum', () => {
    expect(statusesOf(item({ sealed: 0, minStock: 2 }), [bottle('b1', 400)], T)).toContain('critical')
    expect(statusesOf(item({ sealed: 1, minStock: 2 }), [bottle('b1', 400)], T)).not.toContain('critical')
  })
  it('low when an open bottle is under 15%', () => {
    expect(statusesOf(item(), [bottle('b1', 60)], T)).toContain('low')
    expect(statusesOf(item(), [bottle('b1', 80)], T)).not.toContain('low')
  })
  it('expired and expiring', () => {
    expect(statusesOf(item({ skt: '2026-11-01' }), [], T)).toContain('expired')
    expect(statusesOf(item({ skt: '2026-11-30' }), [], T)).toContain('expiring')
    expect(statusesOf(item({ skt: '2027-03-01' }), [], T)).toEqual([])
  })
  it('suggested order refills to double the minimum', () => {
    expect(suggestedOrder(item({ sealed: 0, minStock: 3 }), [])).toBe(6)
    expect(totalUnits(item({ sealed: 1 }), [bottle('b1', 10)])).toBe(2)
  })
})

describe('dates', () => {
  it('parses Turkish formats', () => {
    expect(parseDate('05-03-2027')).toBe('2027-03-05')
    expect(parseDate('5.3.2027')).toBe('2027-03-05')
    expect(parseDate('2027-03-05')).toBe('2027-03-05')
    expect(parseDate('31-02-2027')).toBeNull()
    expect(parseDate('abc')).toBeNull()
    expect(parseDate('')).toBe('')
  })
  it('counts days', () => {
    expect(daysUntil('2026-11-12', T)).toBe(10)
    expect(daysUntil('2026-10-30', T)).toBe(-3)
    expect(daysUntil('', T)).toBeNull()
  })
})

describe('missingOf', () => {
  it('lists empty useful fields', () => {
    expect(missingOf(item({ skt: '', minStock: 0 }))).toEqual(expect.arrayContaining(['skt', 'location', 'minStock']))
    expect(missingOf(item({ skt: '2027-01-01', minStock: 2, cabinet: 'Dolap 1', brand: 'X' }))).toEqual([])
  })
  it('counts volume as missing only for bottles', () => {
    const full = { skt: '2027-01-01', minStock: 1, cabinet: 'D', brand: 'X' }
    expect(missingOf(item({ ...full, unit: 'Şişe', bottleSize: 0 }))).toEqual(['size'])
    expect(missingOf(item({ ...full, unit: 'Paket', bottleSize: 0 }))).toEqual([])
  })
  it('any one of cabinet/shelf/box is enough for location', () => {
    expect(missingOf(item({ cabinet: '', shelf: 'Raf 2', box: '' }))).not.toContain('location')
  })
})

describe('primers', () => {
  it('validates and computes GC', () => {
    expect(cleanSeq("5'-acg tga-3'")).toBe('ACGTGA')
    expect(isValidSeq('ACGTN')).toBe(true)
    expect(isValidSeq('ACGX')).toBe(false)
    expect(gcPercent('GGCC')).toBe(100)
    expect(gcPercent('ATGC')).toBe(50)
    expect(gcPercent('')).toBeNull()
  })
})
