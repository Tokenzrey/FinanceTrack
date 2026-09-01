'use client'

import { Moon, Search, Sun, Wallet } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { useUIStore } from '@/shared/stores/ui.store'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // The server cannot know the resolved theme; render the icon only after hydration.
  useEffect(() => setMounted(true), [])

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Ganti tema"
    >
      {mounted && resolvedTheme === 'dark' ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  )
}

export function TopBar({ title }: { title?: string }) {
  const openCommandPalette = useUIStore((s) => s.openCommandPalette)

  return (
    <header className="glass sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 lg:h-16 lg:px-6">
      <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground lg:hidden">
        <Wallet className="size-4" aria-hidden />
      </span>

      {title && (
        <h1 className="truncate font-display text-base font-semibold lg:text-lg">{title}</h1>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={openCommandPalette}
          className="hidden gap-2 text-muted-foreground lg:flex"
        >
          <Search className="size-4" aria-hidden />
          Cari
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={openCommandPalette}
          className="lg:hidden"
          aria-label="Cari"
        >
          <Search className="size-4" />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-bold tracking-tight lg:text-2xl">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
