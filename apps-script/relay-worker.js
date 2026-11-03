/**
 * Lab Stok Takip — aracı (Cloudflare Worker).
 *
 * Bazı okul/kurum ağları script.google.com adresini engeller. Bu küçük aracı, uygulamadan gelen isteği
 * Google'daki Apps Script'e iletir ve yanıtı geri verir; ağ yalnızca bu aracının adresini görür.
 * Erişim anahtarı yine Apps Script'te doğrulanır, aracı hiçbir şey saklamaz (bkz. KURULUM.md).
 *
 * TARGET: Apps Script web uygulamasının "…/exec" adresi (Cloudflare'de ortam değişkeni olarak da verilebilir).
 */
const TARGET = 'BURAYA_APPS_SCRIPT_EXEC_ADRESINI_YAPISTIRIN'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json;charset=utf-8' } })

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (req.method !== 'POST') return new Response('Lab Stok aracısı çalışıyor.', { headers: CORS })

    const target = (env && env.TARGET) || TARGET
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(target)) {
      return json({ ok: false, error: 'Aracı kurulumu eksik: TARGET adresi Apps Script "/exec" adresi olmalı.' }, 500)
    }

    let upstream
    try {
      // Apps Script answers a POST with a 302 to the result; fetch follows it with a GET, exactly as a browser would
      upstream = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: await req.text(),
        redirect: 'follow',
      })
    } catch {
      return json({ ok: false, error: 'Aracı Google Apps Script\'e ulaşamadı.' }, 502)
    }
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json;charset=utf-8' },
    })
  },
}
