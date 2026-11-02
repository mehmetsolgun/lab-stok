<script lang="ts">
  import Dialog from './Dialog.svelte'
  import { store } from './state.svelte'

  let { itemId, onclose }: { itemId: string; onclose: () => void } = $props()

  const row = $derived(store.itemRows.find((r) => r.item.id === itemId))
  let amount = $state<number | null>(null)
  let error = $state('')

  function submit(e: SubmitEvent) {
    e.preventDefault()
    const err = store.spendItem(itemId, Number(amount))
    if (err) error = err
    else onclose()
  }
</script>

{#if row}
  <Dialog title="Harcama yap" width="420px" {onclose}>
    <form id="spendform" onsubmit={submit}>
      <p style="margin-top:0"><b>{row.item.name}</b><br /><span class="sub">{row.item.brand}</span></p>
      <p class="hint">
        Açık şişe: {row.open.length ? row.open.map((b) => `${b.remaining}`).join(' + ') : 'yok'} · kapalı: {row.item.sealed} × {row.item.bottleSize}{row.item.sizeUnit ? ' ' + row.item.sizeUnit : ''}
      </p>
      <label class="f">Harcanan miktar{row.item.sizeUnit ? ` (${row.item.sizeUnit})` : ''}
        <!-- svelte-ignore a11y_autofocus -->
        <input type="number" min="0" step="any" inputmode="decimal" bind:value={amount} autofocus required />
      </label>
      <p class="hint">En eski açık şişeden düşer; biterse yeni şişe otomatik açılır.</p>
      {#if error}<p class="err">{error}</p>{/if}
    </form>
    {#snippet footer()}
      <button class="btn" onclick={onclose}>İptal</button>
      <button class="btn primary" type="submit" form="spendform">Düş</button>
    {/snippet}
  </Dialog>
{/if}
