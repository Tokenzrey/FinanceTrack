import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { ThemeToggle } from '@/shared/components/layout/TopBar'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center p-4">
      {/* Maximalist backdrop: two soft pillar-coloured glows behind the card. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-0 size-72 rounded-full bg-needs/20 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-72 rounded-full bg-savings/20 blur-3xl" />
      </div>

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Wallet className="size-5" aria-hidden />
          </span>
          <h1 className="font-display text-2xl font-bold">FinTrack</h1>
        </div>
        {children}

        <nav className="flex justify-center gap-4 text-xs text-muted-foreground">
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
      </div>
    </div>
  )
}
