<script lang="ts">
  import VTable from './VTable.svelte'
  import Dialog from './Dialog.svelte'
  import ItemForm from './ItemForm.svelte'
  import type { Col } from './cols'
  import { blankItem, store, type ItemRow } from './state.svelte'
  import { fillPercent, formatDate } from './domain/rules'
  import { ui, type StockFilter } from './ui.svelte'

  let query = $state('')
  let q = $state('') // debounced
  let timer = 0
  $effect(() => {
    const v = query
    clearTimeout(timer)
    timer = window.setTimeout(() => (q = v.toLocaleLowerCase('tr').trim()), 150)
    return () => clearTimeout(timer)
  })

  let editing = $state<{ item: ReturnType<typeof blankItem>; isNew: boolean } | null>(null)
  let spending = $state<ItemRow | null>(null)
  let amount = $state<number | null>(null)
  let spendErr = $state('')
  let confirmDel = $state<ItemRow | null>(null)
  let sortKey = $state('name')
  let sortDir = $state<1 | -1>(1)

  const filters: [StockFilter, string][] = [['all', 'Tümü'], ['critical', 'Kritik stok'], ['low', 'Azalan şişe'], ['expiry', 'SKT']]

  const rows = $derived.by(() => {
    const words = q.split(/\s+/).filter(Boolean)
    const f = ui.stockFilter
    return store.itemRows.filter((r) => {
      if (f === 'critical' && !r.statuses.includes('critical')) return false
      if (f === 'low' && !r.statuses.includes('low')) return false
      if (f === 'expiry' && !r.statuses.some((s) => s === 'expired' || s === 'expiring')) return false
      return words.every((w) => r.search.includes(w))
    })
  })

  const cols: Col<ItemRow>[] = [
    { key: 'name', label: 'Ürün', width: 'minmax(180px,2.2fr)', sort: (r) => r.item.name },
    { key: 'purpose', label: 'Amaç', width: 'minmax(90px,1fr)', sort: (r) => r.item.purpose },
    { key: 'storage', label: 'Saklama', width: '100px', sort: (r) => r.item.storage },
    { key: 'loc', label: 'Konum', width: 'minmax(110px,1.1fr)', sort: (r) => r.location },
    { key: 'skt', label: 'SKT', width: '130px', sort: (r) => r.item.skt || '9999' },
    { key: 'open', label: 'Açık şişe', width: 'minmax(110px,1fr)' },
    { key: 'sealed', label: 'Kapalı', width: '70px', align: 'right', sort: (r) => r.item.sealed },
    { key: 'total', label: 'Toplam', width: '80px', align: 'right', sort: (r) => r.total },
    { key: 'acts', label: '', width: '214px' },
  ]

  function act(err: string) {
    if (err) ui.toast(err)
  }

  function openSpend(r: ItemRow) {
    if (r.item.bottleSize <= 0) return ui.toast('Bu ürün için şişe hacmi tanımlı değil. Düzenleyip hacim girin ya da +/− kullanın.')
    spending = r
    amount = null
    spendErr = ''
  }

  function doSpend(e: SubmitEvent) {
    e.preventDefault()
    if (!spending) return
    const err = store.spendItem(spending.item.id, Number(amount))
    if (err) spendErr = err
    else spending = null
  }

  function rowClass(r: ItemRow) {
    return r.statuses.includes('expired') ? 'expired' : ''
  }
</script>

