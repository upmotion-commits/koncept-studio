'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  IconCalendarStats,
  IconClock,
  IconX,
  IconRefresh,
  IconDownload,
  IconSearch,
  IconCheck,
  IconUser,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconUserPlus
} from '@tabler/icons-react'
import { useAuth } from '@/hooks/use-auth'
import { format, parseISO, startOfDay, endOfDay, isWithinInterval } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { AdminBookingView } from '@/components/admin/booking/admin-booking-view'
import { flagNoShow, unflagNoShow } from './actions'

interface BookingStats {
  total: number
  confirmed: number
  cancelled: number
  today: number
}

interface Booking {
  id: string
  status: string
  booked_at: string
  cancelled_at: string | null
  cancellation_reason: string | null
  profiles: {
    id: string
    full_name: string
    email: string
    phone: string | null
  }
  class_schedules: {
    id: string
    start_datetime: string
    end_datetime: string
    classes: {
      title: string
      coach: string
      location: string
    }
  }
  user_subscriptions?: {
    id: string
    subscription_plans: {
      name: string
    }
  } | null
}

interface GroupedBooking {
  classTitle: string
  startDatetime: string
  endDatetime: string
  coach: string
  location: string
  bookings: Booking[]
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([])
  const [stats, setStats] = useState<BookingStats>({ total: 0, confirmed: 0, cancelled: 0, today: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  // Filter states
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0)
  const pageSize = 10

  const fetchBookings = useCallback(async (showToast = false) => {
    try {
      setLoading(true)
      setError('')

      const { data, error } = await supabase
        .from('class_bookings')
        .select(`
          id,
          status,
          booked_at,
          cancelled_at,
          cancellation_reason,
          profiles!user_id (
            id,
            full_name,
            email,
            phone
          ),
          class_schedules!schedule_id (
            id,
            start_datetime,
            end_datetime,
            classes!class_id (
              title,
              coach,
              location
            )
          ),
          user_subscriptions!subscription_id (
            id,
            subscription_plans!plan_id (
              name
            )
          )
        `)
        .order('booked_at', { ascending: false })

      if (error) throw error

      const bookingsData = (data || []) as unknown as Booking[]
      setBookings(bookingsData)
      setFilteredBookings(bookingsData)

      if (showToast) {
        toast.success('Réservations actualisées')
      }
    } catch (err) {
      console.error('Error fetching bookings:', err)
      setError('Erreur lors du chargement des réservations')
      toast.error('Erreur lors du chargement des réservations')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const handleFlagNoShow = async (bookingId: string) => {
    const result = await flagNoShow(bookingId)
    if (!result.success) {
      toast.error('Absence non enregistrée', { description: result.error })
      return
    }
    toast.success('Absence enregistrée', {
      description: 'Le membre ne pourra pas réserver pendant 24h.'
    })
    fetchBookings()
  }

  const handleUnflagNoShow = async (bookingId: string) => {
    const result = await unflagNoShow(bookingId)
    if (!result.success) {
      toast.error("Absence non retirée", { description: result.error })
      return
    }
    toast.success('Absence retirée', { description: 'La pénalité a été supprimée.' })
    fetchBookings()
  }

  const fetchStats = useCallback(async () => {
    try {
      const today = new Date()
      const todayStart = startOfDay(today).toISOString()
      const todayEnd = endOfDay(today).toISOString()

      const [
        { count: totalBookings },
        { count: confirmedBookings },
        { count: cancelledBookings },
        { count: todayBookings }
      ] = await Promise.all([
        supabase.from('class_bookings').select('*', { count: 'exact', head: true }),
        supabase.from('class_bookings').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
        supabase.from('class_bookings').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
        supabase.from('class_bookings').select('*', { count: 'exact', head: true })
          .gte('booked_at', todayStart)
          .lte('booked_at', todayEnd)
      ])

      setStats({
        total: totalBookings || 0,
        confirmed: confirmedBookings || 0,
        cancelled: cancelledBookings || 0,
        today: todayBookings || 0
      })
    } catch (err) {
      console.error('Error fetching stats:', err)
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

      await Promise.all([fetchBookings(), fetchStats()])
    } catch (err) {
      console.error('Error checking admin access:', err)
      router.push('/')
    }
  }, [user, router, supabase, fetchBookings, fetchStats])

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.push('/login')
      return
    }

    checkAdminAccess()
  }, [user, authLoading, router, checkAdminAccess])

  // Apply filters
  useEffect(() => {
    let filtered = [...bookings]

    // Search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(booking =>
        booking.profiles?.full_name?.toLowerCase().includes(searchLower) ||
        booking.profiles?.email?.toLowerCase().includes(searchLower) ||
        booking.class_schedules?.classes?.title?.toLowerCase().includes(searchLower)
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(booking => booking.status === statusFilter)
    }

    // Class filter
    if (classFilter !== 'all') {
      filtered = filtered.filter(booking =>
        booking.class_schedules?.classes?.title === classFilter
      )
    }

    // Date filter
    if (dateFilter) {
      const selectedDate = parseISO(dateFilter)
      const dayStart = startOfDay(selectedDate)
      const dayEnd = endOfDay(selectedDate)

      filtered = filtered.filter(booking => {
        const bookingDate = parseISO(booking.class_schedules?.start_datetime)
        return isWithinInterval(bookingDate, { start: dayStart, end: dayEnd })
      })
    }

    setFilteredBookings(filtered)
    setCurrentPage(0) // Reset to first page when filters change
  }, [bookings, searchTerm, statusFilter, classFilter, dateFilter])

