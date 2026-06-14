'use client'

import { useEffect, useState } from 'react'
import { Building2, Users, AlertTriangle, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { platformService } from '@/services/platform'
import { PlatformDashboardStats } from '@/types/platform'

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  variant = 'default',
}: {
  title: string
  value: number | string
  description: string
  icon: React.ElementType
  variant?: 'default' | 'warning' | 'danger'
}) {
  const iconClass =
    variant === 'danger'
      ? 'text-red-600 bg-red-100'
      : variant === 'warning'
      ? 'text-amber-600 bg-amber-100'
      : 'text-primary bg-primary/10'

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-2 rounded-xl ${iconClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-3xl font-bold text-foreground">{value}</p>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700',
  starter: 'bg-blue-100 text-blue-700',
  professional: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-orange-100 text-orange-700',
}

export default function PlatformDashboardPage() {
  const [stats, setStats] = useState<PlatformDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    platformService
      .getDashboard()
      .then(setStats)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-64" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-48 bg-muted rounded-xl" />
            <div className="h-48 bg-muted rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-red-700">
            Failed to load dashboard: {error}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of all tenants and platform health</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Total Tenants"
          value={stats.total_tenants}
          description="Active companies on platform"
          icon={Building2}
        />
        <StatCard
          title="Total Users"
          value={stats.total_users}
          description="Active app users across all tenants"
          icon={Users}
        />
        <StatCard
          title="Over-Limit Tenants"
          value={stats.over_limit_tenants}
          description="Tenants exceeding their user limit"
          icon={AlertTriangle}
          variant={stats.over_limit_tenants > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* Tenants by Plan & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-primary" />
              Tenants by Plan
            </CardTitle>
            <CardDescription>Distribution across subscription tiers</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(stats.tenants_by_plan).length === 0 ? (
              <p className="text-sm text-muted-foreground">No data available</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(stats.tenants_by_plan)
                  .sort(([, a], [, b]) => b - a)
                  .map(([plan, count]) => (
                    <div key={plan} className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                          PLAN_COLORS[plan] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {plan}
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{
                              width: `${Math.round((count / stats.total_tenants) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-foreground w-6 text-right">
                          {count}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* By Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-primary" />
              Tenants by Status
            </CardTitle>
            <CardDescription>Operational health of tenants</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(stats.tenants_by_status).length === 0 ? (
              <p className="text-sm text-muted-foreground">No data available</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(stats.tenants_by_status).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className={
                        status === 'active'
                          ? 'border-green-300 text-green-700 bg-green-50'
                          : status === 'suspended'
                          ? 'border-amber-300 text-amber-700 bg-amber-50'
                          : 'border-red-300 text-red-700 bg-red-50'
                      }
                    >
                      {status}
                    </Badge>
                    <span className="text-sm font-semibold text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Signups */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Signups</CardTitle>
          <CardDescription>Latest tenants to join the platform</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.recent_signups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent signups</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Company</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Plan</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_signups.map(signup => (
                    <tr key={signup.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-4 font-medium text-foreground">{signup.name}</td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                            PLAN_COLORS[signup.plan] || 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {signup.plan}
                        </span>
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {new Date(signup.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
