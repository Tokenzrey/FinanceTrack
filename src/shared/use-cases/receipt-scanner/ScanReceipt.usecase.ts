import { getFirebaseAuth } from '@/shared/lib/firebase'
import { compressImage } from '@/shared/lib/image-compress'
import { getOrCreateFinTrackFolders, uploadFileToGDrive } from '@/shared/lib/gdrive'
import { repositories } from '@/shared/repositories'
import type { Category } from '@/shared/types/domain'
import type { ReceiptScanRecord, ReceiptScanResult } from '@/shared/types/receipt-scanner.types'

export type ScanStage = 'compressing' | 'uploading' | 'reading' | 'mapping' | 'done'

export interface ScanReceiptOptions {
  onStage?: (stage: ScanStage) => void
}

export class ScanUnavailableError extends Error {
  /** The image is already in Drive, so the user can retry without re-shooting it. */
  constructor(
    message: string,
    readonly scanId: string,
    readonly imageUrl: string,
  ) {
    super(message)
    this.name = 'ScanUnavailableError'
  }
}

/**
 * Full scan pipeline: compress → upload to Drive → Gemini → persist the scan record.
 *
 * The image is uploaded before the model call on purpose. If the AI step fails, the
 * photo is still saved and the user can retry or fall back to manual entry rather than
 * having to photograph the receipt again.
 *
 * Storage is the user's own Google Drive (`FinTrack/Receipts`) rather than Firebase
 * Storage: no storage cost, and the receipts stay in the user's custody.
 */
export async function scanReceipt(
  userId: string,
  accessToken: string,
  file: File,
  categories: Category[],
  options: ScanReceiptOptions = {},
): Promise<ReceiptScanRecord> {
  const { onStage } = options

  onStage?.('compressing')
  const compressed = await compressImage(file)

  onStage?.('uploading')
  const scanId = repositories.receiptScans.newScanId(userId)
  const { receiptsId } = await getOrCreateFinTrackFolders(accessToken)
  const uploaded = await uploadFileToGDrive(
    compressed.blob,
    `scan-${scanId}.jpg`,
    receiptsId,
    accessToken,
  )

  onStage?.('reading')

  const user = getFirebaseAuth().currentUser
  if (!user) throw new Error('Sesi berakhir. Masuk ulang lalu coba lagi.')
  const token = await user.getIdToken()

  const hints = await repositories.receiptScans.findHints(userId)

  const response = await fetch('/api/ai/scan-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      imageBase64: compressed.base64,
      mimeType: compressed.mimeType,
      categories: categories
        .filter((c) => c.isActive && c.pillar !== 'income')
        .map((c) => ({ id: c.id, name: c.name, pillar: c.pillar })),
      hints,
    }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new ScanUnavailableError(
      payload.error ?? 'Scan AI gagal. Coba lagi nanti.',
      scanId,
      uploaded.webViewLink,
    )
  }

  onStage?.('mapping')
  const result = (await response.json()) as ReceiptScanResult

  const record = await repositories.receiptScans.create(
    userId,
    scanId,
    uploaded.webViewLink,
    uploaded.fileId,
    result,
  )

  onStage?.('done')
  return record
}
