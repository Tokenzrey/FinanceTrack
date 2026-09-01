'use client'

import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Loader2 } from 'lucide-react'
import { useGoogleDrive } from '@/shared/hooks/useGoogleDrive'
import { fetchDriveFileUrl } from '@/shared/lib/gdrive'
import { cn } from '@/shared/lib/utils'

interface LazyDriveImageProps {
  gDriveFileId?: string
  legacyUrl?: string
  alt?: string
  className?: string
  fallbackClassName?: string
}

export function LazyDriveImage({
  gDriveFileId,
  legacyUrl,
  alt = 'Image',
  className,
  fallbackClassName,
}: LazyDriveImageProps) {
  const { executeWithToken } = useGoogleDrive()
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<boolean>(false)
  const [isVisible, setIsVisible] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '50px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isVisible) return

    if (legacyUrl) {
      setSrc(legacyUrl)
      return
    }

    if (!gDriveFileId) {
      setError(true)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    setLoading(true)
    executeWithToken((token) => fetchDriveFileUrl(gDriveFileId, token))
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        objectUrl = url
        setSrc(url)
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load drive image:', err)
          setError(true)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [isVisible, gDriveFileId, legacyUrl, executeWithToken])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-muted',
        className
      )}
    >
      {src && !error ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className={cn('flex items-center justify-center text-muted-foreground', fallbackClassName)}>
          {loading ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <ImageIcon className="size-8 opacity-50" />
          )}
        </div>
      )}
    </div>
  )
}
