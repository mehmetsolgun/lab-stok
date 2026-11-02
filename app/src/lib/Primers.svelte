<script lang="ts">
  import VTable from './VTable.svelte'
  import Dialog from './Dialog.svelte'
  import type { Col } from './cols'
  import { blankPrimer, store } from './state.svelte'
  import { cleanSeq, gcPercent, isValidSeq } from './domain/rules'
  import type { Primer } from './domain/types'
  import { ui } from './ui.svelte'

  let query = $state('')
  let q = $state('')
  let timer = 0
  $effect(() => {
    const v = query
    clearTimeout(timer)
    timer = window.setTimeout(() => (q = v.toLocaleLowerCase('tr').trim()), 150)
    return () => clearTimeout(timer)
  })
  let organism = $state('')
  let sortKey = $state('gene')
  let sortDir = $state<1 | -1>(1)
  let editing = $state<{ p: Primer; isNew: boolean } | null>(null)
  let confirmDel = $state<Primer | null>(null)

  const rows = $derived.by(() => {
    const words = q.split(/\s+/).filter(Boolean)
    return store.primers.filter((p) => {
      if (organism && p.organism !== organism) return false
      const hay = `${p.gene} ${p.organism} ${p.fwSeq} ${p.rvSeq} ${p.location} ${p.amount} ${p.note}`.toLocaleLowerCase('tr')
      return words.every((w) => hay.includes(w))
    })
  })

  const cols: Col<Primer>[] = [
    // sequences reach 30 nt (miRNA) — 238px fits up to ~27 nt; longer ones show … and the full text on hover in monospace; amount/date live in the form and card
    { key: 'gene', label: 'Hedef gen', width: 'minmax(150px,1fr)', sort: (p) => p.gene },
    { key: 'organism', label: 'Canlı türü', width: '80px', sort: (p) => p.organism },
    { key: 'fw', label: "Forward (5'→3')", width: 'minmax(238px,1.5fr)' },
    { key: 'rv', label: "Reverse (5'→3')", width: 'minmax(238px,1.5fr)' },
    { key: 'fwTm', label: 'Fw Tm', width: '64px', align: 'right', sort: (p) => p.fwTm ?? 999 },
    { key: 'rvTm', label: 'Rv Tm', width: '64px', align: 'right', sort: (p) => p.rvTm ?? 999 },
    { key: 'loc', label: 'Konum', width: '70px', sort: (p) => p.location },
    { key: 'note', label: 'Not', width: 'minmax(120px,1fr)' },
    { key: 'acts', label: '', width: '76px' },
  ]

  let f = $state<Primer>(blankPrimer())
  let error = $state('')
  $effect(() => {
    if (editing) {
      f = { ...editing.p }
      error = ''
    }
  })

  function submit(e: SubmitEvent) {
    e.preventDefault()
    const fw = cleanSeq(f.fwSeq), rv = cleanSeq(f.rvSeq)
    if (!f.gene.trim()) return void (error = 'Hedef gen zorunlu.')
    if (!isValidSeq(fw) || !isValidSeq(rv)) return void (error = 'Dizilimde yalnızca A, C, G, T (ve IUPAC) harfleri olmalı.')
    void store.savePrimer({ ...f, gene: f.gene.trim(), fwSeq: fw, rvSeq: rv, fwTm: f.fwTm || null, rvTm: f.rvTm || null }, editing!.isNew)
    editing = null
  }
  const seqBad = (s: string) => !isValidSeq(cleanSeq(s))
</script>

