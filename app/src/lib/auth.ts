export interface AdminSecret {
  salt: string
  hash: string
}

const enc = new TextEncoder()
const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

async function derive(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 150_000, hash: 'SHA-256' }, key, 256,
  )
  return toHex(bits)
}

export async function makeAdminSecret(password: string): Promise<AdminSecret> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  return { salt, hash: await derive(password, salt) }
}

export async function checkAdminPassword(password: string, s: AdminSecret): Promise<boolean> {
  return (await derive(password, s.salt)) === s.hash
}
