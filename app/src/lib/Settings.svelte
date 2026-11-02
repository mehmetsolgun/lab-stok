<script lang="ts">
  import AdminPanel from './AdminPanel.svelte'
  import Dialog from './Dialog.svelte'
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
    if (store.demoCount) return ui.toast('Demo veri zaten yüklü. Önce silin.')
    busy = true
    await new Promise((r) => setTimeout(r))
    await store.addMany(makeDemo(5000, 300), 'Demo veri eklendi (5000 ürün, 300 primer).')
    busy = false
    ui.toast('Demo veri eklendi', 'ok')
  }
  async function removeDemo() {
    if (!confirm(`Yalnızca demo veri silinecek (${store.demoCount} kayıt). Kendi girdiğiniz kayıtlara dokunulmaz. Devam edilsin mi?`)) return
    busy = true
    await new Promise((r) => setTimeout(r))
    await store.deleteDemo()
    busy = false
    ui.toast('Demo veri silindi', 'ok')
  }

  // "delete everything" needs the admin password plus a typed confirmation
  let wipeOpen = $state(false)
  let wipeText = $state('')
  const wipeOk = $derived(wipeText.trim().replace(/[İIı]/g, 'i').toLowerCase() === 'sil')
  async function wipe(e: SubmitEvent) {
    e.preventDefault()
    if (!wipeOk) return
    busy = true
    await store.clearAllData()
    busy = false
    wipeOpen = false
    wipeText = ''
    ui.toast('Tüm stok ve primer verisi silindi', 'ok')
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
      <button class="btn" disabled={busy || store.demoCount > 0} onclick={demo}>🧪 Demo veri ekle (5000 ürün)</button>
      {#if store.demoCount > 0}
        <button class="btn danger" disabled={busy} onclick={removeDemo}>🧹 Demo veriyi sil ({store.demoCount})</button>
      {/if}
    </div>
    <p class="hint" style="margin-bottom:0">Demo veri işaretlidir; silince yalnızca o kayıtlar gider, kendi kayıtlarınız kalır.</p>
  </div>

  <div class="panel">
    <h2>Tehlikeli bölge</h2>
    <p class="hint" style="margin-top:0">
      Tüm stok ürünlerini, açık şişeleri ve primerleri siler. Kayıtlar (log), üyeler ve kategoriler silinmez.
      Bu işlem E-Tablodaki veriyi de siler; geri almak için E-Tabloda <i>Dosya → Sürüm geçmişi</i> kullanılabilir.
    </p>
    <div class="toolbar">
      <button class="btn danger" disabled={busy || !store.isAdmin} title={store.isAdmin ? '' : 'Önce yönetici girişi yapın'} onclick={() => (wipeOpen = true)}>
        ⚠️ Tüm stok ve primer verisini sil
      </button>
      {#if !store.isAdmin}<span class="hint">Yönetici girişi gerekir (yukarıdaki "Üyeler ve yönetici" bölümü).</span>{/if}
    </div>
  </div>

  {#if wipeOpen}
    <Dialog title="Tüm veriyi sil" width="460px" onclose={() => { wipeOpen = false; wipeText = '' }}>
      <form id="wipeform" onsubmit={wipe}>
        <p style="margin-top:0">
          <b>{store.items.length} ürün</b> ve <b>{store.primers.length} primer</b> kalıcı olarak silinecek.
        </p>
        <label class="f">Onaylamak için <b>SİL</b> yazın
          <!-- svelte-ignore a11y_autofocus -->
          <input type="text" bind:value={wipeText} autocomplete="off" autofocus />
        </label>
      </form>
      {#snippet footer()}
        <button class="btn" type="button" onclick={() => { wipeOpen = false; wipeText = '' }}>Vazgeç</button>
        <button class="btn primary danger" type="submit" form="wipeform" disabled={!wipeOk || busy}>Hepsini sil</button>
      {/snippet}
    </Dialog>
  {/if}

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
