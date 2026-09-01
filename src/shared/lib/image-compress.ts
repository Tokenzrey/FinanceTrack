/**
 * Downscales and re-encodes a photo before it is sent to the scan API.
 *
 * A modern phone camera produces 4–12 MB JPEGs; base64 inflates that by ~33%, which
 * overruns serverless request-body limits and slows the model call for no accuracy gain.
 * Receipts stay legible well under 1600px on the long edge.
 */

const MAX_EDGE = 1600
const QUALITY = 0.82

export interface CompressedImage {
  /** Base64 payload with no data: prefix — what the Gemini inlineData field expects. */
  base64: string
  mimeType: string
  blob: Blob
  width: number
  height: number
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file)

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Browser tidak mendukung pemrosesan gambar')

  // White backdrop: a transparent PNG would otherwise flatten to black and hide the text.
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  )
  if (!blob) throw new Error('Gagal mengompres gambar')

  return {
    base64: await blobToBase64(blob),
    mimeType: 'image/jpeg',
    blob,
    width,
    height,
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Gagal membaca gambar'))
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}
