'use client'

import { useEffect } from 'react'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/shared/components/ui/tooltip'
import { useAuthStore } from '@/shared/stores/auth.store'

/** Starts the Firebase auth listener once, for the whole app. */
function AuthListener() {
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => initialize(), [initialize])

  return null
}

/**
 * Google Identity Services, used only for Drive access tokens — sign-in itself still
 * runs through Firebase Auth.
 *
 * The provider is mounted unconditionally, even with no client id configured:
 * `useGoogleLogin` throws on render without this context, which would crash the
 * transaction form rather than showing the "Drive not configured" message. The hook
 * checks the config itself before it ever asks for a token.
 */
function GoogleAuth({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? 'not-configured'}>
      {children}
    </GoogleOAuthProvider>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <GoogleAuth>
        <TooltipProvider delayDuration={200}>
          <AuthListener />
          {children}
          <Toaster position="top-center" richColors closeButton />
        </TooltipProvider>
      </GoogleAuth>
    </ThemeProvider>
  )
}