<div class="toolbar">
  <h1>Stok Sayım</h1>
  <input class="grow" type="search" placeholder="Ara: marka, ürün, konum…  ( / )" bind:value={query} id="stocksearch" />
  <div class="chips">
    {#each filters as [k, label]}
      <button class="chip" class:on={ui.stockFilter === k} onclick={() => (ui.stockFilter = k)}>{label}</button>
    {/each}
  </div>
  <button class="btn primary fab" aria-label="Yeni ürün" onclick={() => (editing = { item: blankItem(), isNew: true })}>＋<span class="txt"> Yeni ürün <span class="sub">(N)</span></span></button>
</div>
<div class="hint">{rows.length} / {store.items.length} ürün · {ui.narrow ? 'düzenlemek için karta dokunun' : 'satıra çift tıklayarak düzenleyin'}</div>

<VTable
  {rows} {cols} rowKey={(r) => r.item.id} {rowClass} bind:sortKey bind:sortDir cardHeight={134}
  onrowdblclick={(r) => (editing = { item: { ...r.item }, isNew: false })}
  empty="Eşleşen ürün yok"
>
  {#snippet card(r)}
    <div class="mc" class:expired={r.statuses.includes('expired')}>
      <div class="mc-top">
        <div class="mc-name">{r.item.name}</div>
        <span class="mc-total" class:bad={r.statuses.includes('critical')} title="Toplam (min {r.item.minStock})">{r.total}</span>
      </div>
      <div class="sub mc-line">{[r.item.brand, r.item.unit, r.location].filter(Boolean).join(' · ')}</div>
      <div class="mc-badges">
        {#if r.item.skt}
          <span class="badge" class:bad={r.statuses.includes('expired')} class:warn={r.statuses.includes('expiring')}>
            SKT {formatDate(r.item.skt)}{#if r.statuses.includes('expired')} · {-(r.daysLeft ?? 0)}g geçti{:else if r.statuses.includes('expiring')} · {r.daysLeft}g{/if}
          </span>
        {/if}
        {#if r.statuses.includes('critical')}<span class="badge bad">kritik</span>{/if}
        {#if r.item.ordered}<span class="badge info">sipariş verildi</span>{/if}
        {#each r.open as b (b.id)}
          {@const p = fillPercent(r.item, b)}
          <span style="display:inline-flex;gap:.25rem;align-items:center"><span class="bar" class:low={p < 15}><i style:width="{p}%"></i></span><span class="sub">%{p}</span></span>
        {/each}
        <span class="sub" style="margin-left:auto">kapalı {r.item.sealed}</span>
      </div>
      <div class="mc-acts">
        <button class="icon" aria-label="Adet ekle" onclick={(e) => { e.stopPropagation(); act(store.adjustSealed(r.item.id, 1)) }}>➕</button>
        <button class="icon" aria-label="Adet düş" disabled={r.item.sealed < 1} onclick={(e) => { e.stopPropagation(); act(store.adjustSealed(r.item.id, -1)) }}>➖</button>
        <button class="icon" aria-label="Harcama yap" onclick={(e) => { e.stopPropagation(); openSpend(r) }}>🧪</button>
        <button class="icon" aria-label="Yeni şişe aç" disabled={r.item.sealed < 1 || r.item.bottleSize <= 0} onclick={(e) => { e.stopPropagation(); act(store.openNew(r.item.id)) }}>📂</button>
        <button class="icon" aria-label="Sil" onclick={(e) => { e.stopPropagation(); confirmDel = r }}>🗑️</button>
      </div>
    </div>
  {/snippet}
  {#snippet cell(r, c)}
    {#if c.key === 'name'}
      <div class="name" title="{r.item.brand} {r.item.name}">
        <div>{r.item.name}{#if r.item.ordered} <span class="badge info">sipariş verildi</span>{/if}</div>
        <div class="sub">{r.item.brand}{r.item.brand && r.item.unit ? ' · ' : ''}{r.item.unit}</div>
      </div>
    {:else if c.key === 'purpose'}{r.item.purpose}
    {:else if c.key === 'storage'}{r.item.storage}
    {:else if c.key === 'loc'}<span title={r.location}>{r.location}</span>
    {:else if c.key === 'skt'}
      {#if r.item.skt}
        {formatDate(r.item.skt)}
        {#if r.statuses.includes('expired')}<span class="badge bad">{-(r.daysLeft ?? 0)}g geçti</span>
        {:else if r.statuses.includes('expiring')}<span class="badge warn">{r.daysLeft}g</span>{/if}
      {/if}
    {:else if c.key === 'open'}
      {#each r.open as b (b.id)}
        {@const p = fillPercent(r.item, b)}
        <span title="{b.remaining} / {r.item.bottleSize}{r.item.sizeUnit ? ' ' + r.item.sizeUnit : ''}" style="display:inline-flex;gap:.25rem;align-items:center">
          <span class="bar" class:low={p < 15}><i style:width="{p}%"></i></span><span class="sub">%{p}</span>
        </span>
      {/each}
    {:else if c.key === 'sealed'}{r.item.sealed}
    {:else if c.key === 'total'}
      <b>{r.total}</b>
      {#if r.statuses.includes('critical')}<span class="badge bad" title="Minimum {r.item.minStock}">kritik</span>{/if}
    {:else if c.key === 'acts'}
      <div class="acts">
        <button class="icon" title="Adet ekle" onclick={() => act(store.adjustSealed(r.item.id, 1))}>➕</button>
        <button class="icon" title="Adet düş" disabled={r.item.sealed < 1} onclick={() => act(store.adjustSealed(r.item.id, -1))}>➖</button>
        <button class="icon" title="Harcama yap" onclick={() => openSpend(r)}>🧪</button>
        <button class="icon" title="Yeni şişe aç" disabled={r.item.sealed < 1 || r.item.bottleSize <= 0} onclick={() => act(store.openNew(r.item.id))}>📂</button>
        <button class="icon" title="Düzenle" onclick={() => (editing = { item: { ...r.item }, isNew: false })}>✏️</button>
        <button class="icon" title="Sil" onclick={() => (confirmDel = r)}>🗑️</button>
      </div>
    {/if}
  {/snippet}
</VTable>

{#if editing}
  {#key editing.item.id}
    <ItemForm item={editing.item} isNew={editing.isNew} onclose={() => (editing = null)} />
  {/key}
{/if}

{#if spending}
  <Dialog title="Harcama yap" width="420px" onclose={() => (spending = null)}>
    <form id="spendform" onsubmit={doSpend}>
      <p style="margin-top:0"><b>{spending.item.name}</b><br /><span class="sub">{spending.item.brand}</span></p>
      <p class="hint">
        Açık şişe: {spending.open.length ? spending.open.map((b) => `${b.remaining}`).join(' + ') : 'yok'} · kapalı: {spending.item.sealed} × {spending.item.bottleSize}{spending.item.sizeUnit ? ' ' + spending.item.sizeUnit : ''}
      </p>
      <label class="f">Harcanan miktar{spending.item.sizeUnit ? ` (${spending.item.sizeUnit})` : ''}
        <!-- svelte-ignore a11y_autofocus -->
        <input type="number" min="0" step="any" bind:value={amount} autofocus required />
      </label>
      <p class="hint">En eski açık şişeden düşer; biterse yeni şişe otomatik açılır.</p>
      {#if spendErr}<p class="err">{spendErr}</p>{/if}
    </form>
    {#snippet footer()}
      <button class="btn" onclick={() => (spending = null)}>İptal</button>
      <button class="btn primary" type="submit" form="spendform">Düş</button>
    {/snippet}
  </Dialog>
{/if}

{#if confirmDel}
  <Dialog title="Ürünü sil" width="420px" onclose={() => (confirmDel = null)}>
    <p style="margin:0"><b>{confirmDel.item.name}</b> kalıcı olarak silinecek. Emin misiniz?</p>
    {#snippet footer()}
      <button class="btn" onclick={() => (confirmDel = null)}>Vazgeç</button>
      <button class="btn primary danger" onclick={() => { void store.deleteItem(confirmDel!.item.id); confirmDel = null }}>Sil</button>
    {/snippet}
  </Dialog>
{/if}

<svelte:window
  onkeydown={(e) => {
    if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
    if (editing || spending || confirmDel || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === '/') { e.preventDefault(); document.getElementById('stocksearch')?.focus() }
    else if (e.key.toLowerCase() === 'n') { e.preventDefault(); editing = { item: blankItem(), isNew: true } }
  }}
/>
