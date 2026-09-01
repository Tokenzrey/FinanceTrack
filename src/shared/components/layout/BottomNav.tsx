'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { NAV_ITEMS, PRIMARY_NAV_ITEMS } from './nav-config'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/components/ui/sheet'
import { useState } from 'react'

/** Mobile navigation: 4 primary tabs + "Lainnya". Hidden from `lg` up. */
export function BottomNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const secondary = NAV_ITEMS.filter((item) => !item.primary)

  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-40 border-t lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navigasi utama"
    >
      <ul className="grid grid-cols-5">
        {PRIMARY_NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          )
        })}

        <li>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="flex w-full flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground"
              aria-label="Menu lainnya"
            >
              <MoreHorizontal className="size-5" aria-hidden />
              Lainnya
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Menu lainnya</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-3 py-4">
                {secondary.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex flex-col items-center gap-2 rounded-2xl bg-muted/50 p-4 text-xs font-medium hover:bg-muted"
                  >
                    <item.icon className="size-5" aria-hidden />
                    {item.label}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  )
}
