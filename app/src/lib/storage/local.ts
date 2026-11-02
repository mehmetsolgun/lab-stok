import { DEFAULT_CATEGORIES, type Database } from '../domain/types'
import type { Op, Storage } from './types'

const STORES = ['items', 'bottles', 'primers'] as const

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of STORES) db.createObjectStore(s, { keyPath: 'id' })
      db.createObjectStore('log', { autoIncrement: true })
      db.createObjectStore('meta')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const wrap = <T>(r: IDBRequest<T>) =>
  new Promise<T>((res, rej) => {
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })

export class LocalStorageAdapter implements Storage {
  readonly name: string
  private dbp: Promise<IDBDatabase>

  constructor(dbName = 'labstok-v8', label = 'Bu bilgisayar (IndexedDB)') {
    this.name = label
    this.dbp = open(dbName)
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const db = await this.dbp
    return wrap(db.transaction('meta', 'readonly').objectStore('meta').get(key))
  }

  async putMeta(key: string, value: unknown): Promise<void> {
    const db = await this.dbp
    const tx = db.transaction('meta', 'readwrite')
    tx.objectStore('meta').put(value, key)
    await done(tx)
  }

  /** Replace everything with a fresh copy (used when pulling from the server). */
  async reset(db: Database): Promise<void> {
    const idb = await this.dbp
    const tx = idb.transaction([...STORES, 'log', 'meta'], 'readwrite')
    for (const s of STORES) {
      tx.objectStore(s).clear()
      for (const r of db[s]) tx.objectStore(s).put(r)
    }
    tx.objectStore('log').clear()
    for (const e of db.log) tx.objectStore('log').add(e)
    const meta = tx.objectStore('meta')
    meta.put(db.categories, 'categories')
    meta.put(db.members, 'members')
    if (db.admin) meta.put(db.admin, 'admin')
    else meta.delete('admin')
    await done(tx)
  }

  async load(): Promise<Database> {
    const db = await this.dbp
    const tx = db.transaction([...STORES, 'log', 'meta'], 'readonly')
    const meta = tx.objectStore('meta')
    const [items, bottles, primers, log, cats, members, admin] = await Promise.all([
      wrap(tx.objectStore('items').getAll()),
      wrap(tx.objectStore('bottles').getAll()),
      wrap(tx.objectStore('primers').getAll()),
      wrap(tx.objectStore('log').getAll()),
      wrap(meta.get('categories')),
      wrap(meta.get('members')),
      wrap(meta.get('admin')),
    ])
    return { items, bottles, primers, log, categories: cats ?? DEFAULT_CATEGORIES, members: members ?? [], admin: admin ?? null }
  }

  async apply(ops: Op[]): Promise<void> {
    const db = await this.dbp
    const tx = db.transaction([...STORES, 'log', 'meta'], 'readwrite')
    for (const op of ops) {
      if (op.t === 'put') {
        const s = tx.objectStore(op.table)
        for (const r of op.rows) s.put(r)
      } else if (op.t === 'del') {
        const s = tx.objectStore(op.table)
        for (const id of op.ids) s.delete(id)
      } else if (op.t === 'log') {
        const s = tx.objectStore('log')
        for (const e of op.entries) s.add(e)
      } else {
        tx.objectStore('meta').put(op.value, op.t)
      }
    }
    await done(tx)
  }
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((res, rej) => {
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
    tx.onabort = () => rej(tx.error)
  })
