export type View = 'dashboard' | 'stock' | 'count' | 'primers' | 'orders' | 'fix' | 'log' | 'settings'
export type StockFilter = 'all' | 'critical' | 'low' | 'expiry'

export interface ToastAction {
  label: string
  run: () => void
}

class Ui {
  view = $state<View>('dashboard')
  stockFilter = $state<StockFilter>('all')
  toastMsg = $state('')
  toastKind = $state<'err' | 'ok'>('err')
  toastAction = $state.raw<ToastAction | null>(null)
  /** Phone-sized viewport: tables become card lists, nav moves to the bottom. Keep in sync with the CSS breakpoint. */
  narrow = $state(false)
  /** Item whose detail sheet is open ('' = none). Any screen can set it through openItem(). */
  detailItemId = $state('')
  paletteOpen = $state(false)
  moreOpen = $state(false) // phone: the "Daha fazla" sheet
  primerQuery = $state('') // set by the palette; the primer list starts with it
  newItem = $state(false) // set by the palette / dashboard: the stock screen opens an empty form
  private timer = 0

  constructor() {
    if (typeof matchMedia === 'undefined') return
    const m = matchMedia('(max-width: 760px)')
    this.narrow = m.matches
    m.addEventListener('change', (e) => (this.narrow = e.matches))
  }

  go(view: View, filter: StockFilter = 'all') {
    this.view = view
    this.stockFilter = filter
    this.moreOpen = false
  }

  openItem(id: string) {
    this.detailItemId = id
    this.paletteOpen = false
  }

  /** A message at the bottom of the screen; with an action it stays longer so "Geri al" can be reached. */
  toast(msg: string, kind: 'err' | 'ok' = 'err', action?: ToastAction) {
    this.toastMsg = msg
    this.toastKind = kind
    this.toastAction = action ?? null
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => this.dismissToast(), action ? 8000 : 3500)
  }

  dismissToast() {
    this.toastMsg = ''
    this.toastAction = null
  }
}

export const ui = new Ui()
