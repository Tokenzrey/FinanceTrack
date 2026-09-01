'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, LogOut, PanelLeft, Wallet } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip'
import { cn } from '@/shared/lib/utils'
import { formatMonthLong } from '@/shared/lib/format'
import { NAV_ITEMS } from './nav-config'
import { useUIStore } from '@/shared/stores/ui.store'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useBudgetStore } from '@/shared/stores/budget.store'

/** Desktop navigation: 240px expanded, 64px collapsed. Hidden below `lg`. */
export function Sidebar() {
  const pathname = usePathname()
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)
  const { year, month } = useBudgetStore((s) => s.activePeriod)

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r bg-card/60 backdrop-blur-sm transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-dvh',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="flex h-16 items-center gap-2 border-b px-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Wallet className="size-4" aria-hidden />
        </span>
        {!collapsed && <span className="font-display text-lg font-bold">FinTrack</span>}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-8"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Buka sidebar' : 'Tutup sidebar'}
        >
          {collapsed ? <PanelLeft className="size-4" /> : <ChevronLeft className="size-4" />}
        </Button>
      </div>

      {!collapsed && (
        <div className="px-4 py-3">
          <span className="inline-flex rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {formatMonthLong(year, month)}
          </span>
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="Navigasi utama">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href)
          const link = (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                collapsed && 'justify-center px-0',
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )

          // Collapsed rail shows labels on hover instead of dropping them entirely.
          return collapsed ? (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ) : (
            link
          )
        })}
      </nav>

      <div className="border-t p-2">
        <div
          className={cn('flex items-center gap-2 px-2 py-2', collapsed && 'justify-center px-0')}
        >
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.displayName ?? 'Pengguna'}</p>
              <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => void signOut()}
            aria-label="Keluar"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
