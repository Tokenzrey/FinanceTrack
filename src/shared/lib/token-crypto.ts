import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Server-only AES-256-GCM for the Google Drive refresh token at rest.
 *
 * The refresh token is stored in Firestore under the user's own document, which their
 * own Firestore rules let them read (so the "linked" status can be shown without an
 * extra endpoint) — the risk is any client-side XSS reading that field verbatim. GCM
 * means the ciphertext is useless without `TOKEN_ENCRYPTION_KEY`, which never leaves
 * this server. A user who writes garbage into the field cannot forge a working grant:
 * only this key can produce ciphertext Google's refresh call will ever accept.
 */

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY belum dikonfigurasi di .env.local')
  const key = Buffer.from(raw, 'hex')
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY harus 32 byte (64 karakter hex)')
  }
  return key
}

/** Returns `iv.authTag.ciphertext`, each base64, concatenated with `.`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join('.')
}

export function decryptSecret(packed: string): string {
  const [ivB64, authTagB64, ciphertextB64] = packed.split('.')
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Format token terenkripsi tidak valid')
  }
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}