  const handleRefresh = () => {
    fetchBookings(true)
    fetchStats()
  }

  const handleExport = () => {
    try {
      const exportData = filteredBookings.map(booking => ({
        'Client': booking.profiles?.full_name || '',
        'Email': booking.profiles?.email || '',
        'Téléphone': booking.profiles?.phone || '',
        'Cours': booking.class_schedules?.classes?.title || '',
        'Coach': booking.class_schedules?.classes?.coach || '',
        'Date/Heure': format(parseISO(booking.class_schedules?.start_datetime), 'dd/MM/yyyy HH:mm', { locale: fr }),
        'Lieu': booking.class_schedules?.classes?.location || '',
        'Statut': booking.status === 'confirmed' ? 'Confirmé' : booking.status === 'cancelled' ? 'Annulé' : booking.status,
        'Abonnement': booking.user_subscriptions?.subscription_plans?.name || '',
        'Réservé le': format(parseISO(booking.booked_at), 'dd/MM/yyyy HH:mm', { locale: fr })
      }))

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Réservations')

      const fileName = `reservations-${format(new Date(), 'yyyy-MM-dd')}.xlsx`
      XLSX.writeFile(wb, fileName)

      toast.success('Export réussi')
    } catch (err) {
      console.error('Error exporting:', err)
      toast.error('Erreur lors de l\'export')
    }
  }

  const getUniqueClasses = () => {
    const classes = new Set<string>()
    bookings.forEach(booking => {
      if (booking.class_schedules?.classes?.title) {
        classes.add(booking.class_schedules.classes.title)
      }
    })
    return Array.from(classes).sort()
  }

  // Group bookings by class and datetime
  const getGroupedBookings = (): GroupedBooking[] => {
    const grouped = new Map<string, GroupedBooking>()

    filteredBookings.forEach(booking => {
      if (!booking.class_schedules) return

      const key = `${booking.class_schedules.classes.title}-${booking.class_schedules.start_datetime}`

      if (!grouped.has(key)) {
        grouped.set(key, {
          classTitle: booking.class_schedules.classes.title,
          startDatetime: booking.class_schedules.start_datetime,
          endDatetime: booking.class_schedules.end_datetime,
          coach: booking.class_schedules.classes.coach,
          location: booking.class_schedules.classes.location,
          bookings: []
        })
      }

      grouped.get(key)!.bookings.push(booking)
    })

    // Sort by datetime descending
    return Array.from(grouped.values()).sort((a, b) =>
      new Date(b.startDatetime).getTime() - new Date(a.startDatetime).getTime()
    )
  }

