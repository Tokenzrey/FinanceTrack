'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { isFirebaseConfigured } from '@/shared/lib/firebase'
import { isGoogleDriveConfigured, useGoogleDrive } from '@/shared/hooks/useGoogleDrive'
import { useAuthStore } from '@/shared/stores/auth.store'
import { FirebaseSetupNotice } from './FirebaseSetupNotice'

/**
 * Client-side route guard.
 *
 * Firebase Auth keeps its session in IndexedDB, which `middleware.ts` cannot read,
 * so the gate lives here. It hides content until auth resolves — never renders a
 * protected page for an unauthenticated visitor, it just cannot block the request itself.
 * Firestore rules remain the real access boundary.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const isLoading = useAuthStore((s) => s.isLoading)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const profile = useAuthStore((s) => s.profile)
  const { checkLinkStatus } = useGoogleDrive()

  useEffect(() => {
    if (isLoading || !isFirebaseConfigured) return

    if (!isAuthenticated) {
      router.replace('/login')
      return
    }

    if (profile && !profile.onboardingCompleted) {
      router.replace('/onboarding')
    }
  }, [isLoading, isAuthenticated, profile, router])

  // Learn the Drive-link status in the background as soon as a session resolves — not
  // inside whatever click first needs Drive. A click handler that has to await this
  // first, then open the popup, risks losing the "recent user gesture" some browsers
  // require to allow a popup at all; knowing the answer ahead of time lets `getToken()`
  // skip straight to the popup instead.
  useEffect(() => {
    if (!isAuthenticated || !isGoogleDriveConfigured) return
    void checkLinkStatus()
  }, [isAuthenticated, checkLinkStatus])

  if (!isFirebaseConfigured) return <FirebaseSetupNotice />

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy>
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Memuat" />
      </div>
    )
  }

  return <>{children}</>
}
