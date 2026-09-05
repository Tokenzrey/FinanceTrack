import type { DownloadedImage } from './types'

function gowaAuth(): { baseUrl: string; authHeader: string } {
  const baseUrl = process.env.GOWA_BASE_URL
  const user = process.env.GOWA_BASIC_AUTH_USER
  const password = process.env.GOWA_BASIC_AUTH_PASSWORD
  if (!baseUrl || !user || !password) {
    throw new Error('GOWA_BASE_URL/GOWA_BASIC_AUTH_USER/GOWA_BASIC_AUTH_PASSWORD belum dikonfigurasi.')
  }
  return { baseUrl, authHeader: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` }
}

/**
 * Downloads WhatsApp media via GOWA's own authenticated `GET /message/:id/download` —
 * deliberately not the `image.url`/`image.path` fields in the webhook payload, which
 * shift shape depending on GOWA's `WHATSAPP_AUTO_DOWNLOAD_MEDIA` setting (a raw,
 * possibly-encrypted WhatsApp CDN URL vs. a path on GOWA's own local disk). The
 * download endpoint always hands back the actual bytes regardless of that setting —
 * same "one authenticated endpoint, not raw webhook fields" pattern already used for
 * Telegram (`getFile`) and the WhatsApp Cloud API adapter this replaces.
 */
export async function downloadWhatsAppMedia(messageId: string): Promise<DownloadedImage> {
  const { baseUrl, authHeader } = gowaAuth()

  const res = await fetch(`${baseUrl}/message/${messageId}/download`, {
    headers: { Authorization: authHeader },
  })
  if (!res.ok) throw new Error('Gagal mengunduh foto dari WhatsApp (GOWA).')

  const buffer = Buffer.from(await res.arrayBuffer())
  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
  return { base64: buffer.toString('base64'), mimeType }
}
