<script lang="ts">
  import VTable from './VTable.svelte'
  import type { Col } from './cols'
  import { store, type ItemRow } from './state.svelte'
  import { MISSING_LABEL, missingOf, type Missing } from './domain/rules'
  import type { Item } from './domain/types'
  import { ui } from './ui.svelte'

  type Chip = 'any' | Missing
  let chip = $state<Chip>(ui.narrow ? 'skt' : 'any') // phones: one field per card keeps cards short
  let query = $state('')
  let q = $state('')
  let timer = 0
  $effect(() => {
    const v = query
    clearTimeout(timer)
    timer = window.setTimeout(() => (q = v.toLocaleLowerCase('tr').trim()), 150)
    return () => clearTimeout(timer)
  })

  // rows you just edited stay in the list until you change the filter, so you can fill the next field in the same row
  let touched = $state.raw(new Set<string>())
  let picked = $state.raw(new Set<string>())
  $effect(() => {
    void chip
    touched = new Set()
  })

  const missing = $derived(new Map(store.itemRows.map((r) => [r.item.id, missingOf(r.item)])))
  const counts = $derived.by(() => {
    const c: Record<string, number> = { any: 0 }
    for (const m of missing.values()) {
      if (m.length) c.any++
      for (const k of m) c[k] = (c[k] ?? 0) + 1
    }
    return c
  })
  const chips: Chip[] = ['any', 'skt', 'location', 'minStock', 'size', 'brand', 'purpose', 'storage']
  const label = (c: Chip) => (c === 'any' ? 'Tüm eksikler' : MISSING_LABEL[c])

  const rows = $derived.by(() => {
    const words = q.split(/\s+/).filter(Boolean)
    return store.itemRows.filter((r) => {
      const m = missing.get(r.item.id) ?? []
      const hit = chip === 'any' ? m.length > 0 : m.includes(chip)
      return (hit || touched.has(r.item.id)) && words.every((w) => r.search.includes(w))
    })
  })

  // which editable fields to show for the current filter
  type F = { key: keyof Item; label: string; kind: 'date' | 'text' | 'number' | 'select' | 'unit'; width: string; list?: string }
  const ALL: Record<string, F> = {
    skt: { key: 'skt', label: 'SKT', kind: 'date', width: '150px' },
    cabinet: { key: 'cabinet', label: 'Dolap', kind: 'text', width: '110px' },
    shelf: { key: 'shelf', label: 'Raf', kind: 'text', width: '90px' },
    box: { key: 'box', label: 'Kutu', kind: 'text', width: '90px' },
    minStock: { key: 'minStock', label: 'Min. stok', kind: 'number', width: '90px' },
    bottleSize: { key: 'bottleSize', label: 'Hacim', kind: 'number', width: '100px' },
    sizeUnit: { key: 'sizeUnit', label: 'Birim', kind: 'unit', width: '80px' },
    brand: { key: 'brand', label: 'Marka', kind: 'text', width: 'minmax(140px,1fr)', list: 'brands' },
    purpose: { key: 'purpose', label: 'Amaç', kind: 'select', width: 'minmax(150px,1fr)' },
    storage: { key: 'storage', label: 'Saklama', kind: 'select', width: 'minmax(150px,1fr)' },
  }
  const fields = $derived<F[]>(
    {
      any: [ALL.skt, ALL.cabinet, ALL.shelf, ALL.box, ALL.minStock, ALL.bottleSize, ALL.sizeUnit],
      skt: [ALL.skt], location: [ALL.cabinet, ALL.shelf, ALL.box], minStock: [ALL.minStock], size: [ALL.bottleSize, ALL.sizeUnit],
      brand: [ALL.brand], purpose: [ALL.purpose], storage: [ALL.storage],
    }[chip],
  )
  const brands = $derived([...new Set(store.items.map((i) => i.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')))

  const cols = $derived<Col<ItemRow>[]>([
    { key: '_pick', label: '', width: '40px', align: 'center' },
    { key: '_name', label: 'Ürün', width: 'minmax(190px,2fr)' },
    ...fields.map((f) => ({ key: f.key as string, label: f.label, width: f.width })),
    { key: '_miss', label: 'Eksik', width: 'minmax(140px,1.2fr)' },
  ])
  const minWidth = $derived(Math.max(760, 40 + 190 + fields.reduce((s, f) => s + (parseInt(f.width.replace(/\D*(\d+).*/, '$1')) || 140), 0) + 140))

  function save(r: ItemRow, f: F, raw: string) {
    let value: string | number = raw
    if (f.kind === 'number') {
      value = raw === '' ? 0 : Number(raw)
      if (!(value >= 0)) return ui.toast('Sayı 0 veya daha büyük olmalı.')
    }
    touched = new Set(touched).add(r.item.id)
    store.patchItems([r.item.id], { [f.key]: typeof value === 'string' ? value.trim() : value } as Partial<Item>)
  }

  function options(f: F) {
    return f.key === 'purpose' ? store.categories.purpose : store.categories.storage
  }

  // ---- selection + bulk apply ----
  const allPicked = $derived(rows.length > 0 && rows.every((r) => picked.has(r.item.id)))
  function toggle(id: string) {
    const n = new Set(picked)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    picked = n
  }
  function toggleAll() {
    picked = allPicked ? new Set() : new Set(rows.map((r) => r.item.id))
  }
  let bulk = $state({ storage: '', purpose: '', cabinet: '', shelf: '', box: '', minStock: '', skt: '' })
  const bulkPatch = $derived.by(() => {
    const p: Partial<Item> = {}
    if (bulk.storage) p.storage = bulk.storage
    if (bulk.purpose) p.purpose = bulk.purpose
    if (bulk.cabinet.trim()) p.cabinet = bulk.cabinet.trim()
    if (bulk.shelf.trim()) p.shelf = bulk.shelf.trim()
    if (bulk.box.trim()) p.box = bulk.box.trim()
    if (bulk.minStock !== '' && Number(bulk.minStock) >= 0) p.minStock = Number(bulk.minStock)
    if (bulk.skt) p.skt = bulk.skt
    return p
  })
  function applyBulk() {
    const ids = [...picked]
    if (!ids.length || !Object.keys(bulkPatch).length) return
    touched = new Set([...touched, ...ids])
    const n = store.patchItems(ids, bulkPatch)
    ui.toast(`${n} ürün güncellendi`, 'ok')
    bulk = { storage: '', purpose: '', cabinet: '', shelf: '', box: '', minStock: '', skt: '' }
    picked = new Set()
  }

  let sortKey = $state('')
  let sortDir = $state<1 | -1>(1)
</script>

{#snippet input(r: ItemRow, f: F)}
  {#if f.kind === 'select'}
    <select value={r.item[f.key]} aria-label={f.label} onchange={(e) => save(r, f, e.currentTarget.value)}>
      <option value=""></option>
      {#each options(f) as o}<option>{o}</option>{/each}
      {#if r.item[f.key] && !options(f).includes(String(r.item[f.key]))}<option>{r.item[f.key]}</option>{/if}
    </select>
  {:else if f.kind === 'date'}
    <input type="date" value={r.item.skt} aria-label="SKT" onchange={(e) => save(r, f, e.currentTarget.value)} />
  {:else if f.kind === 'number'}
    <input type="number" min="0" step="any" inputmode="decimal" value={r.item[f.key] || ''} aria-label={f.label} placeholder="0"
      onchange={(e) => save(r, f, e.currentTarget.value)} />
  {:else}
    <input type="text" list={f.list ?? (f.kind === 'unit' ? 'sizeunits' : undefined)} value={r.item[f.key]} aria-label={f.label} autocomplete="off"
      onchange={(e) => save(r, f, e.currentTarget.value)} />
  {/if}
{/snippet}

<div class="toolbar">
  <h1>Eksik Veriler</h1>
  <input class="grow" type="search" placeholder="Ürün ara…" bind:value={query} />
</div>
<div class="chips">
  {#each chips as c}
    <button class="chip" class:on={chip === c} disabled={!counts[c] && chip !== c} onclick={() => (chip = c)}>{label(c)} <b>{counts[c] ?? 0}</b></button>
  {/each}
</div>
<datalist id="brands">{#each brands as b}<option value={b}></option>{/each}</datalist>
<datalist id="sizeunits">{#each ['ml', 'L', 'g', 'kg', 'mg', 'µl', 'adet', '%'] as u}<option value={u}></option>{/each}</datalist>

{#if picked.size}
  <div class="bulk">
    <b>{picked.size} ürün seçili</b>
    <select bind:value={bulk.storage} aria-label="Saklama"><option value="">Saklama…</option>{#each store.categories.storage as o}<option>{o}</option>{/each}</select>
    <select bind:value={bulk.purpose} aria-label="Amaç"><option value="">Amaç…</option>{#each store.categories.purpose as o}<option>{o}</option>{/each}</select>
    <input type="text" placeholder="Dolap" bind:value={bulk.cabinet} style="width:90px" />
    <input type="text" placeholder="Raf" bind:value={bulk.shelf} style="width:70px" />
    <input type="text" placeholder="Kutu" bind:value={bulk.box} style="width:70px" />
    <input type="number" min="0" placeholder="Min. stok" bind:value={bulk.minStock} style="width:90px" />
    <input type="date" bind:value={bulk.skt} aria-label="SKT" />
    <button class="btn primary" disabled={!Object.keys(bulkPatch).length} onclick={applyBulk}>Seçililere uygula</button>
    <button class="btn" onclick={() => (picked = new Set())}>Seçimi kaldır</button>
  </div>
{:else}
  <div class="hint">{rows.length} ürün · hücreyi doldurunca otomatik kaydedilir · birden çok ürünü işaretleyip aynı değeri toplu verebilirsiniz</div>
{/if}

<VTable {rows} {cols} rowKey={(r) => r.item.id} bind:sortKey bind:sortDir {minWidth} rowHeight={48} cardHeight={150 + Math.ceil(fields.length / 2) * 62}
  empty={chip === 'any' ? 'Eksik veri kalmadı 🎉' : `"${label(chip)}" kalmadı 🎉`}>
  {#snippet card(r)}
    <div class="mc">
      <div class="mc-top">
        <input type="checkbox" class="mc-check" checked={picked.has(r.item.id)} onchange={() => toggle(r.item.id)} aria-label="Seç" />
        <button class="link mc-name" onclick={() => ui.openItem(r.item.id)}>{r.item.name}</button>
      </div>
      <div class="sub mc-line">{[r.item.brand, r.item.storage].filter(Boolean).join(' · ')}</div>
      <div class="fix-grid">
        {#each fields as f (f.key)}<label class="f">{f.label}{@render input(r, f)}</label>{/each}
      </div>
    </div>
  {/snippet}
  {#snippet cell(r, c)}
    {#if c.key === '_pick'}
      <input type="checkbox" checked={picked.has(r.item.id)} onchange={() => toggle(r.item.id)} aria-label="Seç" />
    {:else if c.key === '_name'}
      <button class="link name" onclick={() => ui.openItem(r.item.id)}><span class="blk">{r.item.name}</span><span class="blk sub">{r.item.brand}</span></button>
    {:else if c.key === '_miss'}
      <span class="tx sub" title={(missing.get(r.item.id) ?? []).map((m) => MISSING_LABEL[m]).join(', ')}>
        {(missing.get(r.item.id) ?? []).map((m) => MISSING_LABEL[m]).join(' · ') || '✓ tamam'}
      </span>
    {:else}
      {@const f = ALL[c.key]}
      {#if f}{@render input(r, f)}{/if}
    {/if}
  {/snippet}
</VTable>

<div class="toolbar"><button class="btn sm" onclick={toggleAll}>{allPicked ? 'Seçimi kaldır' : `Görünen ${rows.length} ürünü seç`}</button></div>
