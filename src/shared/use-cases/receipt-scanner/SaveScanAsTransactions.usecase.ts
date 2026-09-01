import { deleteDriveFile } from '@/shared/lib/gdrive'
import { repositories } from '@/shared/repositories'
import type { CreateTransactionDTO } from '@/shared/types/dto'
import type {
  ReceiptScanRecord,
  SaveScanAsTransactionsDTO,
} from '@/shared/types/receipt-scanner.types'

/**
 * Turns a reviewed scan into transactions.
 *
 * `single` writes one transaction for the whole receipt; `itemized` writes one per line.
 * Every transaction carries the scan's image as its receipt, so the photo is reachable
 * from any of them.
 */
export async function saveScanAsTransactions(
  userId: string,
  record: ReceiptScanRecord,
  dto: SaveScanAsTransactionsDTO,
): Promise<string[]> {
  const categories = await repositories.categories.findAll(userId)
  const pillarOf = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId)
    if (!category) throw new Error('Kategori tidak ditemukan')
    return category.pillar
  }

  const drafts: CreateTransactionDTO[] = []

  if (dto.mode === 'single') {
    const single = dto.singleTransaction
    if (!single) throw new Error('Detail transaksi belum lengkap')
    if (single.amount <= 0) throw new Error('Jumlah harus lebih dari nol')

    drafts.push({
      date: dto.date,
      type: 'expense',
      pillar: pillarOf(single.categoryId),
      categoryId: single.categoryId,
      categoryItemId: single.categoryItemId,
      amount: single.amount,
      description: single.description,
      location: record.scanResult.extraction.merchant ?? undefined,
      tags: ['scan'],
      gDriveFileId: record.gDriveFileId,
      gDriveWebViewLink: record.imageUrl,
    })
  } else {
    const items = dto.itemTransactions ?? []
    if (items.length === 0) throw new Error('Tidak ada item untuk disimpan')

    for (const item of items) {
      if (item.amount <= 0) continue
      drafts.push({
        date: dto.date,
        type: 'expense',
        pillar: pillarOf(item.categoryId),
        categoryId: item.categoryId,
        categoryItemId: item.categoryItemId,
        amount: item.amount,
        description: item.description,
        location: record.scanResult.extraction.merchant ?? undefined,
        tags: ['scan'],
        gDriveFileId: record.gDriveFileId,
        gDriveWebViewLink: record.imageUrl,
      })
    }
  }

  if (drafts.length === 0) throw new Error('Tidak ada item dengan jumlah valid')

  // Sequential create rather than bulkCreate: the ids are needed on the scan record
  // so a saved scan can be traced to the transactions it produced.
  const ids: string[] = []
  for (const draft of drafts) {
    const created = await repositories.transactions.create(userId, draft)
    ids.push(created.id)
  }

  await repositories.receiptScans.markSaved(userId, record.id, ids)
  return ids
}

/**
 * Drops the scan and its image. Used when the user rejects a bad read.
 *
 * Deleting from Drive needs a token, so it is optional: without one the record is still
 * marked discarded and the file simply stays in the user's own Drive folder, where they
 * can remove it themselves. Failing the whole discard over a file delete would be worse.
 */
export async function discardScan(
  userId: string,
  record: ReceiptScanRecord,
  accessToken?: string,
): Promise<void> {
  await repositories.receiptScans.markDiscarded(userId, record.id)

  if (record.gDriveFileId && accessToken) {
    await deleteDriveFile(record.gDriveFileId, accessToken).catch(() => {})
  }
}
