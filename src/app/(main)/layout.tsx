import { AppShell } from '@/shared/components/layout/AppShell'
import { AuthGuard } from '@/shared/components/layout/AuthGuard'
import { BottomNav } from '@/shared/components/layout/BottomNav'
import { Sidebar } from '@/shared/components/layout/Sidebar'
import { TopBar } from '@/shared/components/layout/TopBar'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          {/* Bottom padding clears the mobile tab bar. */}
          <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
        </div>
        <BottomNav />
        <AppShell />
      </div>
    </AuthGuard>
  )
}
