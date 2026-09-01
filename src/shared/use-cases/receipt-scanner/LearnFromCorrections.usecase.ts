import { applyCorrections, type LearnedCorrection } from '@/shared/lib/scan-hints'
import { repositories } from '@/shared/repositories'
import type { MappedReceiptItem, UserCorrection } from '@/shared/types/receipt-scanner.types'

/**
 * Persists what the user changed about a scan, and folds the category changes into the
 * hint list that seeds the next scan's mapping prompt.
 *
 * Only items the user actually re-categorised teach anything — accepting the AI's
 * suggestion is not a signal, otherwise the model would keep reinforcing its own guesses.
 */
export async function learnFromCorrections(
  userId: string,
  scanId: string,
  original: MappedReceiptItem[],
  reviewed: { name: string; categoryId: string | null }[],
): Promise<void> {
  const corrections: UserCorrection[] = []
  const learned: LearnedCorrection[] = []

  reviewed.forEach((item, index) => {
    const before = original[index]
    if (!before || !item.categoryId) return
    if (before.suggestedCategoryId === item.categoryId) return

    corrections.push({
      field: `items[${index}].categoryId`,
      original: before.suggestedCategoryId,
      corrected: item.categoryId,
    })
    learned.push({ itemName: item.name, categoryId: item.categoryId })
  })

  if (corrections.length === 0) return

  await repositories.receiptScans.recordCorrections(userId, scanId, corrections)

  const existing = await repositories.receiptScans.findHints(userId)
  await repositories.receiptScans.saveHints(userId, applyCorrections(existing, learned))
}
