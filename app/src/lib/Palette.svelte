<script lang="ts">
  import { store } from './state.svelte'
  import { ui, type View } from './ui.svelte'
  import { downloadBackup } from './backup'

  interface Hit {
    key: string
    icon: string
    title: string
    sub: string
    run: () => void
  }

  let el: HTMLDialogElement | undefined = $state()
  let q = $state('')
  let sel = $state(0)
  let input: HTMLInputElement | undefined = $state()

  const pages: [View, string, string][] = [
    ['dashboard', '📊', 'Durum Özeti'], ['stock', '📦', 'Stok Sayım'], ['count', '✅', 'Sayım modu'], ['primers', '🧬', 'PCR Primerler'],
    ['orders', '🛒', 'Sipariş Listesi'], ['fix', '🧩', 'Eksik veriler'], ['log', '📜', 'Kayıtlar'], ['settings', '⚙️', 'Ayarlar'],
  ]
  const lc = (s: string) => s.toLocaleLowerCase('tr')

  const actions: Hit[] = [
    { key: 'a-new', icon: '➕', title: 'Yeni ürün ekle', sub: 'İşlem', run: () => { ui.go('stock'); ui.newItem = true } },
    { key: 'a-count', icon: '✅', title: 'Sayım başlat', sub: 'İşlem', run: () => ui.go('count') },
    { key: 'a-backup', icon: '💾', title: 'Yedek indir', sub: 'İşlem', run: () => downloadBackup() },
  ]

  const hits = $derived.by<Hit[]>(() => {
    const words = lc(q).split(/\s+/).filter(Boolean)
    const pageHits: Hit[] = pages.map(([v, icon, title]) => ({ key: 'p-' + v, icon, title, sub: 'Sayfa', run: () => ui.go(v) }))
    if (!words.length) return [...actions, ...pageHits]

    const items = store.itemRows
      .filter((r) => words.every((w) => r.search.includes(w)))
      .sort((a, b) => Number(lc(b.item.name).startsWith(words[0])) - Number(lc(a.item.name).startsWith(words[0])))
      .slice(0, 8)
      .map<Hit>((r) => ({
        key: 'i-' + r.item.id, icon: '📦', title: r.item.name,
        sub: [r.item.brand, r.location, `${r.total} adet`].filter(Boolean).join(' · '), run: () => ui.openItem(r.item.id),
      }))
    const primers = store.primers
      .filter((p) => { const h = lc(`${p.gene} ${p.organism} ${p.fwSeq} ${p.rvSeq} ${p.location} ${p.note}`); return words.every((w) => h.includes(w)) })
      .slice(0, 5)
      .map<Hit>((p) => ({
        key: 'r-' + p.id, icon: '🧬', title: p.gene, sub: [p.organism, p.fwSeq.slice(0, 18)].filter(Boolean).join(' · '),
        run: () => { ui.primerQuery = p.gene; ui.go('primers') },
      }))
    const rest = [...actions, ...pageHits].filter((h) => words.every((w) => lc(h.title).includes(w)))
    return [...items, ...primers, ...rest]
  })

  $effect(() => {
    if (ui.paletteOpen) {
      q = ''
      sel = 0
      el?.showModal()
      queueMicrotask(() => input?.focus())
    } else if (el?.open) el.close()
  })
  $effect(() => {
    void q
    sel = 0
  })

  function run(h: Hit | undefined) {
    if (!h) return
    ui.paletteOpen = false
    h.run()
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(hits.length - 1, sel + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); run(hits[sel]) }
    queueMicrotask(() => document.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' }))
  }
</script>

<dialog class="pal" bind:this={el} onclose={() => (ui.paletteOpen = false)} onclick={(e) => e.target === el && (ui.paletteOpen = false)}>
  <div class="pal-in">
    <input
      bind:this={input} bind:value={q} onkeydown={key} type="search" placeholder="Ürün, primer, sayfa veya işlem ara…" autocomplete="off" spellcheck="false"
      aria-label="Genel arama"
    />
    <div class="pal-list" role="listbox">
      {#each hits as h, i (h.key)}
        <button class="pal-item" class:on={i === sel} role="option" aria-selected={i === sel} onclick={() => run(h)} onmousemove={() => (sel = i)}>
          <span class="pal-ico">{h.icon}</span>
          <span class="pal-t">{h.title}</span>
          <span class="sub pal-s">{h.sub}</span>
        </button>
      {:else}
        <div class="hint" style="padding:1rem">Sonuç yok</div>
      {/each}
    </div>
    <div class="pal-foot sub"><span>↑↓ gezin</span><span>Enter aç</span><span>Esc kapat</span></div>
  </div>
</dialog>
