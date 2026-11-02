<script lang="ts">
  import { onMount } from 'svelte'
  import Dashboard from './lib/Dashboard.svelte'
  import Stock from './lib/Stock.svelte'
  import Primers from './lib/Primers.svelte'
  import Orders from './lib/Orders.svelte'
  import Log from './lib/Log.svelte'
  import Settings from './lib/Settings.svelte'
  import Count from './lib/Count.svelte'
  import Fix from './lib/Fix.svelte'
  import ItemDetail from './lib/ItemDetail.svelte'
  import Palette from './lib/Palette.svelte'
  import AdminPanel from './lib/AdminPanel.svelte'
  import { store } from './lib/state.svelte'
  import { missingOf } from './lib/domain/rules'
  import { ui, type View } from './lib/ui.svelte'
  import { buildStorage, clearConfig, consumeLink, isLocalMode, loadConfig, saveConfig, setLocalMode, testConfig } from './lib/connection'

  type Phase = 'boot' | 'connect' | 'setup' | 'pick' | 'app'
  let phase = $state<Phase>('boot')

  // connection screen
  let connUrl = $state('')
  let connKey = $state('')
  let connErr = $state('')
  let connBusy = $state(false)

  // first-run setup
  let setupPw = $state('')
  let setupPw2 = $state('')
  let setupNames = $state('')
  let setupErr = $state('')
  let showAdmin = $state(false)

  // `more`: on phones these live behind the "Daha" tab instead of the bottom bar
  const nav: { v: View; icon: string; label: string; short: string; more?: boolean }[] = [
    { v: 'dashboard', icon: '📊', label: 'Durum Özeti', short: 'Özet' },
    { v: 'stock', icon: '📦', label: 'Stok Sayım', short: 'Stok' },
    { v: 'count', icon: '✅', label: 'Sayım Modu', short: 'Sayım' },
    { v: 'primers', icon: '🧬', label: 'PCR Primerler', short: 'Primer' },
    { v: 'orders', icon: '🛒', label: 'Sipariş Listesi', short: 'Sipariş', more: true },
    { v: 'fix', icon: '🧩', label: 'Eksik Veriler', short: 'Eksik', more: true },
    { v: 'log', icon: '📜', label: 'Kayıtlar', short: 'Kayıt', more: true },
    { v: 'settings', icon: '⚙️', label: 'Ayarlar', short: 'Ayar', more: true },
  ]
  const bar = $derived(ui.narrow ? nav.filter((n) => !n.more) : nav)
  const moreActive = $derived(nav.some((n) => n.more && n.v === ui.view))
  const title = $derived(nav.find((n) => n.v === ui.view)?.label ?? '')
  const critical = $derived(store.itemRows.filter((r) => r.statuses.includes('critical')).length)
  const incomplete = $derived(store.items.filter((i) => missingOf(i).length > 0).length)
  const badgeOf = (v: View) => (v === 'orders' ? critical : v === 'fix' ? incomplete : 0)

  function onKey(e: KeyboardEvent) {
    if (phase !== 'app') return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      ui.paletteOpen = !ui.paletteOpen
    }
  }

  const remembered = () => {
    try { return localStorage.getItem('user') } catch { return null }
  }

  onMount(async () => {
    try {
      const t = localStorage.getItem('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      document.documentElement.dataset.theme = t
    } catch { /* ignore */ }
    consumeLink()
    if (!loadConfig() && !isLocalMode()) return void (phase = 'connect')
    await boot()
    document.addEventListener('visibilitychange', () => !document.hidden && phase === 'app' && void store.refresh())
  })

  async function boot() {
    try {
      await store.init(buildStorage())
    } catch (e) {
      // first connection on this computer failed (wrong address/key, no internet)
      connErr = e instanceof Error ? e.message : String(e)
      const c = loadConfig()
      connUrl = c?.url ?? ''
      connKey = c?.key ?? ''
      return void (phase = 'connect')
    }
    if (!store.adminSecret) return void (phase = 'setup')
    const u = remembered()
    if (u && store.members.includes(u)) {
      store.login(u)
      phase = 'app'
    } else phase = 'pick'
  }

  async function connect(e: SubmitEvent) {
    e.preventDefault()
    const cfg = { url: connUrl.trim(), key: connKey.trim() }
    connBusy = true
    connErr = ''
    try {
      await testConfig(cfg)
    } catch (err) {
      connErr = err instanceof Error ? err.message : String(err)
      connBusy = false
      return
    }
    saveConfig(cfg)
    phase = 'boot'
    await boot()
    connBusy = false
  }

  function localOnly() {
    clearConfig()
    setLocalMode()
    phase = 'boot'
    void boot()
  }

  async function setup(e: SubmitEvent) {
    e.preventDefault()
    const names = [...new Set(setupNames.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'))
    if (setupPw.length < 6) return void (setupErr = 'Şifre en az 6 karakter olmalı.')
    if (setupPw !== setupPw2) return void (setupErr = 'Şifreler aynı değil.')
    if (!names.length) return void (setupErr = 'En az bir üye ismi girin.')
    setupErr = ''
    await store.setupAdmin(setupPw, names)
    setupPw = setupPw2 = ''
    store.isAdmin = false
    phase = 'pick'
  }

  function pick(name: string) {
    try { localStorage.setItem('user', name) } catch { /* ignore */ }
    store.login(name)
    showAdmin = false
    ui.go('dashboard')
    phase = 'app'
  }

  function switchUser() {
    try { localStorage.removeItem('user') } catch { /* ignore */ }
    store.logout()
    phase = 'pick'
  }
</script>

{#if phase === 'boot'}
  <div style="display:grid;place-items:center;height:100%" class="hint">Yükleniyor…</div>
{:else if phase === 'connect'}
  <div style="display:grid;place-items:center;height:100%;overflow:auto">
    <form class="panel" onsubmit={connect} style="width:min(480px,94vw);display:grid;gap:.8rem">
      <div class="auth-brand"><img src="./logo.svg" alt="" width="56" height="56" /><h1>Google E-Tablo bağlantısı</h1></div>
      <p class="hint" style="margin:0">Yöneticinizden aldığınız bağlantı adresini ve laboratuvar erişim anahtarını girin. (Yönetici size hazır bir link da verebilir; o link bu adımı otomatik yapar.)</p>
      <label class="f">Bağlantı adresi (Apps Script web uygulaması URL'si)
        <input type="text" bind:value={connUrl} placeholder="https://script.google.com/macros/s/…/exec" required />
      </label>
      <label class="f">Laboratuvar erişim anahtarı
        <input type="password" bind:value={connKey} autocomplete="off" required />
      </label>
      {#if connErr}<p class="err" style="margin:0">{connErr}</p>{/if}
      <button class="btn primary" type="submit" disabled={connBusy}>{connBusy ? 'Bağlanıyor…' : 'Bağlan'}</button>
      <button class="btn sm" type="button" onclick={localOnly} style="justify-self:start">Yalnızca bu bilgisayarda dene (Google'a bağlanmadan)</button>
    </form>
  </div>
{:else if phase === 'setup'}
  <div style="display:grid;place-items:center;height:100%;overflow:auto">
    <form class="panel" onsubmit={setup} style="width:min(460px,94vw);display:grid;gap:.8rem">
      <div class="auth-brand"><img src="./logo.svg" alt="" width="56" height="56" /><h1>İlk kurulum</h1></div>
      <p class="hint" style="margin:0">Yönetici şifresi yalnızca üye listesini ve ayarları yönetmek içindir. Laboratuvar üyeleri şifresiz, listeden isimlerini seçerek girer.</p>
      <label class="f">Yönetici şifresi
        <input type="password" bind:value={setupPw} autocomplete="new-password" required />
      </label>
      <label class="f">Yönetici şifresi (tekrar)
        <input type="password" bind:value={setupPw2} autocomplete="new-password" required />
      </label>
      <label class="f">Laboratuvar üyeleri (her satıra bir isim)
        <textarea rows="5" bind:value={setupNames} placeholder={'Ayşe Yılmaz\nMehmet Demir'}></textarea>
      </label>
      {#if setupErr}<p class="err" style="margin:0">{setupErr}</p>{/if}
      <button class="btn primary" type="submit">Kurulumu tamamla</button>
    </form>
  </div>
{:else if phase === 'pick'}
  <div style="display:grid;place-items:center;height:100%;overflow:auto">
    <div class="panel" style="width:min(520px,94vw);display:grid;gap:.9rem">
      <div class="auth-brand"><img src="./logo.svg" alt="" width="56" height="56" /><div><h1>Lab Stok Takip</h1><div class="hint">Veteriner Genetik · İsminizi seçin</div></div></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
        {#each store.members as m (m)}
          <button class="btn" style="padding:.8rem" onclick={() => pick(m)}>👤 {m}</button>
        {/each}
      </div>
      <button class="btn sm" style="justify-self:start" onclick={() => (showAdmin = !showAdmin)}>🔑 Yönetici</button>
      {#if showAdmin}<AdminPanel />{/if}
    </div>
  </div>
{:else}
  <div class="shell">
    <aside class="side">
      <div class="brand"><img src="./logo.svg" alt="" width="34" height="34" /><span>Lab Stok<small>Veteriner Genetik</small></span></div>
      <button class="nav search-btn" onclick={() => (ui.paletteOpen = true)} aria-label="Ara"><span class="ico">🔎</span><span class="lbl-long">Ara</span><kbd>Ctrl K</kbd></button>
      {#each bar as n (n.v)}
        <button class="nav" class:on={ui.view === n.v} onclick={() => ui.go(n.v)} aria-label={n.label}>
          <span class="ico">{n.icon}</span><span class="lbl-long">{n.label}</span><span class="lbl-short">{n.short}</span>
          {#if badgeOf(n.v)}<span class="badge" class:bad={n.v === 'orders'}>{badgeOf(n.v)}</span>{/if}
        </button>
      {/each}
      {#if ui.narrow}
        <button class="nav" class:on={moreActive || ui.moreOpen} onclick={() => (ui.moreOpen = !ui.moreOpen)} aria-label="Daha fazla">
          <span class="ico">⋯</span><span class="lbl-short">Daha</span>
          {#if critical + incomplete}<span class="dotmark"></span>{/if}
        </button>
      {/if}
      <div class="spacer"></div>
      <div class="userbox">
        👤 {store.user} · <button class="btn sm" onclick={switchUser}>Değiştir</button><br />
        <span class="sync" class:err={!!store.syncError}>
          {#if store.syncError}⚠ {store.queued ? `${store.queued} değişiklik bekliyor: ` : ''}{store.syncError}{:else if store.pending || store.queued}⏳ Kaydediliyor…{:else}✓ Kaydedildi{/if}
        </span>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <img src="./logo.svg" alt="" width="26" height="26" />
        <b>{title}</b>
        <button class="icon" onclick={() => (ui.paletteOpen = true)} aria-label="Ara">🔎</button>
        <span class="sync" class:err={!!store.syncError} title={store.syncError}>
          {#if store.syncError}⚠ {store.queued || ''}{:else if store.pending || store.queued}⏳{:else}✓{/if}
        </span>
        <button class="btn sm" onclick={switchUser}>👤 {store.user}</button>
      </header>
      {#if ui.view === 'dashboard'}<Dashboard />
      {:else if ui.view === 'stock'}<Stock />
      {:else if ui.view === 'count'}<Count />
      {:else if ui.view === 'primers'}<Primers />
      {:else if ui.view === 'orders'}<Orders />
      {:else if ui.view === 'fix'}<Fix />
      {:else if ui.view === 'log'}<Log />
      {:else}<Settings />{/if}
    </main>

    {#if ui.narrow && ui.moreOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="sheet-back" onclick={(e) => e.target === e.currentTarget && (ui.moreOpen = false)}>
        <div class="sheet">
          {#each nav.filter((n) => n.more) as n (n.v)}
            <button class="sheet-item" class:on={ui.view === n.v} onclick={() => ui.go(n.v)}>
              <span class="ico">{n.icon}</span>{n.label}
              {#if badgeOf(n.v)}<span class="badge" class:bad={n.v === 'orders'} style="margin-left:auto">{badgeOf(n.v)}</span>{/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}
    <ItemDetail />
    <Palette />
  </div>
{/if}

<svelte:window onkeydown={onKey} />

{#if ui.toastMsg}
  <div class="toast" class:ok={ui.toastKind === 'ok'} role="status">
    <span>{ui.toastMsg}</span>
    {#if ui.toastAction}<button onclick={() => { const a = ui.toastAction; ui.dismissToast(); a?.run() }}>{ui.toastAction.label}</button>{/if}
  </div>
{/if}
