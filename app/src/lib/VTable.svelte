<script lang="ts" generics="R">
  import type { Snippet } from 'svelte'
  import type { Col } from './cols'
  import { ui } from './ui.svelte'

  let {
    rows, cols, cell, card, rowKey, onrowdblclick, rowClass, sortKey = $bindable(''), sortDir = $bindable<1 | -1>(1),
    rowHeight = 38, cardHeight = 96, empty = 'Kayıt yok', minWidth = 980,
  }: {
    minWidth?: number
    rows: R[]
    cols: Col<R>[]
    cell: Snippet<[R, Col<R>]>
    /** Phone layout: one card per row (fixed height, so the list stays virtualized). */
    card?: Snippet<[R]>
    rowKey: (r: R) => string
    /** Double-click on desktop, tap on a card on phones. */
    onrowdblclick?: (r: R) => void
    rowClass?: (r: R) => string
    sortKey?: string
    sortDir?: 1 | -1
    rowHeight?: number
    cardHeight?: number
    empty?: string
  } = $props()

  const collator = new Intl.Collator('tr', { numeric: true })
  let scroller: HTMLDivElement | undefined = $state()
  let top = $state(0)
  let viewH = $state(600)

  const mobile = $derived(ui.narrow && !!card)
  const rh = $derived(mobile ? cardHeight : rowHeight)
  const sortable = $derived(cols.filter((c) => c.sort))

  const sorted = $derived.by(() => {
    const col = cols.find((c) => c.key === sortKey)
    if (!col?.sort) return rows
    const f = col.sort
    const dir = sortDir
    // compute each key once, then sort indices (avoids calling f() n·log n times)
    const keys = rows.map(f)
    const idx = rows.map((_, i) => i)
    idx.sort((a, b) => {
      const x = keys[a], y = keys[b]
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
      return collator.compare(String(x), String(y)) * dir
    })
    return idx.map((i) => rows[i])
  })

  const OVER = 8
  const start = $derived(Math.max(0, Math.floor(top / rh) - OVER))
  const end = $derived(Math.min(sorted.length, Math.ceil((top + viewH) / rh) + OVER))
  const visible = $derived(sorted.slice(start, end))
  const template = $derived(cols.map((c) => c.width).join(' '))

  function clickHead(c: Col<R>) {
    if (!c.sort) return
    if (sortKey === c.key) sortDir = sortDir === 1 ? -1 : 1
    else {
      sortKey = c.key
      sortDir = 1
    }
    if (scroller) scroller.scrollTop = 0
  }
</script>

{#snippet body()}
  <div class="vt-body" bind:this={scroller} bind:clientHeight={viewH} onscroll={(e) => (top = e.currentTarget.scrollTop)}>
    {#if sorted.length === 0}
      <div class="vt-empty">{empty}</div>
    {:else}
      <div style:height="{sorted.length * rh}px" style:position="relative">
        <div style:transform="translateY({start * rh}px)">
          {#each visible as r, i (rowKey(r))}
            {#if mobile}
              <div
                class="vc {rowClass?.(r) ?? ''}"
                style:height="{rh}px"
                role="button"
                tabindex="0"
                onclick={() => onrowdblclick?.(r)}
                onkeydown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onrowdblclick?.(r)}
              >
                {@render card!(r)}
              </div>
            {:else}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="vt-row {rowClass?.(r) ?? ''}"
                class:odd={(start + i) % 2 === 1}
                style:grid-template-columns={template}
                style:height="{rh}px"
                ondblclick={() => onrowdblclick?.(r)}
              >
                {#each cols as c (c.key)}
                  <div class="vt-c {c.align ?? ''}">{@render cell(r, c)}</div>
                {/each}
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/snippet}

{#if mobile}
  <div class="vt vt-m">
    {#if sortable.length}
      <div class="vt-sortbar">
        <span class="sub" style="white-space:nowrap">{sorted.length} kayıt</span>
        <select aria-label="Sıralama ölçütü" bind:value={sortKey} onchange={() => scroller && (scroller.scrollTop = 0)}>
          {#each sortable as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
        </select>
        <button class="btn sm" aria-label="Sıralama yönü" onclick={() => (sortDir = sortDir === 1 ? -1 : 1)}>{sortDir === 1 ? '▲ A→Z' : '▼ Z→A'}</button>
      </div>
    {/if}
    {@render body()}
  </div>
{:else}
  <div class="vt">
    <div class="vt-in" style:min-width="{minWidth}px">
      <div class="vt-head" style:grid-template-columns={template}>
        {#each cols as c (c.key)}
          <button
            class="vt-h {c.align ?? ''}"
            class:sortable={!!c.sort}
            onclick={() => clickHead(c)}
            title={c.sort ? 'Sıralamak için tıklayın' : undefined}
          >
            {c.label}{#if sortKey === c.key}<span class="arrow">{sortDir === 1 ? '▲' : '▼'}</span>{/if}
          </button>
        {/each}
      </div>
      {@render body()}
    </div>
  </div>
{/if}
