import { beforeEach, describe, expect, it } from 'vitest'
import { makeBackend, type Backend } from './fakeSheets'
import { Remote } from './remote'
import { parseImport } from '../importer'
import type { DigestConfig, Item } from '../domain/types'

let be: Backend
let remote: Remote

const iso = (plusDays: number) => new Date(Date.now() + plusDays * 86400000).toISOString().slice(0, 10)
const todayDow = () => new Date().getUTCDay() || 7 // matches the fake Utilities.formatDate('u')

const item = (id: string, o: Partial<Item> = {}): Item => ({
  id, brand: 'Sigma', name: id, purpose: '', storage: '', unit: 'Şişe', skt: '', bottleSize: 0, sizeUnit: '', sealed: 1, minStock: 0,
  cabinet: '', shelf: '', box: '', note: '', ordered: false, version: 1, updatedAt: '', ...o,
})
const cfg = (o: Partial<DigestConfig> = {}): DigestConfig => ({ enabled: true, emails: ['a@lab.com', 'b@lab.com'], day: todayDow(), backup: false, appUrl: 'https://lab.example/app/', ...o })

async function seed(digest: DigestConfig | null = cfg()) {
  await remote.apply([
    {
      t: 'put', table: 'items', rows: [
        item('Kritik Ürün', { minStock: 3, sealed: 1, cabinet: 'Dolap 2', shelf: 'Raf 1' }),
        item('Azalan Şişe', { bottleSize: 500, sizeUnit: 'ml', sealed: 1 }),
        item('SKT Yakın', { skt: iso(10) }),
        item('SKT Geçmiş', { skt: iso(-4) }),
        item('Sağlam Ürün', { minStock: 1, sealed: 5, skt: iso(400) }),
        item('<script>x</script>', { minStock: 9, sealed: 0 }),
      ],
    },
    { t: 'put', table: 'bottles', rows: [{ id: 'b1', itemId: 'Azalan Şişe', remaining: 50, openedAt: iso(-3) }] },
    { t: 'put', table: 'primers', rows: [{ id: 'p1', gene: 'GAPDH', organism: 'Sıçan', fwSeq: 'ACGT', rvSeq: 'TTGA', fwTm: 59.5, rvTm: '' }] },
    { t: 'members', value: ['Ayşe'] },
    { t: 'admin', value: { salt: 's', hash: 'gizli-hash' } },
    ...(digest ? [{ t: 'digest' as const, value: digest }] : []),
  ])
}

beforeEach(() => {
  be = makeBackend()
  const key = be.setup()
  remote = new Remote({ url: 'x', key }, be.fetch)
})

describe('weekly digest (Apps Script)', () => {
  it('announces the digest capability to the app', async () => {
    expect((await remote.load()).caps).toContain('digest')
  })

  it('reports critical, expiring and low items with the same rules as the app', async () => {
    await seed()
    expect(be.testEposta()).toBe('gönderildi')
    const m = be.mails[0]
    expect(m.to).toBe('a@lab.com,b@lab.com')
    // Kritik Ürün (1 < 3) + the <script> item (0 < 9) = 2 critical; SKT Yakın + SKT Geçmiş = 2 expiring; Azalan Şişe (10%) = 1 low
    expect(m.subject).toBe('Lab Stok özeti: 2 kritik, 2 SKT, 1 azalan')
    expect(m.htmlBody).toContain('Kritik Ürün')
    expect(m.htmlBody).toContain('1 / min 3')
    expect(m.htmlBody).toContain('Dolap 2 / Raf 1')
    expect(m.htmlBody).toContain('4 gün geçti')
    expect(m.htmlBody).toContain('10 gün kaldı')
    expect(m.htmlBody).not.toContain('Sağlam Ürün')
    expect(m.htmlBody).toContain('https://lab.example/app/')
  })

  it('escapes item names so they cannot inject HTML into the e-mail', async () => {
    await seed()
    be.testEposta()
    expect(be.mails[0].htmlBody).not.toContain('<script>')
    expect(be.mails[0].htmlBody).toContain('&lt;script&gt;')
  })

  it('says all is well when nothing needs attention', async () => {
    await remote.apply([{ t: 'put', table: 'items', rows: [item('Rahat', { minStock: 1, sealed: 4, skt: iso(300) })] }, { t: 'digest', value: cfg() }])
    be.testEposta()
    expect(be.mails[0].subject).toBe('Lab Stok özeti: 0 kritik, 0 SKT, 0 azalan')
    expect(be.mails[0].htmlBody).toContain('dikkat gerektiren bir şey yok')
  })

  it('attaches a backup the app can read back, without the admin password hash', async () => {
    await seed(cfg({ backup: true }))
    be.testEposta()
    const att = be.mails[0].attachments!
    expect(att).toHaveLength(1)
    expect(att[0].name).toMatch(/^labstok-yedek-\d{4}-\d{2}-\d{2}\.json$/)
    expect(att[0].content).not.toContain('gizli-hash')
    const parsed = parseImport(att[0].content)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.payload.items.find((i) => i.id === 'Kritik Ürün')).toMatchObject({ minStock: 3, sealed: 1, ordered: false })
    expect(parsed.payload.bottles[0]).toMatchObject({ remaining: 50 })
    expect(parsed.payload.primers[0]).toMatchObject({ fwTm: 59.5, rvTm: null })
    expect(parsed.payload.members).toEqual(['Ayşe'])
  })

  it('sends only on the chosen weekday and only once a day', async () => {
    await seed(cfg({ day: (todayDow() % 7) + 1 })) // tomorrow's weekday
    expect(be.gunlukKontrol()).toBe('bugün gönderim günü değil')
    expect(be.mails).toHaveLength(0)

    await remote.apply([{ t: 'digest', value: cfg({ day: todayDow() }) }])
    expect(be.gunlukKontrol()).toBe('gönderildi')
    expect(be.gunlukKontrol()).toBe('bugün zaten gönderildi')
    expect(be.mails).toHaveLength(1)
  })

  it('stays silent when switched off or without recipients', async () => {
    await seed(cfg({ enabled: false }))
    expect(be.testEposta()).toBe('kapalı')
    await remote.apply([{ t: 'digest', value: cfg({ emails: [] }) }])
    expect(be.testEposta()).toBe('kapalı')
    expect(be.mails).toHaveLength(0)
  })

  it('installs a single daily trigger even when run twice', () => {
    be.haftalikOzetKur()
    be.haftalikOzetKur()
    expect(be.triggers).toEqual(['gunlukKontrol'])
  })
})
