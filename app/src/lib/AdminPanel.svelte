<script lang="ts">
  import { store } from './state.svelte'
  import { ui } from './ui.svelte'

  let pw = $state('')
  let wrong = $state(false)
  let busy = $state(false)
  let newName = $state('')
  let newPw = $state('')
  let newPw2 = $state('')

  async function unlock(e: SubmitEvent) {
    e.preventDefault()
    busy = true
    wrong = !(await store.unlockAdmin(pw))
    busy = false
    pw = ''
  }

  function addMember(e: SubmitEvent) {
    e.preventDefault()
    const n = newName.trim()
    if (!n) return
    if (store.members.some((m) => m.toLocaleLowerCase('tr') === n.toLocaleLowerCase('tr'))) return ui.toast('Bu isim listede zaten var.')
    void store.saveMembers([...store.members, n].sort((a, b) => a.localeCompare(b, 'tr')), `'${n}' üye listesine eklendi.`)
    newName = ''
  }

  function removeMember(n: string) {
    if (store.members.length <= 1) return ui.toast('Listede en az bir üye kalmalı.')
    void store.saveMembers(store.members.filter((m) => m !== n), `'${n}' üye listesinden çıkarıldı.`)
  }

  async function changePw(e: SubmitEvent) {
    e.preventDefault()
    if (newPw.length < 6) return ui.toast('Şifre en az 6 karakter olmalı.')
    if (newPw !== newPw2) return ui.toast('Şifreler aynı değil.')
    await store.changePassword(newPw)
    newPw = newPw2 = ''
    ui.toast('Yönetici şifresi değiştirildi', 'ok')
  }
</script>

{#if !store.isAdmin}
  <form onsubmit={unlock} style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:end">
    <label class="f">Yönetici şifresi
      <input type="password" bind:value={pw} class:invalid={wrong} autocomplete="current-password" required />
    </label>
    <button class="btn primary" type="submit" disabled={busy}>Yönetici girişi</button>
    {#if wrong}<span class="err">Şifre yanlış.</span>{/if}
  </form>
{:else}
  <div class="cols2">
    <div>
      <b>Laboratuvar üyeleri ({store.members.length})</b>
      <div class="taglist" style="margin:.5rem 0">
        {#each store.members as m (m)}
          <span class="tag">{m}<button aria-label="{m} çıkar" onclick={() => removeMember(m)}>✕</button></span>
        {/each}
      </div>
      <form onsubmit={addMember} style="display:flex;gap:.4rem">
        <input type="text" placeholder="Ad Soyad" bind:value={newName} style="flex:1" />
        <button class="btn" type="submit">Ekle</button>
      </form>
    </div>
    <form onsubmit={changePw} style="display:grid;gap:.5rem;align-content:start">
      <b>Yönetici şifresini değiştir</b>
      <input type="password" placeholder="Yeni şifre" bind:value={newPw} autocomplete="new-password" />
      <input type="password" placeholder="Yeni şifre (tekrar)" bind:value={newPw2} autocomplete="new-password" />
      <button class="btn" type="submit">Şifreyi değiştir</button>
    </form>
  </div>
{/if}
