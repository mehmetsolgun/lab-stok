<script lang="ts">
  import Dialog from './Dialog.svelte'
  import ItemForm from './ItemForm.svelte'
  import SpendDialog from './SpendDialog.svelte'
  import { store } from './state.svelte'
  import { ui } from './ui.svelte'
  import { fillPercent, formatDate } from './domain/rules'

  const row = $derived(store.itemRows.find((r) => r.item.id === ui.detailItemId))
  let editing = $state(false)
  let spending = $state(false)

  // everything the log knows about this item: entries tagged with its id, plus older untagged ones that name it
  const history = $derived.by(() => {
    const r = row
    if (!r) return []
    const needle = `'${r.item.name}'`
    return store.log.filter((l) => l.ref === r.item.id || (!l.ref && l.detail.includes(needle))).slice(-40).reverse()
  })

  const fmt = (ts: string) => {
    const d = new Date(ts)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
  const kind = (a: string) => ({ EKLEME: 'ok', GÜNCELLEME: 'info', SİLME: 'bad', HARCAMA: 'warn' })[a] ?? ''

  function act(err: string) {
    if (err) ui.toast(err)
  }
  function close() {
    ui.detailItemId = ''
  }
</script>

{#if row}
  <Dialog title={row.item.name} width="640px" onclose={close}>
    <div class="dt-head">
      <span class="sub">{[row.item.brand, row.item.unit].filter(Boolean).join(' · ') || 'Marka belirtilmemiş'}</span>
      {#if row.statuses.includes('critical')}<span class="badge bad">kritik stok</span>{/if}
      {#if row.statuses.includes('low')}<span class="badge warn">azalan şişe</span>{/if}
      {#if row.statuses.includes('expired')}<span class="badge bad">SKT geçti</span>{:else if row.statuses.includes('expiring')}<span class="badge warn">SKT yaklaşıyor</span>{/if}
      {#if row.item.ordered}<span class="badge info">sipariş verildi</span>{/if}
    </div>

    <div class="dt-stats">
      <div><div class="n">{row.total}</div><div class="l">Toplam</div></div>
      <div><div class="n">{row.item.sealed}</div><div class="l">Kapalı</div></div>
      <div><div class="n">{row.open.length}</div><div class="l">Açık</div></div>
      <div><div class="n">{row.item.minStock}</div><div class="l">Minimum</div></div>
    </div>

    {#if row.open.length}
      <h3 class="dt-h">Açık şişeler</h3>
      <div class="dt-bottles">
        {#each row.open as b (b.id)}
          {@const p = fillPercent(row.item, b)}
          <div class="dt-bottle">
            <span class="bar" class:low={p < 15} style="width:90px"><i style:width="{p}%"></i></span>
            <b>%{p}</b>
            <span class="sub">{b.remaining} / {row.item.bottleSize}{row.item.sizeUnit ? ' ' + row.item.sizeUnit : ''} · {formatDate(b.openedAt)} açıldı</span>
          </div>
        {/each}
      </div>
    {/if}

    <dl class="dt-facts">
      <dt>Saklama</dt><dd>{row.item.storage || '—'}</dd>
      <dt>Amaç</dt><dd>{row.item.purpose || '—'}</dd>
      <dt>Konum</dt><dd>{row.location || '—'}</dd>
      <dt>SKT</dt>
      <dd>
        {#if row.item.skt}{formatDate(row.item.skt)}
          {#if row.daysLeft !== null}<span class="sub">({row.daysLeft < 0 ? `${-row.daysLeft} gün geçti` : `${row.daysLeft} gün kaldı`})</span>{/if}
        {:else}—{/if}
      </dd>
      <dt>Hacim</dt><dd>{row.item.bottleSize ? `${row.item.bottleSize} ${row.item.sizeUnit}` : '—'}</dd>
      {#if row.item.note}<dt>Not</dt><dd class="dt-note">{row.item.note}</dd>{/if}
    </dl>

    <div class="dt-acts">
      <button class="btn" onclick={() => act(store.adjustSealed(row.item.id, 1))}>➕ Adet ekle</button>
      <button class="btn" disabled={row.item.sealed < 1} onclick={() => act(store.adjustSealed(row.item.id, -1))}>➖ Adet düş</button>
      <button class="btn" disabled={row.item.bottleSize <= 0} onclick={() => (spending = true)}>🧪 Harcama</button>
      <button class="btn" disabled={row.item.sealed < 1 || row.item.bottleSize <= 0} onclick={() => act(store.openNew(row.item.id))}>📂 Yeni şişe aç</button>
      <button class="btn" onclick={() => store.setOrdered([row.item.id], !row.item.ordered)}>{row.item.ordered ? '↩ Sipariş işaretini kaldır' : '🛒 Sipariş verildi'}</button>
    </div>

    <h3 class="dt-h">Geçmiş <span class="sub">({history.length}{history.length === 40 ? '+' : ''})</span></h3>
    {#if history.length}
      <ul class="dt-hist">
        {#each history as l (l.ts + l.detail)}
          <li><span class="sub">{fmt(l.ts)}</span> <span class="badge {kind(l.action)}">{l.action}</span> <b>{l.user}</b><br />{l.detail}</li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Bu ürün için henüz kayıt yok.</p>
    {/if}
    {#snippet footer()}
      <button class="btn" onclick={close}>Kapat</button>
      <button class="btn primary" onclick={() => (editing = true)}>✏️ Düzenle</button>
    {/snippet}
  </Dialog>

  {#if editing}
    <ItemForm item={{ ...row.item }} isNew={false} onclose={() => (editing = false)} />
  {/if}
  {#if spending}
    <SpendDialog itemId={row.item.id} onclose={() => (spending = false)} />
  {/if}
{/if}
