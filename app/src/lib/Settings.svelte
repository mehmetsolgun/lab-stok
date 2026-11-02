<script lang="ts">
  import AdminPanel from './AdminPanel.svelte'
  import { clearConfig, loadConfig, makeLink } from './connection'
  import { store } from './state.svelte'
  import { ui } from './ui.svelte'
  import { exportAll } from './export'
  import { makeDemo } from './seed'
  import type { Categories } from './domain/types'

  const groups: { key: keyof Categories; label: string }[] = [
    { key: 'purpose', label: 'Kullanım amacı' },
    { key: 'storage', label: 'Saklama koşulu' },
    { key: 'unit', label: 'Ambalaj / birim' },
    { key: 'organism', label: 'Canlı türü (primer)' },
  ]
  let draft = $state<Record<string, string>>({})
  let busy = $state(false)

  function add(key: keyof Categories) {
    const v = (draft[key] ?? '').trim()
    if (!v) return
    if (store.categories[key].some((x) => x.toLocaleLowerCase('tr') === v.toLocaleLowerCase('tr'))) return ui.toast('Bu değer zaten var.')
    void store.saveCategories({ ...store.categories, [key]: [...store.categories[key], v] }, `'${v}' kategoriye eklendi.`)
    draft[key] = ''
  }
  function remove(key: keyof Categories, v: string) {
    void store.saveCategories({ ...store.categories, [key]: store.categories[key].filter((x) => x !== v) }, `'${v}' kategoriden silindi.`)
  }
  async function demo() {
    if (store.items.length && !confirm('Mevcut TÜM veri demo veriyle değiştirilecek (eski kayıtlar bu bilgisayarda kalır ama listeden görünmez). Devam?')) return
    busy = true
    await new Promise((r) => setTimeout(r))
    await store.replaceAll(makeDemo(5000, 300), 'Demo veri yüklendi (5000 ürün, 300 primer).')
    busy = false
    ui.toast('Demo veri yüklendi', 'ok')
  }
  async function exp() {
    busy = true
    try {
      await exportAll()
    } catch (e) {
      ui.toast('Dışa aktarma başarısız: ' + (e instanceof Error ? e.message : e))
    }
    busy = false
  }
  async function copyLink() {
    const c = loadConfig()
    if (!c) return
    await navigator.clipboard.writeText(makeLink(c))
    ui.toast('Bağlantı linki kopyalandı. Yalnızca laboratuvar üyeleriyle paylaşın.', 'ok')
  }
  async function syncNow() {
    await store.refresh()
    ui.toast(store.syncError || 'Eşitlendi', store.syncError ? 'err' : 'ok')
  }
  function disconnect() {
    if (!confirm('Bu bilgisayarın Google E-Tablo bağlantısı silinecek (veriler E-Tabloda kalır). Devam edilsin mi?')) return
    clearConfig()
    location.reload()
  }
  function theme(t: 'light' | 'dark') {
    document.documentElement.dataset.theme = t
    try { localStorage.setItem('theme', t) } catch { /* ignore */ }
  }
</script>

<div class="toolbar"><h1>Ayarlar</h1></div>
<div class="scroll" style="display:grid;gap:1rem">
  <div class="panel">
    <h2>Kategoriler</h2>
    <p class="hint">Eklediğiniz veya sildiğiniz değer formlardaki açılır listelere hemen yansır. Silmek mevcut kayıtlardaki değeri değiştirmez.</p>
    <div class="cols2">
      {#each groups as g}
        <div>
          <b>{g.label}</b>
          <div class="taglist" style="margin-top:.4rem">
            {#each store.categories[g.key] as v (v)}
              <span class="tag">{v}<button aria-label="{v} sil" onclick={() => remove(g.key, v)}>✕</button></span>
            {/each}
          </div>
          <form onsubmit={(e) => { e.preventDefault(); add(g.key) }} style="display:flex;gap:.4rem">
            <input type="text" placeholder="Yeni değer" bind:value={draft[g.key]} style="flex:1" />
            <button class="btn" type="submit">Ekle</button>
          </form>
        </div>
      {/each}
    </div>
  </div>

  <div class="panel">
    <h2>Üyeler ve yönetici</h2>
    <AdminPanel />
  </div>

  <div class="panel">
    <h2>Rapor ve veri</h2>
    <div class="toolbar">
      <button class="btn primary" disabled={busy} onclick={exp}>📊 Tüm veriyi Excel'e aktar</button>
      <button class="btn" disabled={busy} onclick={demo}>🧪 Demo veri yükle (5000 ürün)</button>
    </div>
  </div>

  <div class="panel">
    <h2>Görünüm ve bağlantı</h2>
    <div class="toolbar">
      <button class="btn" onclick={() => theme('light')}>☀️ Açık</button>
      <button class="btn" onclick={() => theme('dark')}>🌙 Koyu</button>
      <span class="hint">Veri deposu: <b>{store.storageName}</b> · Kullanıcı: <b>{store.user}</b></span>
    </div>
    <div class="toolbar" style="margin-top:.6rem">
      {#if loadConfig()}
        <button class="btn" disabled={!store.isAdmin} title={store.isAdmin ? '' : 'Önce yönetici girişi yapın'} onclick={copyLink}>🔗 Üye bağlantı linkini kopyala</button>
        <button class="btn" onclick={syncNow}>🔄 Şimdi eşitle</button>
      {/if}
      <button class="btn danger" onclick={disconnect}>Bağlantıyı sıfırla</button>
    </div>
  </div>
</div>
