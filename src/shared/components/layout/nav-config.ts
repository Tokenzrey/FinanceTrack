import {
  ArrowLeftRight,
  BarChart3,
  CalendarSync,
  FileText,
  History,
  ScanLine,
  ShoppingBag,
  LayoutDashboard,
  Settings,
  Sliders,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Shown in the 5-slot mobile bottom bar. Everything else lives behind "Lainnya". */
  primary?: boolean
  shortcut?: string
}

/** Single source of truth for the sidebar, the bottom nav and the command palette. */
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dasbor', icon: LayoutDashboard, primary: true, shortcut: 'd' },
  { href: '/transactions', label: 'Transaksi', icon: ArrowLeftRight, primary: true, shortcut: 't' },
  { href: '/analytics', label: 'Analitik', icon: BarChart3, primary: true, shortcut: 'a' },
  { href: '/history', label: 'Riwayat', icon: History, primary: true, shortcut: 'h' },
  { href: '/goals', label: 'Target', icon: Target },
  { href: '/wishlist', label: 'Wishlist', icon: ShoppingBag, shortcut: 'w' },
  { href: '/net-worth', label: 'Kekayaan', icon: Wallet },
  { href: '/recurring', label: 'Berulang', icon: CalendarSync },
  { href: '/scan-history', label: 'Riwayat Scan', icon: ScanLine },
  { href: '/reports', label: 'Laporan', icon: FileText },
  { href: '/master-data', label: 'Master Data', icon: Sliders, shortcut: 'm' },
  { href: '/settings', label: 'Pengaturan', icon: Settings },
]

export const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((item) => item.primary)
