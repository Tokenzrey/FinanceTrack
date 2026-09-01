'use client'

import { useEffect, useState } from 'react'
import { Receipt, ScanLine } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { EmptyState, LoadingSkeleton } from '@/shared/components/finance/EmptyState'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { ReceiptViewerDialog, type ReceiptRef } from '@/shared/components/finance/ReceiptViewerDialog'
import { PageHeader } from '@/shared/components/layout/TopBar'
import { formatDay } from '@/shared/lib/format'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import { useScannerStore } from '@/shared/stores/receipt-scanner.store'
import type { ScanStatus } from '@/shared/types/receipt-scanner.types'
import { ScanDialog } from './ScanDialog'
import { ConfidenceBadge } from './components/ConfidenceBadge'
import { LazyDriveImage } from '@/shared/components/finance/LazyDriveImage'

const STATUS_LABEL: Record<ScanStatus, string> = {
  pending: 'Belum ditinjau',
  reviewed: 'Sudah ditinjau',
  saved: 'Tersimpan',
  discarded: 'Dibuang',
}

const STATUS_VARIANT: Record<ScanStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  reviewed: 'secondary',
  saved: 'default',
  discarded: 'destructive',
}

export function ScanHistoryPage() {
  const userId = useAuthStore((s) => s.user?.uid)
  const history = useScannerStore((s) => s.history)
  const loading = useScannerStore((s) => s.historyLoading)
  const loadHistory = useScannerStore((s) => s.loadHistory)
  const loadAll = useMasterDataStore((s) => s.loadAll)

  const [scanOpen, setScanOpen] = useState(false)
  const [viewingReceipt, setViewingReceipt] = useState<ReceiptRef | null>(null)

  useEffect(() => {
    if (!userId) return
    void loadAll()
    void loadHistory()
  }, [userId, loadAll, loadHistory])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Riwayat scan"
        description="Semua struk yang pernah dipindai AI."
        actions={
          <Button onClick={() => setScanOpen(true)} className="gap-2">
            <ScanLine className="size-4" aria-hidden />
            Scan struk
          </Button>
        }
      />

      {loading && history.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <LoadingSkeleton rows={4} />
          </CardContent>
        </Card>
      ) : history.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Belum ada scan"
          description="Foto struk belanjaanmu dan biarkan AI mencatatnya."
          actionLabel="Scan struk pertama"
          onAction={() => setScanOpen(true)}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {history.map((record) => {
            const { extraction, totalConfidence } = record.scanResult
            return (
              <li key={record.id}>
                <Card className="h-full">
                  <CardContent className="space-y-3 p-4">
                    <button
                      type="button"
                      onClick={() =>
                        setViewingReceipt({
                          gDriveFileId: record.gDriveFileId,
                          legacyUrl: record.gDriveFileId ? undefined : record.imageUrl,
                          driveViewLink: record.imageUrl,
                        })
                      }
                      className="group relative flex h-36 w-full items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground transition-all hover:ring-2 hover:ring-primary hover:ring-offset-2"
                      aria-label="Lihat gambar struk"
                    >
                      <LazyDriveImage
                        gDriveFileId={record.gDriveFileId}
                        legacyUrl={record.gDriveFileId ? undefined : record.imageUrl}
                        className="h-full w-full"
                        fallbackClassName="group-hover:text-foreground transition-colors"
                      />
                    </button>

                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {extraction.merchant ?? 'Tanpa nama toko'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDay(record.createdAt.toDate())} · {extraction.items.length} item
                        </p>
                        {extraction.items.length > 0 && (
                          <div className="mt-2 space-y-1 border-l-2 pl-2">
                            {extraction.items.slice(0, 2).map((item, idx) => (
                              <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                                <span className="truncate pr-2">{item.name}</span>
                                <span>{item.totalPrice.toLocaleString('id-ID')}</span>
                              </div>
                            ))}
                            {extraction.items.length > 2 && (
                              <p className="text-[10px] text-muted-foreground/70 italic">
                                + {extraction.items.length - 2} item lainnya...
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <ConfidenceBadge confidence={totalConfidence} />
                        {extraction.merchantType && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                            {extraction.merchantType}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <Badge variant={STATUS_VARIANT[record.status]}>
                        {STATUS_LABEL[record.status]}
                      </Badge>
                      <MoneyDisplay value={extraction.total} className="text-sm font-semibold" />
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <ScanDialog open={scanOpen} onOpenChange={setScanOpen} onSaved={() => void loadHistory()} />

      <ReceiptViewerDialog
        receipt={viewingReceipt}
        open={Boolean(viewingReceipt)}
        onOpenChange={(open) => !open && setViewingReceipt(null)}
      />
    </div>
  )
}
