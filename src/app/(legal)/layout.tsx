import Link from 'next/link'
import { ArrowLeft, Wallet } from 'lucide-react'

/**
 * Public, unauthenticated — About/Privacy/Terms need to be readable by someone who
 * hasn't signed in yet (or isn't going to). No AuthGuard, no Firestore calls, same
 * "lives entirely in this route" shape as `/share/report`.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Wallet className="size-4" aria-hidden />
            </span>
            <span className="font-display text-lg font-bold">FinTrack</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Beranda
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">{children}</main>

      <footer className="border-t py-6">
        <nav className="mx-auto flex max-w-3xl justify-center gap-6 px-4 text-xs text-muted-foreground">
          <Link href="/about" className="hover:text-foreground">
            Tentang
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Kebijakan Privasi
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Syarat &amp; Ketentuan
          </Link>
        </nav>
      </footer>
    </div>
  )
}
