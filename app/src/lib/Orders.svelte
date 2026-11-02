<script lang="ts">
  import VTable from './VTable.svelte'
  import type { Col } from './cols'
  import { store, type ItemRow } from './state.svelte'
  import { suggestedOrder } from './domain/rules'
  import { exportOrders } from './export'
  import { ui } from './ui.svelte'

  let qty = $state(new Map<string, number>())
  let picked = $state(new Set<string>())
  let sortKey = $state('name')
  let sortDir = $state<1 | -1>(1)

  // critical items + anything already ordered and still waiting
  const rows = $derived(store.itemRows.filter((r) => r.statuses.includes('critical') || r.item.ordered))
  const toOrder = $derived(rows.filter((r) => !r.item.ordered))

  const cols: Col<ItemRow>[] = [
    { key: 'pick', label: '', width: '44px', align: 'center' },
    { key: 'name', label: 'Ürün', width: 'minmax(200px,2fr)', sort: (r) => r.item.name },
    { key: 'total', label: 'Mevcut', width: '80px', align: 'right', sort: (r) => r.total },
    { key: 'min', label: 'Min', width: '70px', align: 'right', sort: (r) => r.item.minStock },
    { key: 'qty', label: 'Sipariş adedi', width: '120px', align: 'right' },
    { key: 'loc', label: 'Konum', width: 'minmax(120px,1fr)', sort: (r) => r.location },
    { key: 'state', label: 'Durum', width: '130px', sort: (r) => (r.item.ordered ? 1 : 0) },
  ]

  const q = (r: ItemRow) => qty.get(r.item.id) ?? suggestedOrder(r.item, r.open)

  function toggle(id: string) {
    const n = new Set(picked)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    picked = n
  }
  function selectAll() {
    picked = picked.size === toOrder.length ? new Set() : new Set(toOrder.map((r) => r.item.id))
  }
  function markOrdered(v: boolean) {
    const ids = v ? [...picked] : rows.filter((r) => r.item.ordered && picked.has(r.item.id)).map((r) => r.item.id)
    store.setOrdered(ids, v)
    picked = new Set()
    ui.toast(`${ids.length} ürün güncellendi`, 'ok')
  }
  async function copy() {
    const sel = rows.filter((r) => picked.has(r.item.id))
    const list = (sel.length ? sel : toOrder).map((r) => `${r.item.brand} ${r.item.name}\t${q(r)} ${r.item.unit}`).join('\n')
    await navigator.clipboard.writeText(list)
    ui.toast('Liste panoya kopyalandı', 'ok')
  }
</script>

<div class="toolbar">
  <h1>Sipariş Listesi</h1>
  <span class="hint grow">Kritik stoktaki ürünler otomatik listelenir. Önerilen adet = 2 × minimum − mevcut.</span>
  <button class="btn" onclick={copy}>📋 Kopyala</button>
  <button class="btn" onclick={() => exportOrders(toOrder, qty)}>📊 Excel</button>
  <button class="btn" disabled={!picked.size} onclick={() => markOrdered(false)}>Sipariş işaretini kaldır</button>
  <button class="btn primary" disabled={!picked.size} onclick={() => markOrdered(true)}>✔ Sipariş verildi ({picked.size})</button>
</div>

<VTable minWidth={820} {rows} {cols} rowKey={(r) => r.item.id} bind:sortKey bind:sortDir cardHeight={122} empty="Sipariş edilecek ürün yok 🎉">
  {#snippet card(r)}
    <div class="mc">
      <div class="mc-top">
        <input type="checkbox" class="mc-check" checked={picked.has(r.item.id)} onchange={() => toggle(r.item.id)} aria-label="Seç" />
        <div class="mc-name">{r.item.name}</div>
        {#if r.item.ordered}<span class="badge info">verildi</span>{:else}<span class="badge bad">sipariş edilmeli</span>{/if}
      </div>
      <div class="sub mc-line">{[r.item.brand, r.location].filter(Boolean).join(' · ')}</div>
      <div class="mc-line" style="display:flex;align-items:center;gap:.5rem">
        <span>Mevcut <b>{r.total}</b> / min {r.item.minStock}</span>
        <span style="margin-left:auto" class="sub">Sipariş</span>
        <input type="number" min="1" style="width:72px;text-align:right" value={q(r)} aria-label="Sipariş adedi"
          onchange={(e) => { const m = new Map(qty); m.set(r.item.id, Math.max(1, Number(e.currentTarget.value) || 1)); qty = m }} />
      </div>
    </div>
  {/snippet}
  {#snippet cell(r, c)}
    {#if c.key === 'pick'}
      <input type="checkbox" checked={picked.has(r.item.id)} onchange={() => toggle(r.item.id)} aria-label="Seç" />
    {:else if c.key === 'name'}
      <div class="name"><div>{r.item.name}</div><div class="sub">{r.item.brand}</div></div>
    {:else if c.key === 'total'}<b>{r.total}</b>
    {:else if c.key === 'min'}{r.item.minStock}
    {:else if c.key === 'qty'}
      <input type="number" min="1" style="width:80px;text-align:right" value={q(r)}
        onchange={(e) => { const m = new Map(qty); m.set(r.item.id, Math.max(1, Number(e.currentTarget.value) || 1)); qty = m }} />
    {:else if c.key === 'loc'}<span class="tx" title={r.location}>{r.location}</span>
    {:else if c.key === 'state'}
      {#if r.item.ordered}<span class="badge info">sipariş verildi</span>{:else}<span class="badge bad">sipariş edilmeli</span>{/if}
    {/if}
  {/snippet}
</VTable>

<div class="toolbar">
  <button class="btn sm" onclick={selectAll}>{picked.size === toOrder.length && toOrder.length ? 'Seçimi kaldır' : 'Tümünü seç'}</button>
</div>
