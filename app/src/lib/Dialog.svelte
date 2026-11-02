<script lang="ts">
  import type { Snippet } from 'svelte'

  let { title, onclose, children, footer, width }: {
    title: string
    onclose: () => void
    children: Snippet
    footer?: Snippet
    width?: string
  } = $props()

  let el: HTMLDialogElement | undefined = $state()
  $effect(() => {
    el?.showModal()
  })
</script>

<dialog bind:this={el} {onclose} style:width onclick={(e) => e.target === el && el?.close()}>
  <div class="dlg-h"><h2 style="margin:0">{title}</h2><button class="icon" aria-label="Kapat" onclick={() => el?.close()}>✕</button></div>
  <div class="dlg-b">{@render children()}</div>
  {#if footer}<div class="dlg-f">{@render footer()}</div>{/if}
</dialog>
