<script lang="ts">
  import VTable from './VTable.svelte'
  import type { Col } from './cols'
  import { store } from './state.svelte'
  import type { LogEntry } from './domain/types'

  let query = $state('')
  let q = $state('')
  let timer = 0
  $effect(() => {
    const v = query
    clearTimeout(timer)
    timer = window.setTimeout(() => (q = v.toLocaleLowerCase('tr').trim()), 150)
    return () => clearTimeout(timer)
  })
  let action = $state('')
  let user = $state('')
  let sortKey = $state('ts')
  let sortDir = $state<1 | -1>(-1)

  const users = $derived([...new Set(store.log.map((l) => l.user))].sort())
  const rows = $derived.by(() => {
    const words = q.split(/\s+/).filter(Boolean)
    return store.log.filter((l) => {
      if (action && l.action !== action) return false
      if (user && l.user !== user) return false
      const hay = `${l.detail} ${l.module} ${l.user} ${l.ts}`.toLocaleLowerCase('tr')
      return words.every((w) => hay.includes(w))
    })
  })

  const cols: Col<LogEntry>[] = [
    { key: 'ts', label: 'Tarih / Saat', width: '165px', sort: (l) => l.ts },
    { key: 'user', label: 'Kullanıcı', width: 'minmax(120px,1fr)', sort: (l) => l.user },
    { key: 'module', label: 'Modül', width: '140px', sort: (l) => l.module },
    { key: 'action', label: 'İşlem', width: '110px', sort: (l) => l.action },
    { key: 'detail', label: 'Detay', width: 'minmax(260px,3fr)' },
  ]
  const kind = (a: string) => ({ EKLEME: 'ok', GÜNCELLEME: 'info', SİLME: 'bad', HARCAMA: 'warn' })[a] ?? ''
  const fmt = (ts: string) => {
    const d = new Date(ts)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }
</script>

<div class="toolbar">
  <h1>Kayıtlar</h1>
  <input class="grow" type="search" placeholder="Detay, kullanıcı, tarih…" bind:value={query} />
  <select bind:value={user}><option value="">Tüm kullanıcılar</option>{#each users as u}<option>{u}</option>{/each}</select>
  <select bind:value={action}><option value="">Tüm işlemler</option>{#each ['EKLEME', 'GÜNCELLEME', 'SİLME', 'HARCAMA'] as a}<option>{a}</option>{/each}</select>
</div>
<div class="hint">{rows.length} kayıt · kayıtlar yalnızca eklenir, düzenlenemez</div>
<VTable minWidth={820} {rows} {cols} rowKey={(l) => l.ts + l.detail} bind:sortKey bind:sortDir cardHeight={92} empty="Kayıt yok">
  {#snippet card(l)}
    <div class="mc">
      <div class="mc-top">
        <span class="sub">{fmt(l.ts)}</span>
        <span class="badge {kind(l.action)}" style="margin-left:auto">{l.action}</span>
      </div>
      <div class="mc-line"><b>{l.user}</b> <span class="sub">· {l.module}</span></div>
      <div class="mc-clamp">{l.detail}</div>
    </div>
  {/snippet}
  {#snippet cell(l, c)}
    {#if c.key === 'ts'}{fmt(l.ts)}
    {:else if c.key === 'user'}<span class="tx" title={l.user}>{l.user}</span>
    {:else if c.key === 'module'}<span class="tx" title={l.module}>{l.module}</span>
    {:else if c.key === 'action'}<span class="badge {kind(l.action)}">{l.action}</span>
    {:else}<span class="tx" title={l.detail}>{l.detail}</span>{/if}
  {/snippet}
</VTable>
