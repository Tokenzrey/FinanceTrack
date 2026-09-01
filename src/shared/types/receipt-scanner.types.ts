import type { Timestamp } from 'firebase/firestore'
import type { Category, Pillar } from './domain'

export interface ExtractedReceiptItem {
  name: string
  quantity?: number | null
  unitPrice?: number | null
  totalPrice: number
  rawText?: string
}

export interface ReceiptExtraction {
  merchant: string | null
  merchantType: string | null
  /** ISO yyyy-MM-dd, or null when the receipt date could not be read. */
  date: string | null
  items: ExtractedReceiptItem[]
  subtotal: number | null
  tax: number | null
  serviceCharge: number | null
  discount: number | null
  total: number
  currency: 'IDR'
  /** 0–100. Normalised server-side; the model sometimes answers on a 0–1 scale. */
  confidence: number
  rawText: string
  language: 'id' | 'en' | 'mixed'
}

export interface MappedReceiptItem extends ExtractedReceiptItem {
  suggestedCategoryId: string | null
  suggestedCategoryName: string | null
  suggestedPillar: Pillar | null
  mappingConfidence: number
  mappingReason: string
  isManuallyMapped: boolean
}

export type ScanMode = 'single' | 'itemized'

export interface ReceiptScanResult {
  extraction: ReceiptExtraction
  mappedItems: MappedReceiptItem[]
  totalConfidence: number
  warnings: string[]
}

export type ScanStatus = 'pending' | 'reviewed' | 'saved' | 'discarded'

export interface UserCorrection {
  field: string
  original: unknown
  corrected: unknown
}

export interface ReceiptScanRecord {
  id: string
  /** Displayable image URL. Google Drive web link for new scans. */
  imageUrl: string
  /**
   * @deprecated Firebase Storage path, kept so pre-migration scans can still be deleted.
   * New scans store `gDriveFileId` instead.
   */
  imagePath: string
  gDriveFileId?: string
  scanResult: ReceiptScanResult
  status: ScanStatus
  savedTransactionIds: string[]
  userCorrections: UserCorrection[]
  createdAt: Timestamp
  reviewedAt?: Timestamp
}

/** Learned keyword → category preference, injected into later mapping prompts. */
export interface CategoryHint {
  keyword: string
  categoryId: string
  frequency: number
  updatedAt: number
}

export interface ScanReceiptApiRequest {
  imageBase64: string
  mimeType: string
  categories: Pick<Category, 'id' | 'name' | 'pillar'>[]
  hints: CategoryHint[]
}

export interface SaveScanAsTransactionsDTO {
  scanId: string
  mode: ScanMode
  date: Date
  singleTransaction?: {
    categoryId: string
    categoryItemId?: string
    description: string
    amount: number
  }
  itemTransactions?: {
    itemIndex: number
    categoryId: string
    categoryItemId?: string
    description: string
    amount: number
  }[]
}

/** Confidence bands used by the badges — green ≥80, yellow 50–79, red <50. */
export function confidenceBand(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 80) return 'high'
  if (confidence >= 50) return 'medium'
  return 'low'
}

/** Below this the image is almost certainly not a receipt. */
export const NOT_A_RECEIPT_THRESHOLD = 20
