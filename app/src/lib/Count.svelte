<script lang="ts">
  import VTable from './VTable.svelte'
  import type { Col } from './cols'
  import { store, type ItemRow } from './state.svelte'
  import { fillPercent } from './domain/rules'
  import { ui } from './ui.svelte'

  // ---- which items are already counted in this round (kept on this device) ----
  const KEY = 'labstok-count'
  function loadDone(): { since: string; ids: string[] } {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
      if (v && Array.isArray(v.ids)) return v
    } catch { /* ignore */ }
    return { since: new Date().toISOString(), ids: [] }
  }
  const initial = loadDone()
  let since = $state(initial.since)
  let done = $state.raw(new Set<string>(initial.ids))
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify({ since, ids: [...done] })) } catch { /* ignore */ }
  }
  function mark(id: string, on = true) {
    const n = new Set(done)
    if (on) n.add(id)
    else n.delete(id)
    done = n
    persist()
  }
  function restart() {
    if (done.size && !confirm('Sayım işaretleri sıfırlanacak (stok miktarları değişmez). Yeni sayım başlatılsın mı?')) return
    done = new Set()
    since = new Date().toISOString()
    persist()
  }

  // ---- filters ----
  let scope = $state('') // storage condition, '' = all
  let onlyOpen = $state(false) // only items not counted yet
  let query = $state('')
  let q = $state('')
  let timer = 0
  $effect(() => {
    const v = query
    clearTimeout(timer)
    timer = window.setTimeout(() => (q = v.toLocaleLowerCase('tr').trim()), 150)
    return () => clearTimeout(timer)
  })

  const scopes = $derived([...new Set(store.items.map((i) => i.storage).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')))

  // walking order: by place, then name
  const scoped = $derived.by(() => {
    const words = q.split(/\s+/).filter(Boolean)
    return store.itemRows
      .filter((r) => (!scope || r.item.storage === scope) && words.every((w) => r.search.includes(w)))
      .sort((a, b) => (a.location || '￿').localeCompare(b.location || '￿', 'tr') || a.item.name.localeCompare(b.item.name, 'tr'))
  })
  const rows = $derived(onlyOpen ? scoped.filter((r) => !done.has(r.item.id)) : scoped)
  const doneInScope = $derived(scoped.filter((r) => done.has(r.item.id)).length)
  const pct = $derived(scoped.length ? Math.round((doneInScope / scoped.length) * 100) : 0)

  let sortKey = $state('')
  let sortDir = $state<1 | -1>(1)
  const cols: Col<ItemRow>[] = [
    { key: 'name', label: 'Ürün', width: 'minmax(220px,2.2fr)' },
    { key: 'loc', label: 'Konum / saklama', width: 'minmax(150px,1.2fr)' },
    { key: 'count', label: 'Kapalı adet (sayılan)', width: '190px' },
    { key: 'open', label: 'Açık şişe (kalan %)', width: 'minmax(220px,1.4fr)' },
    { key: 'ok', label: '', width: '120px' },
  ]

  function set(r: ItemRow, n: number) {
    const err = store.setSealed(r.item.id, n)
    if (err) return ui.toast(err)
    mark(r.item.id)
  }
  function setPct(r: ItemRow, bottleId: string, p: number) {
    const err = store.setBottleRemaining(bottleId, Math.round((r.item.bottleSize * p) / 100 * 1000) / 1000)
    if (err) return ui.toast(err)
    mark(r.item.id)
  }
</script>

{#snippet stepper(r: ItemRow)}
  <div class="stepper">
    <button class="icon" aria-label="Azalt" disabled={r.item.sealed < 1} onclick={() => set(r, r.item.sealed - 1)}>−</button>
    <input type="number" inputmode="numeric" min="0" step="1" value={r.item.sealed} aria-label="Sayılan kapalı adet"
      onchange={(e) => set(r, Number(e.currentTarget.value))} onfocus={(e) => e.currentTarget.select()} />
    <button class="icon" aria-label="Artır" onclick={() => set(r, r.item.sealed + 1)}>+</button>
  </div>
{/snippet}

{#snippet bottles(r: ItemRow)}
  {#each r.open.slice(0, 3) as b (b.id)}
    {@const p = fillPercent(r.item, b)}
    <label class="cnt-bottle" title="{b.remaining} / {r.item.bottleSize} {r.item.sizeUnit}">
      <input type="range" min="0" max="100" step="5" value={p} onchange={(e) => setPct(r, b.id, Number(e.currentTarget.value))} aria-label="Açık şişe doluluk" />
      <b>%{p}</b>
    </label>
  {/each}
  {#if r.open.length > 3}<span class="sub">+{r.open.length - 3} şişe</span>{/if}
{/snippet}

<div class="toolbar">
  <h1>Sayım Modu</h1>
  <input class="grow" type="search" placeholder="Ürün ara…" bind:value={query} />
  <select bind:value={scope} aria-label="Saklama koşulu"><option value="">Tüm saklama alanları</option>{#each scopes as s}<option>{s}</option>{/each}</select>
  <div class="chips">
    <button class="chip" class:on={!onlyOpen} onclick={() => (onlyOpen = false)}>Tümü</button>
    <button class="chip" class:on={onlyOpen} onclick={() => (onlyOpen = true)}>Sayılmayan</button>
  </div>
  <button class="btn" onclick={restart}>↺ Yeni sayım</button>
</div>

<div class="cnt-progress" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
  <div class="cnt-bar"><i style:width="{pct}%"></i></div>
  <span><b>{doneInScope}</b> / {scoped.length} ürün sayıldı ({pct}%)</span>
  <span class="sub">{new Date(since).toLocaleDateString('tr-TR')} tarihinde başladı</span>
</div>

<VTable {rows} {cols} rowKey={(r) => r.item.id} bind:sortKey bind:sortDir cardHeight={168} cardHeightOf={(r) => (r.open.length ? 168 : 128)} minWidth={900} rowHeight={52}
  empty={onlyOpen ? 'Sayılmayan ürün kalmadı 🎉' : 'Eşleşen ürün yok'}>
  {#snippet card(r)}
    <div class="mc" class:counted={done.has(r.item.id)}>
      <div class="mc-top">
        <div class="mc-name">{r.item.name}</div>
        <button class="icon cnt-ok" class:on={done.has(r.item.id)} aria-label={done.has(r.item.id) ? 'Sayıldı işaretini kaldır' : 'Sayıldı olarak işaretle'}
          onclick={() => mark(r.item.id, !done.has(r.item.id))}>✓</button>
      </div>
      <div class="sub mc-line">{[r.item.brand, r.location || r.item.storage].filter(Boolean).join(' · ')}</div>
      <div class="cnt-row"><span class="sub">Kapalı adet</span>{@render stepper(r)}</div>
      {#if r.open.length}<div class="cnt-row"><span class="sub">Açık şişe</span><div class="cnt-bottles">{@render bottles(r)}</div></div>{/if}
    </div>
  {/snippet}
  {#snippet cell(r, c)}
    {#if c.key === 'name'}
      <button class="link name" onclick={() => ui.openItem(r.item.id)}>
        <span class="blk">{r.item.name}</span><span class="blk sub">{r.item.brand}</span>
      </button>
    {:else if c.key === 'loc'}<span class="tx" title="{r.location} {r.item.storage}">{r.location || r.item.storage}</span>
    {:else if c.key === 'count'}{@render stepper(r)}
    {:else if c.key === 'open'}<div class="cnt-bottles">{@render bottles(r)}</div>
    {:else}
      <button class="btn sm" class:primary={done.has(r.item.id)} onclick={() => mark(r.item.id, !done.has(r.item.id))}>{done.has(r.item.id) ? '✓ Sayıldı' : 'Doğru'}</button>
    {/if}
  {/snippet}
</VTable>