<div class="toolbar">
  <h1>PCR Primerler</h1>
  <input class="grow" type="search" placeholder="Gen, tür, dizilim, konum…" bind:value={query} />
  <select bind:value={organism}><option value="">Tüm türler</option>{#each store.categories.organism as o}<option>{o}</option>{/each}</select>
  <button class="btn primary fab" aria-label="Yeni primer" onclick={() => (editing = { p: blankPrimer(), isNew: true })}>＋<span class="txt"> Yeni primer</span></button>
</div>
<div class="hint">{rows.length} / {store.primers.length} primer · {ui.narrow ? 'düzenlemek için karta dokunun' : 'Tm başlığına tıklayarak sıralayın'}</div>

<VTable minWidth={1100} {rows} {cols} rowKey={(p) => p.id} bind:sortKey bind:sortDir cardHeight={124} onrowdblclick={(p) => (editing = { p, isNew: false })} empty="Primer yok">
  {#snippet card(p)}
    <div class="mc">
      <div class="mc-top">
        <div class="mc-name">{p.gene}</div>
        {#if p.organism}<span class="badge">{p.organism}</span>{/if}
        <button class="icon" aria-label="Sil" onclick={(e) => { e.stopPropagation(); confirmDel = p }}>🗑️</button>
      </div>
      <div class="mc-seq"><b>F</b> {p.fwSeq || '—'}</div>
      <div class="mc-seq"><b>R</b> {p.rvSeq || '—'}</div>
      <div class="sub mc-line">Tm {p.fwTm ?? '–'} / {p.rvTm ?? '–'} °C{p.location ? ' · ' + p.location : ''}{p.amount ? ' · ' + p.amount : ''}</div>
    </div>
  {/snippet}
  {#snippet cell(p, c)}
    {#if c.key === 'gene'}<b class="tx" title={p.gene}>{p.gene}</b>
    {:else if c.key === 'organism'}<span class="tx" title={p.organism}>{p.organism}</span>
    {:else if c.key === 'fw'}<code class="tx" title="{p.fwSeq.length} nt · GC {gcPercent(p.fwSeq) ?? '-'}%">{p.fwSeq}</code>
    {:else if c.key === 'rv'}<code class="tx" title="{p.rvSeq.length} nt · GC {gcPercent(p.rvSeq) ?? '-'}%">{p.rvSeq}</code>
    {:else if c.key === 'fwTm'}{p.fwTm ?? ''}
    {:else if c.key === 'rvTm'}{p.rvTm ?? ''}
    {:else if c.key === 'loc'}<span class="tx" title={p.location}>{p.location}</span>
    {:else if c.key === 'note'}<span class="tx" title={p.note}>{p.note}</span>
    {:else if c.key === 'acts'}
      <div class="acts">
        <button class="icon" title="Düzenle" onclick={() => (editing = { p, isNew: false })}>✏️</button>
        <button class="icon" title="Sil" onclick={() => (confirmDel = p)}>🗑️</button>
      </div>
    {/if}
  {/snippet}
</VTable>

{#if editing}
  <Dialog title={editing.isNew ? 'Yeni primer' : 'Primeri düzenle'} onclose={() => (editing = null)}>
    <form id="primerform" onsubmit={submit}>
      <div class="grid">
        <label class="f">Hedef gen *<input type="text" bind:value={f.gene} required /></label>
        <label class="f">Canlı türü
          <select bind:value={f.organism}><option value=""></option>{#each store.categories.organism as o}<option>{o}</option>{/each}</select>
        </label>
        <label class="f">Miktar / konsantrasyon<input type="text" bind:value={f.amount} placeholder="100 µM / 200 µl" /></label>
        <label class="f full">Forward dizilim (5'→3') <span class="hint">{cleanSeq(f.fwSeq).length} nt · GC {gcPercent(cleanSeq(f.fwSeq)) ?? '-'}%</span>
          <input type="text" class:invalid={seqBad(f.fwSeq)} bind:value={f.fwSeq} spellcheck="false" style="font-family:monospace" /></label>
        <label class="f full">Reverse dizilim (5'→3') <span class="hint">{cleanSeq(f.rvSeq).length} nt · GC {gcPercent(cleanSeq(f.rvSeq)) ?? '-'}%</span>
          <input type="text" class:invalid={seqBad(f.rvSeq)} bind:value={f.rvSeq} spellcheck="false" style="font-family:monospace" /></label>
        <label class="f">Forward Tm (°C)<input type="number" step="0.1" bind:value={f.fwTm} /></label>
        <label class="f">Reverse Tm (°C)<input type="number" step="0.1" bind:value={f.rvTm} /></label>
        <label class="f">Konum (kutu/pozisyon)<input type="text" bind:value={f.location} /></label>
        <label class="f">Hazırlanma tarihi<input type="date" bind:value={f.preparedAt} /></label>
        <label class="f full">Notlar (optimizasyon, protokol)<textarea rows="3" bind:value={f.note}></textarea></label>
      </div>
      {#if error}<p class="err">{error}</p>{/if}
    </form>
    {#snippet footer()}
      <button class="btn" onclick={() => (editing = null)}>İptal</button>
      <button class="btn primary" type="submit" form="primerform">Kaydet</button>
    {/snippet}
  </Dialog>
{/if}

{#if confirmDel}
  <Dialog title="Primeri sil" width="420px" onclose={() => (confirmDel = null)}>
    <p style="margin:0"><b>{confirmDel.gene}</b> primeri silinecek. Emin misiniz?</p>
    {#snippet footer()}
      <button class="btn" onclick={() => (confirmDel = null)}>Vazgeç</button>
      <button class="btn primary danger" onclick={() => { void store.deletePrimer(confirmDel!.id); confirmDel = null }}>Sil</button>
    {/snippet}
  </Dialog>
{/if}
