'use client'

import { useRef, useState } from 'react'
import { Camera, ImageUp, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'

interface ReceiptUploaderProps {
  /** Existing preview URL, when editing a saved transaction. */
  value?: string
  /** Google Drive view link, when the receipt already lives in Drive. */
  driveLink?: string
  /** Local file chosen but not yet uploaded — upload happens after the transaction has an id. */
  file: File | null
  onFileChange: (file: File | null) => void
  onRemoveExisting?: () => void
  uploading?: boolean
}

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

/**
 * Picks a receipt image. The file is held locally and uploaded by the caller once the
 * transaction exists, so the Storage path can be keyed by transaction id.
 */
export function ReceiptUploader({
  value,
  driveLink,
  file,
  onFileChange,
  onRemoveExisting,
  uploading = false,
}: ReceiptUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const accept = (candidate: File | undefined) => {
    if (!candidate) return
    if (!ALLOWED.includes(candidate.type)) {
      toast.error('Format gambar harus JPG, PNG, WEBP, atau HEIC')
      return
    }
    if (candidate.size > MAX_BYTES) {
      toast.error('Ukuran gambar maksimal 10 MB')
      return
    }
    onFileChange(candidate)
  }

  const preview = file ? URL.createObjectURL(file) : value

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium">Struk</span>

      {!file && driveLink && !value ? (
        <div className="flex items-center gap-2 rounded-xl border p-3">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            Struk tersimpan di Google Drive-mu.
          </p>
          <Button asChild variant="outline" size="sm">
            <a href={driveLink} target="_blank" rel="noreferrer">
              Buka
            </a>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => onRemoveExisting?.()}
            aria-label="Lepas struk"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : preview ? (
        <div className="relative overflow-hidden rounded-xl border">
          {/* Blob and Storage URLs are not in next.config images config, so use a plain img. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Pratinjau struk" className="max-h-48 w-full object-contain" />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="size-5 animate-spin" aria-label="Mengunggah" />
            </div>
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-2 top-2 size-7"
            onClick={() => {
              onFileChange(null)
              if (!file) onRemoveExisting?.()
            }}
            aria-label="Hapus struk"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            accept(event.dataTransfer.files[0])
          }}
          className={cn(
            'flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center',
            dragging && 'border-primary bg-primary/5',
          )}
        >
          <p className="text-xs text-muted-foreground">Seret gambar ke sini atau</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              <ImageUp className="mr-1.5 size-3.5" aria-hidden />
              Pilih file
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="sm:hidden"
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="mr-1.5 size-3.5" aria-hidden />
              Kamera
            </Button>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => accept(event.target.files?.[0])}
      />
      {/* `capture` opens the rear camera directly on mobile. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => accept(event.target.files?.[0])}
      />
    </div>
  )
}
