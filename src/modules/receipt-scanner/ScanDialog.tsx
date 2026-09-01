'use client'

import { useRef, useState } from 'react'
import { Camera, ImageUp, RotateCcw, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/shared/components/ui/drawer'
import { useIsDesktop } from '@/shared/hooks/useMediaQuery'
import { useGoogleDrive } from '@/shared/hooks/useGoogleDrive'
import { useScannerStore } from '@/shared/stores/receipt-scanner.store'
import { ReceiptReviewDrawer } from './components/ReceiptReviewDrawer'
import { ScanProgressOverlay } from './components/ScanProgressOverlay'

interface ScanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (count: number) => void
}

function ScanBody({ onOpenChange, onSaved }: Omit<ScanDialogProps, 'open'>) {
  const phase = useScannerStore((s) => s.phase)
  const stage = useScannerStore((s) => s.stage)
  const record = useScannerStore((s) => s.record)
  const error = useScannerStore((s) => s.error)
  const salvagedImageUrl = useScannerStore((s) => s.salvagedImageUrl)
  const scan = useScannerStore((s) => s.scan)
  const reset = useScannerStore((s) => s.reset)
  const { executeWithToken, hasToken } = useGoogleDrive()

  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const handleStartPick = async (ref: React.RefObject<HTMLInputElement>) => {
    try {
      if (!hasToken) {
        // Pre-authorise during the click gesture so the browser does not block the popup.
        await executeWithToken(async () => {})
      }
      ref.current?.click()
    } catch (error) {
      // User closed or declined the Drive permission window.
      toast.error(error instanceof Error ? error.message : 'Izin Google Drive diperlukan')
    }
  }

  const pick = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Pilih berkas gambar')
      return
    }
    setPreview(URL.createObjectURL(file))
    void scan(file, executeWithToken)
  }

  if (phase === 'scanning') {
    return (
      <div className="space-y-4">
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Struk yang sedang dipindai"
            className="max-h-40 w-full rounded-xl object-contain"
          />
        )}
        <ScanProgressOverlay stage={stage} />
      </div>
    )
  }

  if (phase === 'reviewing' && record) {
    return (
      <ReceiptReviewDrawer
        record={record}
        onSaved={(count) => {
          toast.success(`${count} transaksi tersimpan dari struk`)
          onSaved?.(count)
          onOpenChange(false)
        }}
      />
    )
  }

  if (phase === 'failed') {
    return (
      <div className="space-y-4">
        {salvagedImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={salvagedImageUrl}
            alt="Struk yang gagal dipindai"
            className="max-h-40 w-full rounded-xl object-contain"
          />
        )}
        <p className="text-sm">{error}</p>
        {salvagedImageUrl && (
          <p className="text-xs text-muted-foreground">
            Gambar sudah tersimpan, jadi kamu tidak perlu memotret ulang.
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset} className="flex-1 gap-2">
            <RotateCcw className="size-4" aria-hidden />
            Coba lagi
          </Button>
          <Button onClick={() => onOpenChange(false)} className="flex-1">
            Input manual
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-4 py-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ScanLine className="size-6" aria-hidden />
        </span>
        <p className="text-sm font-medium">Foto atau unggah struk</p>
        <p className="text-xs text-muted-foreground">
          AI akan membaca merchant, tanggal, item, dan total. Satu struk per foto.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Button onClick={() => void handleStartPick(cameraRef)} className="gap-2">
            <Camera className="size-4" aria-hidden />
            Ambil foto
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleStartPick(fileRef)}
            className="gap-2"
          >
            <ImageUp className="size-4" aria-hidden />
            Pilih file
          </Button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => pick(event.target.files?.[0])}
      />
      {/* `capture` opens the rear camera directly on a phone. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => pick(event.target.files?.[0])}
      />
    </div>
  )
}

/** Scanner entry point. Dialog on desktop, bottom sheet on mobile. */
export function ScanDialog({ open, onOpenChange, onSaved }: ScanDialogProps) {
  const isDesktop = useIsDesktop()
  const reset = useScannerStore((s) => s.reset)

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const title = 'Scan struk'
  const description = 'Ubah foto struk jadi transaksi dengan bantuan AI.'
  const body = open ? <ScanBody onOpenChange={handleOpenChange} onSaved={onSaved} /> : null

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-8">{body}</div>
      </DrawerContent>
    </Drawer>
  )
}
