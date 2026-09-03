'use client'

import { useState, useEffect } from 'react'
import { format, isPast, isFuture } from 'date-fns'
import { fr } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IconCalendar, IconClock, IconUser, IconMapPin, IconCircleCheck, IconCircleX, IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
import { LoadingSpinner } from '@/components/ui/loading'
import { BookingService } from '@/lib/services/booking.service'
import { waitlistService } from '@/lib/services/waitlist.service'
import { toast } from 'sonner'
import Link from 'next/link'

interface Booking {
  id: string
  status: 'confirmed' | 'cancelled' | 'no_show'
  booked_at: string
  cancelled_at?: string
  class_schedules: {
    id: string
    start_datetime: string
    end_datetime: string
    classes: {
      title: string
      description: string
      coach: string
      location: string
      difficulty_level: string
      max_capacity: number
    }
  }
}

interface WaitlistEntry {
  id: string
  position: number
  joined_at: string
  class_schedules: {
    id: string
    start_datetime: string
    end_datetime: string
    current_bookings: number
    classes: {
      title: string
      description: string
      coach: string
      location: string
      difficulty_level: string
      max_capacity: number
    }
  }
}

interface UserReservationsViewProps {
  userId: string
  userSubscriptionStatus?: string
}

export function UserReservationsView({ userId, userSubscriptionStatus }: UserReservationsViewProps) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasOnlyPersonalTraining, setHasOnlyPersonalTraining] = useState(false)
  const supabase = createClient()
  const bookingService = new BookingService()

  useEffect(() => {
    fetchReservations()
    checkPersonalTrainingStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const checkPersonalTrainingStatus = async () => {
    try {
      const hasOnlyPT = await bookingService.hasOnlyPersonalTraining()
      setHasOnlyPersonalTraining(hasOnlyPT)
    } catch (error) {
      console.error('Error checking personal training status:', error)
    }
  }

  const fetchReservations = async () => {
    try {
      setLoading(true)

      // Fetch user bookings
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('class_bookings')
        .select(`
          *,
          class_schedules (
            id,
            start_datetime,
            end_datetime,
            classes (
              title,
              description,
              coach,
              location,
              difficulty_level,
              max_capacity
            )
          )
        `)
        .eq('user_id', userId)
        .order('booked_at', { ascending: false })

      if (bookingsError) throw bookingsError

      // Fetch user waitlist entries
      const { data: waitlistData, error: waitlistError } = await supabase
        .from('class_waitlist')
        .select(`
          *,
          class_schedules (
            id,
            start_datetime,
            end_datetime,
            current_bookings,
            classes (
              title,
              description,
              coach,
              location,
              difficulty_level,
              max_capacity
            )
          )
        `)
        .eq('user_id', userId)
        .order('joined_at', { ascending: false })

      if (waitlistError) throw waitlistError

      setBookings(bookingsData || [])
      setWaitlist(waitlistData || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelBooking = async (booking: Booking) => {
    // Check if cancellation is allowed (same logic as calendar view)
    const classStartTime = new Date(booking.class_schedules.start_datetime)
    const now = new Date()
    const timeDifferenceInHours = (classStartTime.getTime() - now.getTime()) / (1000 * 60 * 60)

    if (timeDifferenceInHours <= 3) {
      toast.error('Annulation non autorisée', {
        description: 'Vous ne pouvez pas annuler cette réservation car elle commence dans moins de trois heures. Nous vous invitons à assister au cours. Quoi qu\'il en soit, celui-ci sera comptabilisé comme consommé.'
      })
      return
    }

    try {
      // Use the BookingService to handle cancellation and credit refund (same as calendar view)
      const result = await bookingService.cancelBooking(booking.id)

      if (!result.success) {
        setError(result.error || 'Une erreur inattendue s\'est produite')
        return
      }

      // Refresh data
      await fetchReservations()

      // Clear any previous errors
      setError('')
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleLeaveWaitlist = async (waitlistEntry: WaitlistEntry) => {
    try {
      const result = await waitlistService.leaveWaitlist(waitlistEntry.id)

      if (!result.success) {
        toast.error('Erreur lors de la sortie de liste d\'attente', {
          description: result.error || 'Une erreur inattendue s\'est produite'
        })
        return
      }

      // Refresh data
      await fetchReservations()

      toast.success('Retiré de la liste d\'attente', {
        description: 'Vos crédits ont été remboursés.'
      })
    } catch (err: any) {
      toast.error('Erreur lors de la sortie de liste d\'attente', {
        description: err.message || 'Une erreur inattendue s\'est produite'
      })
    }
  }

  const getDifficultyColor = (level: string) => {
    // Use theme-aware colors for all difficulty levels
    return 'bg-muted text-foreground'
  }

  const getDifficultyLabel = (level: string) => {
    switch (level.toLowerCase()) {
      case 'beginner':
        return 'Débutant'
      case 'intermediate':
        return 'Intermédiaire'
      case 'advanced':
        return 'Avancé'
      case 'all_levels':
        return 'Tous niveaux'
      default:
        return level
    }
  }

  const formatDateWithCapitalization = (date: Date, formatString: string) => {
    const formatted = format(date, formatString, { locale: fr })
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  }

  const upcomingBookings = bookings.filter(booking => 
    booking.status === 'confirmed' && 
    isFuture(new Date(booking.class_schedules.start_datetime))
  )
  
  const pastBookings = bookings.filter(booking => 
    isPast(new Date(booking.class_schedules.start_datetime))
  )

  const upcomingWaitlist = waitlist.filter(entry => 
    isFuture(new Date(entry.class_schedules.start_datetime))
  )

  // Show suspended account message for inactive users
  if (userSubscriptionStatus === 'inactive') {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-foreground mb-2">Compte suspendu</h1>
            <p className="text-muted-foreground">
              Votre compte nécessite une attention particulière
            </p>
          </div>
          <Alert variant="destructive" className="mb-6">
            <IconAlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-medium mb-2">Compte temporairement suspendu</div>
              <p className="text-sm">
                Votre compte a été suspendu. Veuillez contacter le studio pour résoudre cette situation.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => window.open('tel:0663235797')}>
                  Appeler le studio
                </Button>
                <Button variant="outline" onClick={() => window.open('https://wa.me/212663235797')}>
                  WhatsApp
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <LoadingSpinner message="Chargement de vos réservations" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gradient mb-2">Mes réservations</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Gérez vos cours réservés et votre liste d'attente
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Personal Training Message */}
        {hasOnlyPersonalTraining && (
          <Alert className="mb-6">
            <IconInfoCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-medium mb-2">Coaching Personnel</div>
              <p className="text-sm">
                Vos réservations sont gérées hors ligne pour les abonnements de coaching personnel.
                Veuillez contacter le studio pour toute information.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Show tabs only if user doesn't have personal training only */}
        {!hasOnlyPersonalTraining && (
          <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 h-auto gap-1 bg-card border border-border rounded-lg p-1">
            <TabsTrigger value="upcoming" className="min-h-[44px] px-1.5 text-xs sm:text-sm">
              À venir ({upcomingBookings.length})
            </TabsTrigger>
            <TabsTrigger value="waitlist" className="min-h-[44px] px-1.5 text-xs sm:text-sm">
              Liste d'attente ({upcomingWaitlist.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="min-h-[44px] px-1.5 text-xs sm:text-sm">
              Historique ({pastBookings.length})
            </TabsTrigger>
          </TabsList>

          {/* Upcoming Bookings */}
          <TabsContent value="upcoming" className="space-y-4">
            {upcomingBookings.length === 0 ? (
              <Card className="glass-effect shadow-soft">
                <CardContent className="text-center py-12">
                  <IconCalendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="font-semibold text-lg mb-2">Aucune réservation à venir</h3>
                  <p className="text-muted-foreground mb-4">
                    Consultez le planning pour réserver vos prochains cours
                  </p>
                  <Link href="/espace/planning">
                    <Button>Voir le planning</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              upcomingBookings.map(booking => {
                const startTime = new Date(booking.class_schedules.start_datetime)
                const endTime = new Date(booking.class_schedules.end_datetime)
                const canCancel = isFuture(startTime)

                return (
                  <Card key={booking.id} className="glass-effect shadow-soft border-l-4 border-l-primary">
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-3 flex-1 min-w-0">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">
                                {booking.class_schedules.classes.title}
                              </h3>
                              <Badge variant="secondary" className="text-xs">
                                {getDifficultyLabel(booking.class_schedules.classes.difficulty_level)}
                              </Badge>
                              <Badge variant="default" className="flex items-center gap-1 text-xs">
                                <IconCircleCheck className="h-3 w-3" />
                                Confirmé
                              </Badge>
                            </div>
                            {booking.class_schedules.classes.description && (
                              <p className="text-muted-foreground text-sm line-clamp-2">
                                {booking.class_schedules.classes.description}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                            <div className="flex items-center gap-2">
                              <IconCalendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{formatDateWithCapitalization(startTime, 'EEEE d MMM')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <IconClock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span>{format(startTime, 'HH:mm')} - {format(endTime, 'HH:mm')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <IconUser className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{booking.class_schedules.classes.coach}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <IconMapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{booking.class_schedules.classes.location}</span>
                            </div>
                          </div>

                          <div className="text-xs text-muted-foreground">
                            Réservé le {format(new Date(booking.booked_at), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                          </div>
                        </div>

                        {canCancel && (
                          <div className="flex-shrink-0 self-start sm:self-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCancelBooking(booking)}
                              className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                            >
                              Annuler
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </TabsContent>

          {/* Waitlist */}
          <TabsContent value="waitlist" className="space-y-4">
            {upcomingWaitlist.length === 0 ? (
              <Card className="glass-effect shadow-soft">
                <CardContent className="text-center py-12">
                  <IconAlertTriangle className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="font-semibold text-lg mb-2">Aucune liste d'attente</h3>
                  <p className="text-muted-foreground">
                    Vous n'êtes sur aucune liste d'attente actuellement
                  </p>
                </CardContent>
              </Card>
            ) : (
              upcomingWaitlist.map(entry => {
                const startTime = new Date(entry.class_schedules.start_datetime)
                const endTime = new Date(entry.class_schedules.end_datetime)
                const occupancyRate = Math.round(
                  (entry.class_schedules.current_bookings / entry.class_schedules.classes.max_capacity) * 100
                )

                return (
                  <Card key={entry.id} className="glass-effect shadow-soft border-l-4 border-l-foreground">
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-3 flex-1 min-w-0">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">
                                {entry.class_schedules.classes.title}
                              </h3>
                              <Badge variant="secondary" className="text-xs">
                                {getDifficultyLabel(entry.class_schedules.classes.difficulty_level)}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                Position #{entry.position}
                              </Badge>
                            </div>
                            {entry.class_schedules.classes.description && (
                              <p className="text-muted-foreground text-sm line-clamp-2">
                                {entry.class_schedules.classes.description}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                            <div className="flex items-center gap-2">
                              <IconCalendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{formatDateWithCapitalization(startTime, 'EEEE d MMM')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <IconClock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span>{format(startTime, 'HH:mm')} - {format(endTime, 'HH:mm')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <IconUser className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{entry.class_schedules.classes.coach}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <IconMapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{entry.class_schedules.classes.location}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                            <div className="text-xs text-muted-foreground">
                              Ajouté le {format(new Date(entry.joined_at), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Cours {occupancyRate >= 100 ? 'complet' : `${occupancyRate}% rempli`}
                            </div>
                          </div>
                        </div>

                        <div className="flex-shrink-0 self-start sm:self-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLeaveWaitlist(entry)}
                            className="w-full sm:w-auto"
                          >
                            Quitter la liste d&apos;attente
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </TabsContent>

          {/* History */}
          <TabsContent value="history" className="space-y-4">
            {pastBookings.length === 0 ? (
              <Card className="glass-effect shadow-soft">
                <CardContent className="text-center py-12">
                  <IconCalendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="font-semibold text-lg mb-2">Aucun historique</h3>
                  <p className="text-muted-foreground">
                    Vos cours passés apparaîtront ici
                  </p>
                </CardContent>
              </Card>
            ) : (
              pastBookings.map(booking => {
                const startTime = new Date(booking.class_schedules.start_datetime)
                const endTime = new Date(booking.class_schedules.end_datetime)
                const statusColor = 'text-foreground'

                const statusLabel = {
                  confirmed: 'Suivi',
                  cancelled: 'Annulé',
                  no_show: 'Absent'
                }[booking.status]

                return (
                  <Card key={booking.id} className="glass-effect shadow-soft opacity-75">
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-3 flex-1 min-w-0">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">
                                {booking.class_schedules.classes.title}
                              </h3>
                              <Badge variant="secondary" className="text-xs">
                                {getDifficultyLabel(booking.class_schedules.classes.difficulty_level)}
                              </Badge>
                            </div>
                            {booking.class_schedules.classes.description && (
                              <p className="text-muted-foreground text-sm line-clamp-2">
                                {booking.class_schedules.classes.description}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                            <div className="flex items-center gap-2">
                              <IconCalendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{formatDateWithCapitalization(startTime, 'EEEE d MMM')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <IconClock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span>{format(startTime, 'HH:mm')} - {format(endTime, 'HH:mm')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <IconUser className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{booking.class_schedules.classes.coach}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <IconMapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{booking.class_schedules.classes.location}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-row-reverse items-center gap-2 sm:flex-col sm:items-end">
                          <Badge variant="secondary" className={statusColor}>
                            {booking.status === 'confirmed' ? <IconCircleCheck className="h-3 w-3 mr-1" /> : <IconCircleX className="h-3 w-3 mr-1" />}
                            {statusLabel}
                          </Badge>
                          {booking.cancelled_at && (
                            <div className="text-xs text-muted-foreground">
                              Annulé le {format(new Date(booking.cancelled_at), 'dd/MM/yyyy', { locale: fr })}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </TabsContent>
        </Tabs>
        )}
      </div>
    </div>
  )
}