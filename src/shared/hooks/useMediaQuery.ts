'use client'

import { useEffect, useState } from 'react'

/**
 * Matches a CSS media query in JS. Starts `false` on the server and on first paint,
 * then corrects after mount — so a desktop dialog never flashes on a phone.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const list = window.matchMedia(query)
    setMatches(list.matches)

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Tailwind `lg` breakpoint — the point where the app switches to the desktop layout. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
