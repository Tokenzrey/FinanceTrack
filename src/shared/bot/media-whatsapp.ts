import type { DownloadedImage } from './types'

function accessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN belum dikonfigurasi.')
  return token
}

/**
 * Downloads a WhatsApp media object by id. Two calls: `GET /{media-id}` resolves to a
 * short-lived (~5 minute) signed URL, which must then be fetched with the same bearer
 * token — both steps happen immediately, in the same request, well inside that window.
 */
export async function downloadWhatsAppMedia(mediaId: string): Promise<DownloadedImage> {
  const token = accessToken()

  const infoRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!infoRes.ok) throw new Error('Gagal mengambil info media dari WhatsApp.')
  const info = (await infoRes.json()) as { url?: string; mime_type?: string }
  if (!info.url) throw new Error('WhatsApp tidak memberi URL media.')

  const fileRes = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } })
  if (!fileRes.ok) throw new Error('Gagal mengunduh foto dari WhatsApp.')

  const buffer = Buffer.from(await fileRes.arrayBuffer())
  return { base64: buffer.toString('base64'), mimeType: info.mime_type ?? 'image/jpeg' }
}
