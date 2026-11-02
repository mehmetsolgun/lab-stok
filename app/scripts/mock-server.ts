// Dev only: serves apps-script/Code.gs over HTTP backed by an in-memory fake Google Sheet.
// Run: node --experimental-transform-types scripts/mock-server.ts
import { createServer } from 'node:http'
import { makeBackend } from '../src/lib/storage/fakeSheets.ts'

const be = makeBackend()
const key = be.setup()
const DELAY = Number(process.env.DELAY ?? 250) // imitate Apps Script latency

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return void res.writeHead(204).end()
  if (req.method !== 'POST') return void res.writeHead(200).end('Lab Stok API çalışıyor.')
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () =>
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(be.doPost({ postData: { contents: body } }).text)
    }, DELAY),
  )
}).listen(8787, () => console.log(`MOCK READY key=${key}`))
