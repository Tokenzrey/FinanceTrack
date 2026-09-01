import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Sora } from 'next/font/google'
import { Providers } from '@/shared/components/providers'
import { SITE_URL } from '@/shared/lib/site'
import './globals.css'

const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' })
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

const DESCRIPTION =
  'Kelola anggaran bulanan, catat transaksi, scan struk dengan AI, dan pantau kesehatan keuangan pribadi dalam Rupiah — data tersimpan di akun Firebase dan Google Drive milikmu sendiri.'

export const metadata: Metadata = {
  // Required for Next.js to resolve relative OG/Twitter image URLs (the
  // opengraph-image.tsx convention below) into absolute ones.
  metadataBase: new URL(SITE_URL),
  title: { default: 'FinTrack — Pelacak Keuangan Pribadi', template: '%s · FinTrack' },
  description: DESCRIPTION,
  applicationName: 'FinTrack',
  manifest: '/manifest.webmanifest',
  keywords: [
    'aplikasi keuangan pribadi',
    'aplikasi anggaran bulanan',
    'pencatat pengeluaran',
    'budgeting Indonesia',
    'pelacak keuangan pribadi',
    'aplikasi budget Rupiah',
    'catat transaksi',
    'scan struk AI',
  ],
  // Site-wide default: public marketing/legal pages get indexed. Pages that need the
  // opposite (private app routes, per-user shared reports) set their own `robots`
  // override in their own metadata — this is only the fallback.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: SITE_URL,
    siteName: 'FinTrack',
    title: 'FinTrack — Pelacak Keuangan Pribadi',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FinTrack — Pelacak Keuangan Pribadi',
    description: DESCRIPTION,
  },
  // Google Search Console ownership verification. Two codes from two verification
  // attempts — both render as separate <meta> tags, harmless to keep both.
  verification: {
    google: ['ueKE3s_BLDs_RMZPhUfPDzM6IWyszy23VCh5CMBqZlw', '2-6o4_9vdDKMXLn26rxFO24XQ1J7y3e1Fx58D2SwOqs'],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0F172A' },
  ],
  width: 'device-width',
  initialScale: 1,
  // The app has bottom-anchored navigation; let it sit under the home indicator.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="id"
      className={`${sora.variable} ${inter.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