  if (authLoading || loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-muted-foreground">Chargement des réservations...</p>
          </div>
        </div>
      </div>
    )
  }

  const groupedBookings = getGroupedBookings()
  const totalPages = Math.ceil(groupedBookings.length / pageSize)
  const paginatedBookings = groupedBookings.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  )

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Réservations</h1>
          <p className="text-muted-foreground">Gérez toutes les réservations de cours des membres</p>
        </div>
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="list" className="flex items-center gap-2">
            <IconCalendarStats className="h-4 w-4" />
            Liste des réservations
          </TabsTrigger>
          <TabsTrigger value="book" className="flex items-center gap-2">
            <IconUserPlus className="h-4 w-4" />
            Réserver pour un utilisateur
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-6 mt-6">
          <div className="flex justify-end gap-2">
            <Button onClick={handleRefresh} variant="outline" size="sm">
              <IconRefresh className="h-4 w-4 mr-2" />
              Actualiser
            </Button>
            <Button onClick={handleExport} variant="outline" size="sm">
              <IconDownload className="h-4 w-4 mr-2" />
              Exporter
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Réservations</CardTitle>
            <IconCalendarStats className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confirmées</CardTitle>
            <IconCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.confirmed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Annulées</CardTitle>
            <IconX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.cancelled}</div>
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
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="confirmed">Confirmé</SelectItem>
                <SelectItem value="cancelled">Annulé</SelectItem>
              </SelectContent>
            </Select>

            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Cours" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les cours</SelectItem>
                {getUniqueClasses().map((className) => (
                  <SelectItem key={className} value={className}>
                    {className}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              placeholder="Date"
            />
          </div>
        </CardContent>
      </Card>

      {/* Grouped Bookings */}
      <div className="space-y-4">
        {groupedBookings.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <IconCalendarStats className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucune réservation trouvée</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          paginatedBookings.map((group, index) => (
            <Card key={index}>
              <CardHeader className="bg-muted/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{group.classTitle}</CardTitle>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <IconCalendar className="h-4 w-4" />
                        {format(parseISO(group.startDatetime), 'EEEE d MMMM yyyy', { locale: fr })}
                      </span>
                      <span className="flex items-center gap-1">
                        <IconClock className="h-4 w-4" />
                        {format(parseISO(group.startDatetime), 'HH:mm', { locale: fr })} - {format(parseISO(group.endDatetime), 'HH:mm', { locale: fr })}
                      </span>
                      <span>Coach: {group.coach}</span>
                      <span>Lieu: {group.location}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="self-start sm:self-center">
                    {group.bookings.length} réservation{group.bookings.length > 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {group.bookings.map((booking) => (
                    <div key={booking.id} className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <IconUser className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{booking.profiles?.full_name}</div>
                            <div className="text-sm text-muted-foreground">{booking.profiles?.email}</div>
                            {booking.profiles?.phone && (
                              <div className="text-sm text-muted-foreground">{booking.profiles.phone}</div>
                            )}
                            {booking.user_subscriptions?.subscription_plans?.name && (
                              <Badge variant="outline" className="mt-1 text-xs">
                                {booking.user_subscriptions.subscription_plans.name}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">
                              Réservé le {format(parseISO(booking.booked_at), 'dd/MM/yyyy HH:mm', { locale: fr })}
                            </div>
                            {booking.cancelled_at && (
                              <div className="text-sm text-muted-foreground">
                                Annulé le {format(parseISO(booking.cancelled_at), 'dd/MM/yyyy HH:mm', { locale: fr })}
                              </div>
                            )}
                          </div>
                          <Badge
                            variant={
                              booking.status === 'confirmed'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {booking.status === 'confirmed' && 'Confirmé'}
                            {booking.status === 'cancelled' && 'Annulé'}
                            {booking.status === 'no_show' && 'Absent'}
                            {!['confirmed', 'cancelled', 'no_show'].includes(booking.status) && booking.status}
                          </Badge>
                          {booking.status === 'confirmed' && new Date(booking.class_schedules.start_datetime) <= new Date() && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleFlagNoShow(booking.id)}
                            >
                              Marquer absent
                            </Button>
                          )}
                          {booking.status === 'no_show' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUnflagNoShow(booking.id)}
                            >
                              Retirer l'absence
                            </Button>
                          )}
                        </div>
                      </div>
                      {booking.cancellation_reason && (
                        <div className="mt-3 ml-13 p-3 bg-destructive/10 rounded-md text-sm">
                          <strong>Raison d'annulation:</strong> {booking.cancellation_reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {groupedBookings.length > 0 && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4">
          <div className="text-sm text-muted-foreground">
            Page {currentPage + 1} sur {totalPages} • {groupedBookings.length} groupe{groupedBookings.length > 1 ? 's' : ''} de réservations
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
            >
              <IconChevronLeft className="h-4 w-4" />
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage >= totalPages - 1}
            >
              Suivant
              <IconChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      </TabsContent>

      <TabsContent value="book" className="mt-6">
        <AdminBookingView adminId={user!.id} />
      </TabsContent>
      </Tabs>
    </div>
  )
}