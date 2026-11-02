<script lang="ts">
  import { store } from './state.svelte'
  import { ui } from './ui.svelte'
  import { formatDate, missingOf } from './domain/rules'

  const crit = $derived(store.itemRows.filter((r) => r.statuses.includes('critical')))
  const low = $derived(store.itemRows.filter((r) => r.statuses.includes('low')))
  const expiry = $derived(
    store.itemRows.filter((r) => r.statuses.includes('expired') || r.statuses.includes('expiring')).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)),
  )
  const expired = $derived(expiry.filter((r) => r.statuses.includes('expired')).length)
  const incomplete = $derived(store.items.filter((i) => missingOf(i).length > 0).length)
  const healthy = $derived(store.itemRows.filter((r) => r.statuses.length === 0).length)

  // stock health: one bar, worst problem wins so every item is counted once
  const health = $derived.by(() => {
    let bad = 0, warn = 0, ok = 0
    for (const r of store.itemRows) {
      if (r.statuses.includes('critical') || r.statuses.includes('expired')) bad++
      else if (r.statuses.length) warn++
      else ok++
    }
    const total = bad + warn + ok || 1
    return { bad, warn, ok, pb: (bad / total) * 100, pw: (warn / total) * 100, po: (ok / total) * 100 }
  })

  const recent = $derived(store.log.slice(-8).reverse())
  const kind = (a: string) => ({ EKLEME: 'ok', GÜNCELLEME: 'info', SİLME: 'bad', HARCAMA: 'warn' })[a] ?? ''
  const when = (ts: string) => {
    const d = new Date(ts)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
  const hour = new Date().getHours()
  const greeting = hour < 6 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi çalışmalar' : 'İyi akşamlar'
</script>

<div class="dash-head">
  <div>
    <h1>{greeting}, {store.user.split(' ')[0]}</h1>
    <div class="hint">{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
  </div>
  <div class="dash-actions">
    <button class="btn primary" onclick={() => ui.go('count')}>✅ Sayım başlat</button>
    <button class="btn" onclick={() => { ui.go('stock'); ui.newItem = true }}>➕ Yeni ürün</button>
    <button class="btn" onclick={() => ui.go('orders')}>🛒 Sipariş listesi{#if crit.length} <span class="badge bad">{crit.length}</span>{/if}</button>
    <button class="btn" onclick={() => (ui.paletteOpen = true)} aria-label="Ara">🔎 Ara <span class="sub">Ctrl+K</span></button>
  </div>
</div>

<div class="cards">
  <button class="card" onclick={() => ui.go('stock')}><div class="n">{store.items.length}</div><div class="l">📦 Stok ürünü · {store.primers.length} primer</div></button>
  <button class="card bad" onclick={() => ui.go('stock', 'critical')}><div class="n">{crit.length}</div><div class="l">⚠️ Kritik stok</div></button>
  <button class="card warn" onclick={() => ui.go('stock', 'low')}><div class="n">{low.length}</div><div class="l">📉 Azalan şişe (&lt;%15)</div></button>
  <button class="card info" onclick={() => ui.go('stock', 'expiry')}><div class="n">{expiry.length}</div><div class="l">📅 SKT yaklaşan / geçen{expired ? ` (${expired} geçmiş)` : ''}</div></button>
  <button class="card" onclick={() => ui.go('fix')}><div class="n">{incomplete}</div><div class="l">🧩 Eksik verili ürün</div></button>
</div>

{#if store.items.length}
  <div class="panel health">
    <div class="health-bar" role="img" aria-label="Stok sağlığı: {health.ok} sağlıklı, {health.warn} dikkat, {health.bad} kritik">
      <i class="ok" style:width="{health.po}%"></i><i class="warn" style:width="{health.pw}%"></i><i class="bad" style:width="{health.pb}%"></i>
    </div>
    <div class="health-leg">
      <span><i class="dot ok"></i>{healthy} sağlıklı</span>
      <span><i class="dot warn"></i>{health.warn} dikkat (azalan / SKT yaklaşan)</span>
      <span><i class="dot bad"></i>{health.bad} kritik / SKT geçmiş</span>
    </div>
  </div>
{/if}

<div class="cols2 dash-grid scroll">
  <div class="panel">
    <h2>Kritik stok</h2>
    <div class="alerts">
      {#each crit.slice(0, 8) as r (r.item.id)}
        <button class="alert bad" onclick={() => ui.openItem(r.item.id)}><b>{r.item.name}</b><span class="sub">{r.item.brand}</span><span style="margin-left:auto">{r.total} / min {r.item.minStock}</span></button>
      {:else}<div class="hint">Kritik ürün yok 🎉 {store.items.every((i) => i.minStock === 0) ? '(Minimum stok girilmemiş; "Eksik veriler" ekranından girebilirsiniz.)' : ''}</div>{/each}
      {#if crit.length > 8}<button class="btn sm" onclick={() => ui.go('orders')}>Tümü sipariş listesinde ({crit.length})</button>{/if}
    </div>
  </div>
  <div class="panel">
    <h2>Son kullanma tarihi</h2>
    <div class="alerts">
      {#each expiry.slice(0, 8) as r (r.item.id)}
        <button class="alert" class:bad={(r.daysLeft ?? 0) < 0} class:warn={(r.daysLeft ?? 0) >= 0} onclick={() => ui.openItem(r.item.id)}>
          <b>{r.item.name}</b><span class="sub">{formatDate(r.item.skt)}</span>
          <span style="margin-left:auto">{(r.daysLeft ?? 0) < 0 ? `${-(r.daysLeft ?? 0)} gün geçti` : `${r.daysLeft} gün kaldı`}</span>
        </button>
      {:else}<div class="hint">Yaklaşan SKT yok. {store.items.every((i) => !i.skt) ? 'Hiçbir üründe SKT girilmemiş — "Eksik veriler" ekranından girebilirsiniz.' : ''}</div>{/each}
    </div>
  </div>
  <div class="panel">
    <h2>Azalan şişeler</h2>
    <div class="alerts">
      {#each low.slice(0, 8) as r (r.item.id)}
        <button class="alert warn" onclick={() => ui.openItem(r.item.id)}><b>{r.item.name}</b><span class="sub">{r.location}</span>
          <span style="margin-left:auto">{r.open.filter((b) => b.remaining / r.item.bottleSize < 0.15).map((b) => b.remaining).join(', ')} {r.item.sizeUnit}</span></button>
      {:else}<div class="hint">Azalan şişe yok</div>{/each}
    </div>
  </div>
  <div class="panel">
    <h2>Son hareketler</h2>
    <div class="alerts">
      {#each recent as l (l.ts + l.detail)}
        <div class="alert"><span class="badge {kind(l.action)}">{l.action}</span><span class="tx" style="flex:1" title={l.detail}>{l.detail}</span><span class="sub" style="white-space:nowrap">{l.user.split(' ')[0]} · {when(l.ts)}</span></div>
      {:else}<div class="hint">Henüz hareket yok</div>{/each}
      <button class="btn sm" onclick={() => ui.go('log')}>Tüm kayıtlar</button>
    </div>
  </div>
</div>
