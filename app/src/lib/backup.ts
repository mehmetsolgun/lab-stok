import { IMPORT_FORMAT } from './importer'
import { store } from './state.svelte'
import { todayIso } from './domain/rules'

/**
 * Everything worth restoring, in the same labstok-import-v1 format the importer reads
 * (so a backup file can be loaded back through "Dosyadan veri içe aktar" / "Yedekten geri yükle").
 * The admin password hash is deliberately left out.
 */
export function backupPayload() {
  return {
    format: IMPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    exportedBy: store.user,
    categories: store.categories,
    members: store.members,
    items: store.items,
    bottles: store.bottles,
    primers: store.primers,
  }
}

export function downloadBackup() {
  const blob = new Blob([JSON.stringify(backupPayload(), null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `labstok-yedek-${todayIso()}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
