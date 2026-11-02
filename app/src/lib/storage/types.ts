import type { Categories, Database, DigestConfig, LogEntry } from '../domain/types'

export type Table = 'items' | 'bottles' | 'primers'

export type Op =
  | { t: 'put'; table: Table; rows: { id: string }[] }
  | { t: 'del'; table: Table; ids: string[] }
  | { t: 'log'; entries: LogEntry[] }
  | { t: 'categories'; value: Categories }
  | { t: 'members'; value: string[] }
  | { t: 'admin'; value: { salt: string; hash: string } }
  | { t: 'digest'; value: DigestConfig } // needs a server (Apps Script) that lists 'digest' in its caps

/**
 * Plain deep copy of operations. UI state may hand us Svelte `$state` proxies, which IndexedDB cannot
 * structured-clone (DataCloneError), so every storage entry point copies first. Our data is JSON-safe.
 */
export function plainOps(ops: Op[]): Op[] {
  return JSON.parse(JSON.stringify(ops))
}

export interface SyncStatus {
  queued: number // batches not yet confirmed by the server
  error: string
}

/** Anything that can persist the lab database (IndexedDB, or IndexedDB cache + Google Sheets). */
export interface Storage {
  readonly name: string
  /** Features the server announced (e.g. 'digest'); empty for old servers and for local-only storage. */
  caps?: string[]
  /** Fast: returns what is stored on this computer. */
  load(): Promise<Database>
  apply(ops: Op[]): Promise<void>
  /** Optional remote sync. pull() fetches the server copy; poll() does so only if it changed. null = nothing new. */
  pull?(): Promise<Database | null>
  poll?(): Promise<Database | null>
  onStatus?: (s: SyncStatus) => void
}
