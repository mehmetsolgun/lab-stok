import type { Database } from '../domain/types'
import type { LocalStorageAdapter } from './local'
import type { Remote } from './remote'
import type { Op, Storage, SyncStatus } from './types'

const RETRY_MS = 8000

/**
 * Local-first storage: the UI always reads/writes the IndexedDB copy (instant), while changes are
 * queued in an outbox and sent to the Google Sheet in the background. The outbox survives reloads.
 */
export class SyncStorage implements Storage {
  readonly name = 'Google E-Tablo (yerel önbellekli)'
  onStatus?: (s: SyncStatus) => void

  private outbox: Op[][] = []
  private lastVersion = -1
  private flushing = false
  private epoch = 0 // bumped on every local write; lets pull() detect it raced with an edit
  private error = ''
  private retry: ReturnType<typeof setTimeout> | undefined

  constructor(private local: LocalStorageAdapter, private remote: Remote, private retryMs = RETRY_MS) {}

  async load(): Promise<Database> {
    this.outbox = (await this.local.getMeta<Op[][]>('outbox')) ?? []
    if (this.outbox.length) void this.flush()
    this.emit()
    return this.local.load()
  }

  async apply(ops: Op[]): Promise<void> {
    this.epoch++
    await this.local.apply(ops)
    this.outbox.push(ops)
    await this.local.putMeta('outbox', this.outbox)
    this.emit()
    void this.flush()
  }

  async pull(): Promise<Database | null> {
    if (this.outbox.length || this.flushing) return null
    const epoch = this.epoch
    const { version, db } = await this.remote.load()
    // the user edited while we were downloading: keep their edit, pull again later
    if (epoch !== this.epoch || this.outbox.length) return null
    await this.local.reset(db)
    this.lastVersion = version
    this.setError('')
    return db
  }

  async poll(): Promise<Database | null> {
    if (this.outbox.length || this.flushing) return null
    const v = await this.remote.version()
    if (v === this.lastVersion) return null
    return this.pull()
  }

  /** Send queued batches in order; stops (and retries later) on the first failure. */
  async flush(): Promise<void> {
    if (this.flushing) return
    this.flushing = true
    clearTimeout(this.retry)
    try {
      while (this.outbox.length) {
        const v = await this.remote.apply(this.outbox[0])
        // exactly our own write → nothing else changed; otherwise force a re-pull on next poll
        this.lastVersion = v === this.lastVersion + 1 ? v : -1
        this.outbox.shift()
        await this.local.putMeta('outbox', this.outbox)
        this.emit()
      }
      this.setError('')
    } catch (e) {
      this.setError(e instanceof Error ? e.message : String(e))
      this.retry = setTimeout(() => void this.flush(), this.retryMs)
    } finally {
      this.flushing = false
    }
  }

  private setError(msg: string) {
    this.error = msg
    this.emit()
  }

  private emit() {
    this.onStatus?.({ queued: this.outbox.length, error: this.error })
  }
}
