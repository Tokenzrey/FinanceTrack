import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'FinTrack — Pelacak Keuangan Pribadi'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Default social-share image for every page that doesn't define its own — Next.js
 * picks this up automatically for `openGraph`/`twitter` metadata via the file
 * convention, no manual `images` array needed anywhere.
 */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0F172A',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 28,
              background: '#14B8A6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 52,
            }}
          >
            💰
          </div>
          <div style={{ fontSize: 76, fontWeight: 700, color: '#ffffff' }}>FinTrack</div>
        </div>
        <div style={{ fontSize: 32, marginTop: 28, color: '#94A3B8' }}>
          Pelacak Keuangan Pribadi
        </div>
      </div>
    ),
    { ...size },
  )
}
