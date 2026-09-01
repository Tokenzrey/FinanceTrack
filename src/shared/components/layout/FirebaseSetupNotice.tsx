import { KeyRound } from 'lucide-react'

/**
 * Shown when `.env.local` still has empty Firebase keys — without this the app
 * would throw an opaque Firebase error on first render instead of saying what is missing.
 */
export function FirebaseSetupNotice() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md space-y-4 rounded-2xl border p-6">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-warning/15 text-warning">
          <KeyRound className="size-5" aria-hidden />
        </span>
        <div className="space-y-1">
          <h1 className="font-display text-lg font-bold">Firebase belum dikonfigurasi</h1>
          <p className="text-sm text-muted-foreground">
            Isi kredensial Firebase di <code className="font-mono text-xs">.env.local</code>, lalu
            jalankan ulang server pengembangan.
          </p>
        </div>
        <ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
          <li>
            Buat project di{' '}
            <a
              className="text-primary underline"
              href="https://console.firebase.google.com"
              target="_blank"
              rel="noreferrer"
            >
              Firebase Console
            </a>
          </li>
          <li>Aktifkan Authentication (Email/Password + Google), Firestore, dan Storage</li>
          <li>
            Salin konfigurasi Web App ke <code className="font-mono text-xs">.env.local</code>
          </li>
        </ol>
      </div>
    </div>
  )
}
