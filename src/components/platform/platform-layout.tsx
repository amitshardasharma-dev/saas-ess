'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import {
  LayoutDashboard, Building2, CreditCard, Megaphone,
  ArrowLeft, Shield, LogOut,
} from 'lucide-react'

interface PlatformLayoutProps {
  children: React.ReactNode
}

const navItems = [
  { title: 'Dashboard', href: '/platform', icon: LayoutDashboard },
  { title: 'Tenants', href: '/platform/tenants', icon: Building2 },
  { title: 'Plans', href: '/platform/plans', icon: CreditCard },
  { title: 'Announcements', href: '/platform/announcements', icon: Megaphone },
]

export function PlatformLayout({ children }: PlatformLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout, checkAuth, isAuthenticated } = useAuthStore()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkAccess = async () => {
      setChecking(true)

      // First ensure auth state is loaded
      await checkAuth()

      // Then verify super admin via API
      try {
        const token = localStorage.getItem('ess_access_token')
        if (!token) {
          router.push('/login')
          return
        }
        const res = await fetch('/api/platform/dashboard', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          setIsSuperAdmin(true)
        } else {
          router.push('/dashboard')
        }
      } catch {
        router.push('/dashboard')
      } finally {
        setChecking(false)
      }
    }
    checkAccess()
  }, [])

  if (checking || !isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Verifying admin access...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-background/50 flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-red-100 rounded-xl">
              <Shield className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h2 className="font-bold text-sm">Platform Admin</h2>
              <p className="text-xs text-muted-foreground">Super Admin Panel</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => {
            const isActive = pathname === item.href ||
              (item.href !== '/platform' && pathname.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  'flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground'
                )}>
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium">{item.title}</span>
                </div>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="w-full justify-start">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Tenant
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={async () => { await logout(); router.push('/login') }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
          <div className="px-3 py-2 text-center text-xs text-muted-foreground">
            {user?.full_name || user?.email}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
