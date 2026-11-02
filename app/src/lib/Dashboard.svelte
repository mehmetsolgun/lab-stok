<script lang="ts">
  import { store } from './state.svelte'
  import { ui } from './ui.svelte'
  import { formatDate } from './domain/rules'

  const crit = $derived(store.itemRows.filter((r) => r.statuses.includes('critical')))
  const low = $derived(store.itemRows.filter((r) => r.statuses.includes('low')))
  const expiry = $derived(
    store.itemRows.filter((r) => r.statuses.includes('expired') || r.statuses.includes('expiring')).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)),
  )
  const expired = $derived(expiry.filter((r) => r.statuses.includes('expired')).length)
</script>

<div class="toolbar"><h1>Durum Özeti</h1></div>
<div class="cards">
  <button class="card" onclick={() => ui.go('stock')}><div class="n">{store.items.length + store.primers.length}</div><div class="l">📦 Toplam ürün ({store.items.length} stok · {store.primers.length} primer)</div></button>
  <button class="card bad" onclick={() => ui.go('stock', 'critical')}><div class="n">{crit.length}</div><div class="l">⚠️ Kritik stok</div></button>
  <button class="card warn" onclick={() => ui.go('stock', 'low')}><div class="n">{low.length}</div><div class="l">📉 Azalan şişe (&lt;%15)</div></button>
  <button class="card info" onclick={() => ui.go('stock', 'expiry')}><div class="n">{expiry.length}</div><div class="l">📅 SKT yaklaşan / geçen ({expired} geçmiş)</div></button>
</div>

<div class="cols2 scroll">
  <div class="panel">
    <h2>Kritik stok</h2>
    <div class="alerts">
      {#each crit.slice(0, 12) as r (r.item.id)}
        <div class="alert bad"><b>{r.item.name}</b><span class="sub">{r.item.brand}</span><span style="margin-left:auto">{r.total} / min {r.item.minStock}</span></div>
      {:else}<div class="hint">Kritik ürün yok 🎉</div>{/each}
      {#if crit.length > 12}<button class="btn sm" onclick={() => ui.go('orders')}>Tümü sipariş listesinde ({crit.length})</button>{/if}
    </div>
  </div>
  <div class="panel">
    <h2>Son kullanma tarihi</h2>
    <div class="alerts">
      {#each expiry.slice(0, 12) as r (r.item.id)}
        <div class="alert" class:bad={(r.daysLeft ?? 0) < 0} class:warn={(r.daysLeft ?? 0) >= 0}>
          <b>{r.item.name}</b><span class="sub">{formatDate(r.item.skt)}</span>
          <span style="margin-left:auto">{(r.daysLeft ?? 0) < 0 ? `${-(r.daysLeft ?? 0)} gün geçti` : `${r.daysLeft} gün kaldı`}</span>
        </div>
      {:else}<div class="hint">Yaklaşan SKT yok</div>{/each}
    </div>
  </div>
  <div class="panel">
    <h2>Azalan şişeler</h2>
    <div class="alerts">
      {#each low.slice(0, 12) as r (r.item.id)}
        <div class="alert warn"><b>{r.item.name}</b><span class="sub">{r.location}</span>
          <span style="margin-left:auto">{r.open.filter((b) => b.remaining / r.item.bottleSize < 0.15).map((b) => b.remaining).join(', ')} {r.item.sizeUnit}</span></div>
      {:else}<div class="hint">Azalan şişe yok</div>{/each}
    </div>
  </div>
</div>
