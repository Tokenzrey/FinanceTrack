'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

/**
 * Route-level error boundary for the protected pages.
 *
 * Without it, one thrown render — a malformed Firestore document, a chart handed NaN —
 * blanks the whole app with React's default screen and no way back.
 */
export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard render error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 rounded-2xl border p-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-exceeded/15 text-exceeded">
          <AlertTriangle className="size-6" aria-hidden />
        </span>

        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold">Ada yang bermasalah di halaman ini</h2>
          <p className="text-sm text-muted-foreground">
            Datamu aman — yang gagal hanya tampilan halaman ini.
          </p>
        </div>

        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground">Kode: {error.digest}</p>
        )}

        <Button onClick={reset} className="gap-2">
          <RotateCcw className="size-4" aria-hidden />
          Coba muat ulang
        </Button>
      </div>
    </div>
  )
}
