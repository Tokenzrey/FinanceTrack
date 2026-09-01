'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Loader2, Minus, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { fetchDriveFileUrl } from '@/shared/lib/gdrive'
import { useGoogleDrive } from '@/shared/hooks/useGoogleDrive'

export interface ReceiptRef {
  /** Google Drive file id — fetched through an authenticated request, then cached as an object URL. */
  gDriveFileId?: string
  /** Pre-migration Firebase Storage URL — already a direct, publicly-fetchable image URL. */
  legacyUrl?: string
  /** Drive's own viewer page — opened externally, never used as an `<img src>` (it's HTML, not image bytes). */
  driveViewLink?: string
}

const MIN_SCALE = 1
const MAX_SCALE = 4

/**
 * Shows a receipt image with zoom (wheel or +/-) and pan (drag once zoomed).
 *
 * Drive's `webViewLink` is an HTML page, not an image resource, so it can never be an
 * `<img src>` — this is precisely the bug that made every post-migration receipt preview
 * render as a broken image. A Drive-hosted receipt is fetched once with the Authorization
 * header via `fetchDriveFileUrl`, turned into a local object URL, and cached for the life
 * of the dialog. A pre-migration receipt's `legacyUrl` is already a real image URL and is
 * used directly — no fetch needed.
 */
export function ReceiptViewerDialog({
  receipt,
  open,
  onOpenChange,
}: {
  receipt: ReceiptRef | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { executeWithToken } = useGoogleDrive()
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  )

  useEffect(() => {
    if (!open || !receipt) return

    setScale(1)
    setPos({ x: 0, y: 0 })
    setError(null)
    setSrc(null)

    // Revoked only here, on unmount/receipt-change — never on this effect's own `src`
    // update, or the object URL dies before the <img> finishes loading it (broken-image
    // icon every time: a `[src]`-keyed cleanup elsewhere used to revoke the ref's *current*
    // value, which by then was already this same freshly-created URL).
    let cancelled = false
    let createdUrl: string | null = null

    if (receipt.gDriveFileId) {
      setLoading(true)
      executeWithToken((token) => fetchDriveFileUrl(receipt.gDriveFileId!, token))
        .then((url) => {
          if (cancelled) {
            URL.revokeObjectURL(url)
            return
          }
          createdUrl = url
          setSrc(url)
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat gambar struk')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    } else if (receipt.legacyUrl) {
      setSrc(receipt.legacyUrl)
    } else {
      setError('Tidak ada gambar struk yang tersimpan.')
    }

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [open, receipt, executeWithToken])

  const zoomBy = (delta: number) => setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta)))

  const resetView = () => {
    setScale(1)
    setPos({ x: 0, y: 0 })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Struk</DialogTitle>
        </DialogHeader>

        <div
          className="relative flex h-[60dvh] items-center justify-center overflow-hidden rounded-xl bg-muted"
          onWheel={(event) => {
            if (!src) return
            event.preventDefault()
            zoomBy(event.deltaY < 0 ? 0.25 : -0.25)
          }}
        >
          {loading && <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Memuat" />}

          {error && !loading && (
            <p className="max-w-xs px-4 text-center text-sm text-muted-foreground">{error}</p>
          )}

          {src && !loading && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt="Struk"
              draggable={false}
              onMouseDown={(event) => {
                if (scale <= 1) return
                dragRef.current = {
                  startX: event.clientX,
                  startY: event.clientY,
                  origX: pos.x,
                  origY: pos.y,
                }
              }}
              onMouseMove={(event) => {
                if (!dragRef.current) return
                const dx = event.clientX - dragRef.current.startX
                const dy = event.clientY - dragRef.current.startY
                setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy })
              }}
              onMouseUp={() => {
                dragRef.current = null
              }}
              onMouseLeave={() => {
                dragRef.current = null
              }}
              onDoubleClick={() => (scale > 1 ? resetView() : setScale(2))}
              className="max-h-full max-w-full select-none object-contain"
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
                cursor: scale > 1 ? 'grab' : 'zoom-in',
                transition: dragRef.current ? 'none' : 'transform 0.15s ease-out',
              }}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={!src || scale <= MIN_SCALE}
              onClick={() => zoomBy(-0.5)}
              aria-label="Perkecil"
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="tabular w-12 text-center text-xs text-muted-foreground">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={!src || scale >= MAX_SCALE}
              onClick={() => zoomBy(0.5)}
              aria-label="Perbesar"
            >
              <Plus className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={!src || scale === 1}
              onClick={resetView}
              aria-label="Reset tampilan"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </div>

          {receipt?.driveViewLink && (
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <a href={receipt.driveViewLink} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" aria-hidden />
                Buka di Drive
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
