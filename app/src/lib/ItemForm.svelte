<script lang="ts">
  import Dialog from './Dialog.svelte'
  import { blankItem, store } from './state.svelte'
  import type { Item } from './domain/types'
  import { ui } from './ui.svelte'

  let { item, isNew, onclose }: { item: Item; isNew: boolean; onclose: () => void } = $props()

  // svelte-ignore state_referenced_locally
  let f = $state<Item>({ ...item })
  let error = $state('')
  let saved = $state(0)
  let brandEl: HTMLInputElement | undefined = $state()

  const brands = $derived([...new Set(store.items.map((i) => i.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')))
  const names = $derived([...new Set(store.items.map((i) => i.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')))

  function submit(e: SubmitEvent, keepOpen: boolean) {
    e.preventDefault()
    if (!f.name.trim()) return void (error = 'Malzeme adı zorunlu.')
    if (f.sealed < 0 || f.minStock < 0 || f.bottleSize < 0) return void (error = 'Sayılar negatif olamaz.')
    error = ''
    void store.saveItem({ ...f, brand: f.brand.trim(), name: f.name.trim() }, isNew)
    if (isNew && keepOpen) {
      // keep category/location context for rapid serial entry
      f = { ...blankItem(), purpose: f.purpose, storage: f.storage, unit: f.unit, cabinet: f.cabinet, shelf: f.shelf, box: f.box }
      saved++
      brandEl?.focus()
    } else onclose()
  }
  let wantClose = false
</script>

<Dialog title={isNew ? 'Yeni ürün' : 'Ürünü düzenle'} {onclose}>
  <form id="itemform" onsubmit={(e) => submit(e, !wantClose)}>
    <!-- default button for Enter key: save and keep entering -->
    <button type="submit" hidden aria-hidden="true" tabindex="-1" onclick={() => (wantClose = false)}></button>
    <div class="grid">
      <label class="f">Marka
        <!-- svelte-ignore a11y_autofocus -->
        <input type="text" list="brands" bind:value={f.brand} bind:this={brandEl} autocomplete="off" autofocus={isNew && !ui.narrow} />
      </label>
      <label class="f span2">Malzeme / Kimyasal adı *
        <input type="text" list="names" bind:value={f.name} autocomplete="off" required />
      </label>
      <label class="f">Kullanım amacı
        <select bind:value={f.purpose}><option value=""></option>{#each store.categories.purpose as o}<option>{o}</option>{/each}</select>
      </label>
      <label class="f">Saklama koşulu
        <select bind:value={f.storage}><option value=""></option>{#each store.categories.storage as o}<option>{o}</option>{/each}</select>
      </label>
      <label class="f">Ambalaj / birim
        <select bind:value={f.unit}><option value=""></option>{#each store.categories.unit as o}<option>{o}</option>{/each}</select>
      </label>
      <label class="f">SKT
        <input type="date" bind:value={f.skt} />
      </label>
      <label class="f">Şişe hacmi / paket içi adet
        <input type="number" min="0" step="any" bind:value={f.bottleSize} />
      </label>
      <label class="f">Kapalı (açılmamış) adet
        <input type="number" min="0" step="1" bind:value={f.sealed} />
      </label>
      <label class="f">Minimum stok (toplam adet)
        <input type="number" min="0" step="1" bind:value={f.minStock} />
      </label>
      <label class="f">Dolap<input type="text" bind:value={f.cabinet} placeholder="Dolap 1" /></label>
      <label class="f">Raf<input type="text" bind:value={f.shelf} placeholder="Raf 2" /></label>
      <label class="f">Kutu<input type="text" bind:value={f.box} placeholder="Kutu 3" /></label>
      <label class="f full">Not<textarea rows="2" bind:value={f.note}></textarea></label>
    </div>
    <datalist id="brands">{#each brands as b}<option value={b}></option>{/each}</datalist>
    <datalist id="names">{#each names as n}<option value={n}></option>{/each}</datalist>
    {#if error}<p class="err">{error}</p>{/if}
    {#if !isNew && f.bottleSize > 0}<p class="hint">Açık şişeler ve harcama için listedeki 🧪 butonunu kullanın.</p>{/if}
  </form>
  {#snippet footer()}
    {#if saved}<span class="hint" style="margin-right:auto">✓ {saved} ürün eklendi — Enter ile peş peşe girebilirsiniz</span>{/if}
    <button class="btn" type="button" onclick={onclose}>{saved ? 'Bitir' : 'İptal'}</button>
    {#if isNew}<button class="btn" type="submit" form="itemform" onclick={() => (wantClose = true)}>Kaydet ve kapat</button>{/if}
    <button class="btn primary" type="submit" form="itemform" onclick={() => (wantClose = false)}>{isNew ? 'Kaydet ve yeni ekle' : 'Kaydet'}</button>
  {/snippet}
</Dialog>
