'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Moon, Plus, ScanLine, Sun } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/shared/components/ui/command'
import { NAV_ITEMS } from './nav-config'
import { useUIStore } from '@/shared/stores/ui.store'

interface CommandPaletteProps {
  onNewTransaction: () => void
  onScanReceipt: () => void
}

/**
 * Cmd/Ctrl+K palette, plus the single-key shortcuts from the plan.
 *
 * Single-key shortcuts are ignored while the user is typing in a field — otherwise
 * writing "dana darurat" in a description would fire the dashboard shortcut on the "d".
 */
export function CommandPalette({ onNewTransaction, onScanReceipt }: CommandPaletteProps) {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()

  const open = useUIStore((s) => s.commandPaletteOpen)
  const openPalette = useUIStore((s) => s.openCommandPalette)
  const closePalette = useUIStore((s) => s.closeCommandPalette)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const element = target as HTMLElement | null
      if (!element) return false
      const tag = element.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey

      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (open) closePalette()
        else openPalette()
        return
      }

      if (meta && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggleSidebar()
        return
      }

      if (meta || event.altKey || open || isTyping(event.target)) return

      const shortcut = NAV_ITEMS.find((item) => item.shortcut === event.key.toLowerCase())
      if (shortcut) {
        event.preventDefault()
        router.push(shortcut.href)
        return
      }

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        onNewTransaction()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, openPalette, closePalette, toggleSidebar, router, onNewTransaction])

  const run = (action: () => void) => {
    closePalette()
    action()
  }

  return (
    <CommandDialog open={open} onOpenChange={(next) => (next ? openPalette() : closePalette())}>
      <CommandInput placeholder="Cari halaman atau aksi…" />
      <CommandList>
        <CommandEmpty>Tidak ada hasil.</CommandEmpty>

        <CommandGroup heading="Aksi">
          <CommandItem onSelect={() => run(onNewTransaction)}>
            <Plus className="mr-2 size-4" aria-hidden />
            Transaksi baru
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(onScanReceipt)}>
            <ScanLine className="mr-2 size-4" aria-hidden />
            Scan struk
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="mr-2 size-4" aria-hidden />
            ) : (
              <Moon className="mr-2 size-4" aria-hidden />
            )}
            Ganti tema
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Halaman">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.href} onSelect={() => run(() => router.push(item.href))}>
              <item.icon className="mr-2 size-4" aria-hidden />
              {item.label}
              {item.shortcut && <CommandShortcut>{item.shortcut.toUpperCase()}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
