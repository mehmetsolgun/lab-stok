export type View = 'dashboard' | 'stock' | 'primers' | 'orders' | 'log' | 'settings'
export type StockFilter = 'all' | 'critical' | 'low' | 'expiry'

class Ui {
  view = $state<View>('dashboard')
  stockFilter = $state<StockFilter>('all')
  toastMsg = $state('')
  toastKind = $state<'err' | 'ok'>('err')
  /** Phone-sized viewport: tables become card lists, nav moves to the bottom. Keep in sync with the CSS breakpoint. */
  narrow = $state(false)
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
  }

  toast(msg: string, kind: 'err' | 'ok' = 'err') {
    this.toastMsg = msg
    this.toastKind = kind
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => (this.toastMsg = ''), 3500)
  }
}

export const ui = new Ui()
