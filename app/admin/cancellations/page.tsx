'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { CancellationsTable } from '@/components/admin/cancellations-table'
import { IconX, IconClock, IconTrendingDown } from '@tabler/icons-react'
import { useAuth } from '@/hooks/use-auth'
import type { BookingWithDetails } from '@/types/booking'

interface CancellationStats {
  total: number
  today: number
  week: number
  month: number
}

interface Cancellation {
  id: string
  status: string
  booked_at: string
  cancelled_at: string | null
  cancellation_reason: string | null
  user: {
    id: string
    full_name: string
    email: string
    phone: string | null
  }
  schedule: {
    id: string
    start_datetime: string
    end_datetime: string
    class: {
      title: string
      coach: string
      location: string
    }
  }
  subscription?: {
    id: string
    plan: {
      name: string
    }
  } | null
}

export default function CancellationsPage() {
  const [cancellations, setCancellations] = useState<BookingWithDetails[]>([])
  const [stats, setStats] = useState<CancellationStats>({ total: 0, today: 0, week: 0, month: 0 })
  const [topReasons, setTopReasons] = useState<[string, number][]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const fetchCancellations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('class_bookings')
        .select(`
          id,
          status,
          booked_at,
          cancelled_at,
          cancellation_reason,
          user:profiles!user_id (
            id,
            full_name,
            email,
            phone
          ),
          schedule:class_schedules!schedule_id (
            id,
            start_datetime,
            end_datetime,
            class:classes!class_id (
              title,
              coach,
              location
            )
          ),
          subscription:user_subscriptions!subscription_id (
            id,
            plan:subscription_plans!plan_id (
              name
            )
          )
        `)
        .eq('status', 'cancelled')
        .order('cancelled_at', { ascending: false })

      if (error) throw error
      setCancellations((data || []) as unknown as BookingWithDetails[])
    } catch (err) {
      console.error('Error fetching cancellations:', err)
      setError('Erreur lors du chargement des annulations')
    }
  }, [supabase])

  const fetchStats = useCallback(async () => {
    try {
      const today = new Date()
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

      const [
        { count: totalCancellations },
        { count: todayCancellations },
        { count: weekCancellations },
        { count: monthCancellations }
      ] = await Promise.all([
        supabase.from('class_bookings').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
        supabase.from('class_bookings').select('*', { count: 'exact', head: true })
          .eq('status', 'cancelled')
          .gte('cancelled_at', today.toISOString().split('T')[0]),
        supabase.from('class_bookings').select('*', { count: 'exact', head: true })
          .eq('status', 'cancelled')
          .gte('cancelled_at', weekAgo.toISOString()),
        supabase.from('class_bookings').select('*', { count: 'exact', head: true })
          .eq('status', 'cancelled')
          .gte('cancelled_at', monthAgo.toISOString())
      ])

      setStats({
        total: totalCancellations || 0,
        today: todayCancellations || 0,
        week: weekCancellations || 0,
        month: monthCancellations || 0
      })
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }, [supabase])

  const fetchReasons = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('class_bookings')
        .select('cancellation_reason')
        .eq('status', 'cancelled')
        .not('cancellation_reason', 'is', null)

      if (error) throw error

      const reasons = (data || []).map(item => item.cancellation_reason).filter(Boolean)
      const reasonCounts = reasons.reduce((acc, reason) => {
        acc[reason] = (acc[reason] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      const sortedReasons = Object.entries(reasonCounts)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5) as [string, number][]

      setTopReasons(sortedReasons)
    } catch (err) {
      console.error('Error fetching cancellation reasons:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const checkAdminAccess = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user!.id)
        .single()

      if (profile?.role !== 'admin') {
        router.push('/')
        return
      }

      await Promise.all([fetchCancellations(), fetchStats(), fetchReasons()])
    } catch (err) {
      console.error('Error checking admin access:', err)
      router.push('/')
    }
  }, [user, router, supabase, fetchCancellations, fetchStats, fetchReasons])

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.push('/login')
      return
    }

    checkAdminAccess()
  }, [user, authLoading, router, checkAdminAccess])

  if (authLoading || loading) {
    return (
      <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Annulations</h1>
            <p className="text-muted-foreground mt-2">
              Suivi des annulations de réservations et analyse des tendances
            </p>
          </div>
        </div>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Chargement des annulations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Annulations</h1>
          <p className="text-muted-foreground mt-2">
            Suivi des annulations de réservations et analyse des tendances
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Annulations</CardTitle>
            <IconX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aujourd'hui</CardTitle>
            <IconClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.today}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cette semaine</CardTitle>
            <IconTrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.week}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ce mois</CardTitle>
            <IconTrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.month}</div>
          </CardContent>
        </Card>
      </div>

      {/* Top Cancellation Reasons */}
      {topReasons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Principales Raisons d'Annulation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topReasons.map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between">
                  <span className="text-sm">{reason}</span>
                  <Badge variant="outline">{count} fois</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancellations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Toutes les Annulations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <CancellationsTable cancellations={cancellations} />
        </CardContent>
      </Card>
    </div>
  )
}