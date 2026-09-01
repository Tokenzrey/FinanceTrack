import { compressImage } from '@/shared/lib/image-compress'
import { getOrCreateFinTrackFolders, uploadFileToGDrive, type DriveFile } from '@/shared/lib/gdrive'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

export interface UploadedReceipt {
  gDriveFileId: string
  gDriveWebViewLink: string
  gDriveThumbnailLink?: string
}

/**
 * Uploads a receipt image into the user's own Google Drive, under `FinTrack/Receipts`.
 *
 * The caller supplies the access token via `useGoogleDrive().executeWithToken`, which
 * owns refreshing it — this function stays a pure "given a token, do the upload".
 *
 * The image is compressed first: a phone photo is several megabytes, and Drive quota is
 * the user's own, so uploading the raw file spends their storage for no extra legibility.
 */
export async function uploadReceipt(
  accessToken: string,
  transactionId: string,
  file: File,
): Promise<UploadedReceipt> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error('Format gambar harus JPG, PNG, WEBP, atau HEIC')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Ukuran gambar maksimal 10 MB')
  }

  const compressed = await compressImage(file)
  const { receiptsId } = await getOrCreateFinTrackFolders(accessToken)

  const uploaded: DriveFile = await uploadFileToGDrive(
    compressed.blob,
    `receipt-${transactionId}.jpg`,
    receiptsId,
    accessToken,
  )

  return {
    gDriveFileId: uploaded.fileId,
    gDriveWebViewLink: uploaded.webViewLink,
    gDriveThumbnailLink: uploaded.thumbnailLink,
  }
}
