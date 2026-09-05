import type { DownloadedImage } from './types'

function gowaAuth(): { baseUrl: string; authHeader: string } {
  const baseUrl = process.env.GOWA_BASE_URL
  const user = process.env.GOWA_BASIC_AUTH_USER
  const password = process.env.GOWA_BASIC_AUTH_PASSWORD
  if (!baseUrl || !user || !password) {
    throw new Error('GOWA_BASE_URL/GOWA_BASIC_AUTH_USER/GOWA_BASIC_AUTH_PASSWORD belum dikonfigurasi.')
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    authHeader: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
  }
}

interface GowaDownloadResult {
  file_url?: string
  file_path?: string
  media_type?: string
}

/** GOWA emits `file_url` from its own request scheme/host (`c.Scheme()://c.Host()`).
 *  Behind a reverse proxy / tunnel that can come back as `http://localhost:3000/...`
 *  even though the public base is something else — unusable from here. Detect that and
 *  rebuild the URL from the always-relative `file_path` against our configured base. */
function resolveMediaUrl(baseUrl: string, result: GowaDownloadResult): string {
  const fileUrl = result.file_url?.trim()
  const isLoopback = fileUrl ? /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\//i.test(fileUrl) : true

  if (fileUrl && !isLoopback) return fileUrl

  const filePath = result.file_path?.trim()
  if (!filePath) {
    throw new Error(
      `GOWA /message/:id/download tidak mengembalikan file_url maupun file_path yang bisa dipakai — respons: ${JSON.stringify(result).slice(0, 300)}`,
    )
  }
  return `${baseUrl}/${filePath.replace(/^\/+/, '')}`
}

/**
 * Downloads WhatsApp media via GOWA's `GET /message/:id/download`.
 *
 * That endpoint requires a `phone` query param (the chat JID the message belongs to —
 * GOWA cross-checks `message.ChatJID == phone`), and it does NOT stream the bytes: it
 * saves the media under GOWA's own `statics/` dir and returns JSON with a `file_url` /
 * `file_path`. So this is a two-hop fetch — download endpoint for the location, then
 * the static file itself (still behind the same Basic Auth). A GOWA build that streams
 * raw bytes directly (image/* content-type) is still handled, for forward/back compat.
 */
export async function downloadWhatsAppMedia(messageId: string, phone: string): Promise<DownloadedImage> {
  const { baseUrl, authHeader } = gowaAuth()

  const res = await fetch(
    `${baseUrl}/message/${encodeURIComponent(messageId)}/download?phone=${encodeURIComponent(phone)}`,
    { headers: { Authorization: authHeader } },
  )
  if (!res.ok) {
    // The status/body are the one thing that actually explains *why* — 401 (bad
    // Basic Auth), 404 (wrong id / media no longer cached on GOWA's side), 400 (GOWA
    // validation error, e.g. a missing/mismatched phone), 5xx (GOWA-side failure)
    // each point somewhere completely different.
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Gagal mengunduh foto dari WhatsApp (GOWA): HTTP ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ''}`,
    )
  }

  const contentType = res.headers.get('content-type') ?? ''

  // Legacy / alternate GOWA build: media streamed straight back as raw bytes.
  if (!contentType.includes('application/json')) {
    const buffer = Buffer.from(await res.arrayBuffer())
    const mimeType = contentType.split(';')[0]?.trim() || 'image/jpeg'
    return { base64: buffer.toString('base64'), mimeType }
  }

  // Documented shape: { code, message, results: { file_url, file_path, media_type, ... } }
  const body = (await res.json().catch(() => null)) as { results?: GowaDownloadResult } | null
  if (!body?.results) {
    throw new Error('GOWA /message/:id/download mengembalikan JSON tanpa field `results` — bentuk respons tak dikenali.')
  }

  const mediaUrl = resolveMediaUrl(baseUrl, body.results)
  const fileRes = await fetch(mediaUrl, { headers: { Authorization: authHeader } })
  if (!fileRes.ok) {
    const detail = await fileRes.text().catch(() => '')
    throw new Error(
      `Gagal mengambil file media dari GOWA (${mediaUrl}): HTTP ${fileRes.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`,
    )
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer())
  const fileContentType = fileRes.headers.get('content-type')?.split(';')[0]?.trim()
  // GOWA's `media_type` is a coarse bucket ("image"), not a real MIME — only useful
  // as a last resort when the static route sends no content-type of its own.
  const mimeType = fileContentType || body.results.media_type || 'image/jpeg'
  return { base64: buffer.toString('base64'), mimeType }
}
