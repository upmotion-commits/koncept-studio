import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import AdminRouteGuard from '@/components/admin/admin-route-guard'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AdminRouteGuard>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AdminSidebar />
          <main className="flex-1 min-w-0 overflow-x-hidden">
            <div className="sticky top-0 z-40 bg-background border-b md:hidden p-3">
              <SidebarTrigger className="h-11 w-11" />
            </div>
            {children}
          </main>
        </div>
      </SidebarProvider>
    </AdminRouteGuard>
  )
}