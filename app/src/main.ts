import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

// offline app shell + installable on phones; only in the production build so dev HMR is not cached
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => {}))
}

export default app
