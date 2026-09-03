'use client'

import { useState, useEffect, useMemo } from 'react'
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, isPast, isAfter } from 'date-fns'
import { fr } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { IconRocket, IconCalendar, IconClock, IconUser, IconMapPin, IconAlertTriangle, IconCircleCheck, IconUsers, IconInfoCircle, IconStar, IconActivity, IconCalendarX } from '@tabler/icons-react'
import { LoadingSpinner } from '@/components/ui/loading'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { BookingService } from '@/lib/services/booking.service'
import confetti from 'canvas-confetti'

interface UserProfile {
  id: string
  full_name: string
  email: string
  subscription_status?: string
}

interface Subscription {
  id: string
  credits_remaining: number
  weekly_credits_used: number
  credits_used?: number
  end_date: string
  subscription_plans: {
    name: string
    type: 'carnet' | 'personal_training' | 'abonnement'
    weekly_limit?: number
  }
}

interface SubscriptionRequest {
  id: string
  status: 'pending' | 'contacted' | 'resolved' | 'cancelled'
  subscription_plans: {
    name: string
  }
}

interface ClassEvent {
  id: string
  class_id: string
  title: string
  description?: string
  coach: string
  location: string
  difficulty_level: string
  max_capacity: number
  start_datetime: string
  end_datetime: string
  current_bookings: number
  user_booking?: {
    id: string
    status: 'confirmed' | 'cancelled' | 'no_show'
  }
  user_waitlist_position?: number
  user_waitlist_id?: string
}

interface UserCalendarViewProps {
  user: UserProfile
  subscription?: Subscription
}

export function UserCalendarView({ user, subscription: initialSubscription }: UserCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<ClassEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<ClassEvent | null>(null)
  const [showEventModal, setShowEventModal] = useState(false)
  const [subscription, setSubscription] = useState(initialSubscription)
  const [hasOnlyPersonalTraining, setHasOnlyPersonalTraining] = useState(false)
  const [selectedMobileDate, setSelectedMobileDate] = useState<Date>(new Date())

  // Studio launch logic - 2025 dates
  // Get current effective date
  const getCurrentDate = () => {
    const now = new Date();

    // 1. Get the exact time components for Morocco (handling DST & Ramadan automatically)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Casablanca',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false, // Use 24h format for easy parsing
    });

    const parts = formatter.formatToParts(now);

    // Helper to extract parts safely
    const getPart = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);

    // 2. Construct a new Date object.
    // We use the numbers from Morocco, but creating a "Local" Date object.
    // This effectively tricks the browser into thinking the device is in Morocco.
    return new Date(
      getPart('year'),
      getPart('month') - 1, // Important: JavaScript months are 0-11
      getPart('day'),
      getPart('hour'),
      getPart('minute'),
      getPart('second')
    );
  };

  // Launch dates
  const prelaunchStart = new Date(2025, 8, 21) // Sept 21, 2025
  const launchMoment = new Date(2025, 8, 28, 18, 0, 0) // Sept 28, 2025 at 18:00
  const planningWeekStart = new Date(2025, 8, 29) // Sept 29, 2025 (Monday)

  // Determine current phase
  const getCurrentPhase = () => {
    const now = getCurrentDate()
    if (now < launchMoment) {
      return 'pre-launch'
    }
    return 'post-launch'
  }

  const currentPhase = getCurrentPhase()

  // Helper function to check if event is past using simulated date
  const isEventPast = (eventDateTime: string) => {
    const eventDate = new Date(eventDateTime)
    const currentDate = getCurrentDate()
    return eventDate < currentDate
  }

  const supabase = createClient()
  const bookingService = useMemo(() => new BookingService(), [])

  // Confetti animation for successful booking
  const triggerConfetti = () => {
    const duration = 3000
    const animationEnd = Date.now() + duration
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 }

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min
    }

    const interval = setInterval(function () {
      const timeLeft = animationEnd - Date.now()

      if (timeLeft <= 0) {
        return clearInterval(interval)
      }

      const particleCount = 50 * (timeLeft / duration)

      // From left
      confetti(Object.assign({}, defaults, {
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      }))

      // From right
      confetti(Object.assign({}, defaults, {
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      }))
    }, 250)
  }

  // Sync subscription state with props
  useEffect(() => {
    setSubscription(initialSubscription)
  }, [initialSubscription])

  // Function to refresh subscription data
  const refreshSubscriptionData = async () => {
    if (!subscription) {
      return
    }

    try {

      const { data: updatedSubscription, error } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          subscription_plans (*)
        `)
        .eq('id', subscription.id)
        .single()


      if (!error && updatedSubscription) {
        setSubscription(updatedSubscription)
      } else {
        console.error('Error refreshing subscription:', error)
      }
    } catch (error) {
      console.error('Error refreshing subscription:', error)
    }
  }

  // Check personal training status
  useEffect(() => {
    const checkPersonalTrainingStatus = async () => {
      try {
        const hasOnlyPT = await bookingService.hasOnlyPersonalTraining()
        setHasOnlyPersonalTraining(hasOnlyPT)
      } catch (error) {
        console.error('Error checking personal training status:', error)
      }
    }
    checkPersonalTrainingStatus()
  }, [bookingService])

  // Calculate week days based on phase
  const getCalculatedWeekStart = () => {
    if (currentPhase === 'pre-launch') {
      return planningWeekStart // Fixed to Sept 29, 2025
    }

    // Post-launch: Calculate based on current week (starting Monday)
    const today = getCurrentDate()
    const mondayOfThisWeek = startOfWeek(today, { weekStartsOn: 1 })

    // Check if it's past Saturday 11:45, then show next week
    const now = getCurrentDate()
    const saturdayOfThisWeek = addDays(mondayOfThisWeek, 5)
    const rolloverTime = new Date(saturdayOfThisWeek)
    rolloverTime.setHours(11, 45, 0, 0)

    if (now >= rolloverTime) {
      return addDays(mondayOfThisWeek, 7) // Next week
    }

    return mondayOfThisWeek // This week
  }

  const [weekStartDate, setWeekStartDate] = useState<Date>(getCalculatedWeekStart())

  const getWeekDays = (startDate: Date) => {
    const days = []
    for (let i = 0; i < 7; i++) {
      days.push(addDays(startDate, i))
    }
    return days
  }

  const weekDays = getWeekDays(weekStartDate)

  // Update week when phase changes
  useEffect(() => {
    const newWeekStart = getCalculatedWeekStart()
    setWeekStartDate(newWeekStart)

    // Set mobile date to today if it's within the week, otherwise first day of week
    const today = getCurrentDate()
    const weekEnd = addDays(newWeekStart, 6)

    if (today >= newWeekStart && today <= weekEnd) {
      setSelectedMobileDate(today)
    } else {
      setSelectedMobileDate(newWeekStart)
    }

    fetchEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhase])

  const fetchEvents = async () => {
    try {
      setLoading(true)

      const now = getCurrentDate()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      // Calculate the week range for fetching
      const calculatedWeekStart = getCalculatedWeekStart()
      const weekEnd = addDays(calculatedWeekStart, 6)

      // Use optimized view instead of calendar_events
      const { data: eventsData, error: eventsError } = await supabase
        .from('calendar_events_optimized')
        .select('*')
        .gte('start_datetime', calculatedWeekStart.toISOString())
        .lte('start_datetime', weekEnd.toISOString())
        .order('start_datetime')
        .limit(50) // Limit results for performance

      if (eventsError) throw eventsError

      // Update the week start state to match what we calculated
      setWeekStartDate(calculatedWeekStart)

      // All events are already filtered by the database query
      const weekEvents = eventsData || []

      // Fetch user's bookings and waitlist in parallel
      const [bookingsResult, waitlistResult] = await Promise.all([
        supabase
          .from('class_bookings')
          .select('schedule_id, id, status')
          .eq('user_id', user.id)
          .in('status', ['confirmed']),
        supabase
          .from('class_waitlist')
          .select('id, schedule_id, position')
          .eq('user_id', user.id)
      ])

      if (bookingsResult.error) throw bookingsResult.error
      if (waitlistResult.error) throw waitlistResult.error

      // Combine the data efficiently
      const eventsWithBookingStatus = weekEvents.map(event => ({
        ...event,
        user_booking: bookingsResult.data?.find(b => b.schedule_id === event.id),
        user_waitlist_position: waitlistResult.data?.find(w => w.schedule_id === event.id)?.position,
        user_waitlist_id: waitlistResult.data?.find(w => w.schedule_id === event.id)?.id
      }))

      setEvents(eventsWithBookingStatus)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBookClass = async (event: ClassEvent) => {
    try {
      setLoading(true)

      // Check if user has only personal training subscription
      if (hasOnlyPersonalTraining) {
        toast.error('Réservation non disponible', {
          description: 'Vous ne pouvez pas réserver un cours avec votre abonnement actuel. Merci d\'ajouter un abonnement ou un carnet pour effectuer une réservation.',
          action: {
            label: 'Contacter',
            onClick: () => window.open('tel:0663235797')
          }
        })
        return
      }

      // Use the new booking service
      const result = await bookingService.bookClass({ scheduleId: event.id })

      if (!result.success) {
        // Handle specific error cases with appropriate messages
        switch (result.error) {
          case 'Vous ne pouvez pas réserver un cours avec votre abonnement actuel. Merci d\'ajouter un abonnement ou un carnet pour effectuer une réservation.':
            toast.error('Réservation non disponible', {
              description: result.error,
              action: {
                label: 'Contacter',
                onClick: () => window.open('tel:0663235797')
              }
            })
            break
          case 'Limite hebdomadaire de séances atteinte':
            toast.error('Limite hebdomadaire atteinte', {
              description: 'Vous avez utilisé tous vos cours pour cette semaine. La limite se réinitialise chaque semaine.'
            })
            break
          case 'Plus de crédits disponibles':
            toast.error('Plus de crédits disponibles', {
              description: 'Contactez-nous pour renouveler votre abonnement ou acheter de nouveaux crédits.',
              action: {
                label: 'Contacter',
                onClick: () => window.open('tel:0663235797')
              }
            })
            break
          case 'Le cours est complet':
            toast.error('Ce cours est complet', {
              description: 'Vous pouvez rejoindre la liste d\'attente si disponible.'
            })
            break
          case 'Vous avez déjà réservé ce cours':
            toast.error('Vous avez déjà réservé ce cours')
            break
          default:
            toast.error('Erreur lors de la réservation', {
              description: result.error || 'Une erreur inattendue s\'est produite'
            })
        }
        return
      }

      // Refresh events to show updated booking status
      await fetchEvents()

      // Refresh subscription data to show updated credits
      await refreshSubscriptionData()

      // Show success message
      toast.success('Cours réservé avec succès!', {
        description: `Votre cours "${event.title}" a été réservé.`
      })

      // Trigger confetti celebration
      triggerConfetti()

    } catch (err: any) {
      console.error('Booking error:', err)
      toast.error('Erreur lors de la réservation', {
        description: err.message || 'Une erreur inattendue s\'est produite'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleJoinWaitlist = async (event: ClassEvent) => {
    try {
      setLoading(true)

      // Use the BookingService to handle waitlist joining
      const result = await bookingService.joinWaitlist({ scheduleId: event.id })

      if (!result.success) {
        toast.error('Erreur lors de l\'ajout à la liste d\'attente', {
          description: result.error || 'Une erreur inattendue s\'est produite'
        })
        return
      }

      // Refresh events to show updated waitlist status
      await fetchEvents()

      // Refresh subscription data to show updated credits
      await refreshSubscriptionData()

      toast.success('Ajouté à la liste d\'attente!', {
        description: 'Vous serez automatiquement inscrit si une place se libère.'
      })

    } catch (err: any) {
      console.error('Waitlist join error:', err)
      toast.error('Erreur lors de l\'ajout à la liste d\'attente', {
        description: err.message || 'Une erreur inattendue s\'est produite'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleLeaveWaitlist = async (event: ClassEvent) => {
    if (!event.user_waitlist_id) return
    try {
      setLoading(true)
      const result = await bookingService.leaveWaitlist(event.user_waitlist_id)

      if (!result.success) {
        toast.error("Erreur lors de la sortie de liste d'attente", {
          description: result.error || "Une erreur inattendue s'est produite"
        })
        return
      }

      toast.success("Retiré de la liste d'attente", {
        description: 'Votre crédit a été remboursé.'
      })

      await Promise.all([fetchEvents(), refreshSubscriptionData()])
    } catch (err: any) {
      toast.error("Erreur lors de la sortie de liste d'attente", {
        description: err.message || "Une erreur inattendue s'est produite"
      })
    } finally {
      setLoading(false)
    }
  }

  // Check if cancellation is allowed (must be more than 1 hour before class starts)
  const canCancelBooking = (event: ClassEvent) => {
    if (!event.user_booking) return false

    const classStartTime = new Date(event.start_datetime)
    const now = getCurrentDate()
    const timeDifferenceInHours = (classStartTime.getTime() - now.getTime()) / (1000 * 60 * 60)

    return timeDifferenceInHours > 3
  }

  const handleCancelBooking = async (event: ClassEvent) => {
    if (!event.user_booking) return

    // Check if cancellation is allowed
    if (!canCancelBooking(event)) {
      toast.error('Annulation non autorisée', {
        description: 'Vous ne pouvez pas annuler cette réservation car elle commence dans moins de trois heures. Nous vous invitons à assister au cours. Quoi qu\'il en soit, celui-ci sera comptabilisé comme consommé.'
      })
      return
    }

    try {
      setLoading(true)

      // Use the BookingService to handle cancellation and credit refund
      const result = await bookingService.cancelBooking(event.user_booking.id)

      if (!result.success) {
        toast.error('Erreur lors de l\'annulation', {
          description: result.error || 'Une erreur inattendue s\'est produite'
        })
        return
      }

      // Refresh events and subscription data
      await fetchEvents()
      await refreshSubscriptionData()

      toast.success('Cours annulé avec succès!', {
        description: `Votre réservation pour "${event.title}" a été annulée et vos crédits ont été remboursés.`
      })

    } catch (err: any) {
      console.error('Cancellation error:', err)
      toast.error('Erreur lors de l\'annulation', {
        description: err.message || 'Une erreur inattendue s\'est produite'
      })
    } finally {
      setLoading(false)
    }
  }

  const getEventsForDate = (date: Date) => {
    return events.filter(event => {
      const eventDate = new Date(event.start_datetime)
      return isSameDay(eventDate, date)
    })
  }

  const handlePreviousWeek = () => {
    const newWeekStart = addDays(weekStartDate, -7)
    setWeekStartDate(newWeekStart)
    fetchEventsForWeek(newWeekStart)
  }

  const handleNextWeek = () => {
    const newWeekStart = addDays(weekStartDate, 7)
    setWeekStartDate(newWeekStart)
    fetchEventsForWeek(newWeekStart)
  }

  const fetchEventsForWeek = async (weekStart: Date) => {
    try {
      setLoading(true)
      const now = getCurrentDate()
      const weekEnd = addDays(weekStart, 6)

      // Fetch events for the specified week
      const { data: eventsData, error: eventsError } = await supabase
        .from('calendar_events')
        .select('*')
        .gte('start_datetime', weekStart.toISOString())
        .lte('start_datetime', weekEnd.toISOString())
        .order('start_datetime')

      if (eventsError) throw eventsError

      // Fetch user's bookings
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('class_bookings')
        .select('schedule_id, id, status')
        .eq('user_id', user.id)
        .in('status', ['confirmed', 'pending'])

      if (bookingsError) throw bookingsError

      // Fetch user's waitlist positions
      const { data: waitlistData, error: waitlistError } = await supabase
        .from('class_waitlist')
        .select('id, schedule_id, position')
        .eq('user_id', user.id)

      if (waitlistError) throw waitlistError

      // Combine the data
      const eventsWithBookingStatus = eventsData?.map(event => ({
        ...event,
        user_booking: bookingsData?.find(b => b.schedule_id === event.id),
        user_waitlist_position: waitlistData?.find(w => w.schedule_id === event.id)?.position,
        user_waitlist_id: waitlistData?.find(w => w.schedule_id === event.id)?.id
      })) || []

      setEvents(eventsWithBookingStatus)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }


  const getDifficultyLabel = (level: string) => {
    switch (level) {
      case 'all_levels':
        return 'Tous niveaux'
      case 'intermediate':
        return 'Intermédiaire'
      case 'advanced':
        return 'Avancé'
      default:
        return level
    }
  }

  // New Helper to show the correct UI message
  const getOpeningTimeMessage = (eventDate: Date) => {
    const day = eventDate.getDay();
    if ([1, 2, 4].includes(day)) return "dimanche à 17:00"; // Mon, Tue, Thu
    if ([3, 5, 6].includes(day)) return "mercredi à 17:00"; // Wed, Fri, Sat (window 2 opens Wednesday 17:00)
    return "bientôt";
  };

  // Helper function to check if booking window is open
  const isBookingWindowOpen = () => {
    const now = getCurrentDate();
    const sundayBeforeDisplayedWeek = addDays(weekStartDate, -1);
    const bookingWindowOpen = new Date(sundayBeforeDisplayedWeek);
    bookingWindowOpen.setHours(17, 0, 0, 0); // Changed from 18:00 to 17:00
    return now >= bookingWindowOpen;
  }

  const isEventBookingOpen = (eventDate: Date) => {
    const now = getCurrentDate();

    // Get the start of the week for the specific EVENT (Monday)
    const eventWeekStart = startOfWeek(eventDate, { weekStartsOn: 1 });
    const eventDayOfWeek = eventDate.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat

    // Window 1: Sunday before the event at 17:00
    const window1Opening = new Date(eventWeekStart);
    window1Opening.setDate(window1Opening.getDate() - 1);
    window1Opening.setHours(17, 0, 0, 0);

    // Window 2: Wednesday of the event's week at 17:00
    const window2Opening = new Date(eventWeekStart);
    window2Opening.setDate(window2Opening.getDate() + 2);
    window2Opening.setHours(17, 0, 0, 0);

    const window1Days = [1, 2, 3];
    const window2Days = [4, 5, 6];

    if (window1Days.includes(eventDayOfWeek)) {
      return now >= window1Opening;
    }

    if (window2Days.includes(eventDayOfWeek)) {
      return now >= window2Opening;
    }

    return false;
  };

  const canUserBook = (event: ClassEvent) => {
    // During pre-launch, booking is disabled
    if (currentPhase === 'pre-launch') {
      return false
    }

    // User already booked
    if (event.user_booking) {
      return false
    }

    // Class has started or passed (using simulated date)
    if (isEventPast(event.start_datetime)) {
      return false
    }

    // No valid subscription
    if (!subscription) {
      return false
    }

    // Class is full (but can join waitlist)
    if (event.current_bookings >= event.max_capacity) {
      return false
    }

    // Check if booking window is open (Sunday at 18:00:00)
    if (!isEventBookingOpen(new Date(event.start_datetime))) {
      return false
    }

    // Always return true - we'll handle credit/limit checks in handleBookClass
    return true
  }

  const hasCreditsOrLimit = () => {
    if (!subscription) return false

    if (subscription.subscription_plans.type === 'abonnement') {
      return subscription.weekly_credits_used < (subscription.subscription_plans.weekly_limit || 0)
    } else {
      return subscription.credits_remaining > 0
    }
  }

  const canJoinWaitlist = (event: ClassEvent) => {
    return !event.user_booking &&
      !event.user_waitlist_position &&
      event.current_bookings >= event.max_capacity &&
      !isEventPast(event.start_datetime) &&
      subscription &&
      currentPhase !== 'pre-launch' &&
      isEventBookingOpen(new Date(event.start_datetime))
  }

  const handleEventClick = (event: ClassEvent) => {
    setSelectedEvent(event)
    setShowEventModal(true)
  }

  // Show loading spinner on initial load
  if (loading && events.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <LoadingSpinner message="Chargement de votre planning" />
        </div>
      </div>
    )
  }

  // Show suspended account message for inactive users
  if (user.subscription_status === 'inactive') {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {/* Header */}
        <div className="mb-6 lg:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 mb-6">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 text-gradient">
                Planning des cours
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Consultez et réservez vos cours à venir
              </p>
            </div>

          </div>

          {/* Pre-launch Banner */}
          {currentPhase === 'pre-launch' && (
            <Alert className="mb-6 border-primary bg-primary/5">
              <IconRocket className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-2">Lancement imminent du studio!</div>
                <p className="text-sm">
                  Les réservations seront ouvertes le{' '}
                  <strong>{format(launchMoment, 'EEEE d MMMM yyyy à HH:mm', { locale: fr })}</strong>.
                  Vous pouvez consulter le planning de la semaine du {format(planningWeekStart, 'd MMMM', { locale: fr })} au {format(addDays(planningWeekStart, 6), 'd MMMM yyyy', { locale: fr })}.
                </p>
              </AlertDescription>
            </Alert>
          )}

        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Desktop Calendar Grid */}
        <div className="hidden lg:block">
          <Card className="shadow-lg border-0 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-0">
              {/* Calendar Header */}
              <div className="grid grid-cols-7 border-b border-border/50">
                {weekDays.map(day => {
                  const isCurrentDay = isToday(day)
                  return (
                    <div key={day.toISOString()} className={cn(
                      "p-4 text-center border-r border-border/50 last:border-r-0 bg-muted/20",
                      isCurrentDay && "bg-accent/20 border-accent"
                    )}>
                      <div className={cn(
                        "font-medium text-muted-foreground capitalize text-sm",
                        isCurrentDay && "text-primary"
                      )}>
                        {format(day, 'EEEE', { locale: fr })}
                      </div>
                      <div className={cn(
                        "text-2xl mt-1 font-semibold",
                        isCurrentDay && "text-primary font-bold"
                      )}>
                        {format(day, 'd')}
                      </div>
                      <div className="text-sm text-muted-foreground capitalize">
                        {format(day, 'MMM', { locale: fr })}
                      </div>
                      {isCurrentDay && (
                        <Badge variant="default" className="mt-2 text-xs">Aujourd'hui</Badge>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Calendar Body */}
              <div className="hidden lg:grid lg:grid-cols-7 min-h-[600px] rounded-b-xl overflow-hidden border border-border bg-card">
                {weekDays.map(day => {
                  const dayEvents = getEventsForDate(day)
                  const isCurrentDay = isToday(day)

                  return (
                    <div key={day.toISOString()} className={cn(
                      "border-r border-border last:border-r-0 p-3 transition-colors",
                      isCurrentDay && "bg-primary/5",
                      dayEvents.length === 0 && "bg-muted/10"
                    )}>
                      {dayEvents.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                          Aucun cours
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {dayEvents.map(event => {
                            const startTime = new Date(event.start_datetime)
                            const occupancyRate = Math.round((event.current_bookings / event.max_capacity) * 100)

                            return (
                              <Card key={event.id} className={cn(
                                "border-l-4 transition-all hover:shadow-soft cursor-pointer group bg-card/50 hover:bg-card border-border",
                                event.user_booking && "border-l-foreground bg-accent/10 hover:bg-accent/20",
                                event.user_waitlist_position && "border-l-muted-foreground bg-muted hover:bg-muted/80",
                                !event.user_booking && !event.user_waitlist_position && "border-l-border bg-background hover:bg-muted/50"
                              )}
                                onClick={() => handleEventClick(event)}>
                                <CardContent className="p-3">
                                  <div className="space-y-2">
                                    <div>
                                      <h4 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors">{event.title}</h4>
                                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                        <IconClock className="h-3 w-3" />
                                        <span>{format(startTime, 'HH:mm')}</span>
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-between">
                                      <Badge variant="outline" className="text-xs">
                                        {getDifficultyLabel(event.difficulty_level)}
                                      </Badge>
                                      <div className="text-xs text-muted-foreground">
                                        {event.current_bookings}/{event.max_capacity}
                                      </div>
                                    </div>

                                    <div className="space-y-1">
                                      {event.user_booking ? (
                                        <>
                                          <Badge variant="default" className="text-xs w-full justify-center">
                                            <IconCircleCheck className="h-3 w-3 mr-1" />
                                            Réservé
                                          </Badge>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleCancelBooking(event)
                                            }}
                                            className={cn(
                                              "w-full text-xs h-6",
                                              !canCancelBooking(event) && "opacity-50"
                                            )}
                                          >
                                            Annuler
                                          </Button>
                                        </>
                                      ) : event.user_waitlist_position ? (
                                        <Badge variant="secondary" className="text-xs w-full justify-center">
                                          Liste #{event.user_waitlist_position}
                                        </Badge>
                                      ) : (
                                        <>
                                          {currentPhase === 'pre-launch' ? (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Button
                                                    disabled
                                                    size="sm"
                                                    className="w-full text-xs h-6"
                                                  >
                                                    <IconCalendarX className="h-3 w-3 mr-1" />
                                                    Bientôt
                                                  </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p>Réservations ouvertes {getOpeningTimeMessage(startTime)}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          ) : !isEventBookingOpen(startTime) ? (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Button
                                                    disabled
                                                    size="sm"
                                                    className="w-full text-xs h-6"
                                                  >
                                                    <IconCalendarX className="h-3 w-3 mr-1" />
                                                    Bientôt
                                                  </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p>Réservations ouvertes {getOpeningTimeMessage(startTime)}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          ) : canUserBook(event) ? (
                                            <Button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                handleBookClass(event)
                                              }}
                                              disabled={loading}
                                              size="sm"
                                              className="w-full text-xs h-6"
                                            >
                                              Réserver
                                            </Button>
                                          ) : canJoinWaitlist(event) ? (
                                            <Button
                                              variant="outline"
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                handleJoinWaitlist(event)
                                              }}
                                              disabled={loading}
                                              size="sm"
                                              className="w-full text-xs h-6"
                                            >
                                              Rejoindre liste d'attente
                                            </Button>
                                          ) : isEventPast(event.start_datetime) ? (
                                            <Badge variant="secondary" className="text-xs w-full justify-center">
                                              <IconCalendarX className="h-3 w-3 mr-1" />
                                              Expiré
                                            </Badge>
                                          ) : (
                                            <Badge variant="secondary" className="text-xs w-full justify-center">Complet</Badge>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Mobile/Tablet List View */}
        <div className="lg:hidden">
          {/* Date Filter Tabs */}
          <div className="mb-6">
            <div className="flex overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
              <div className="flex space-x-2 min-w-max">
                {weekDays.map(day => {
                  const isCurrentDay = isToday(day)
                  const isSelected = isSameDay(day, selectedMobileDate)
                  const dayEvents = getEventsForDate(day)

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedMobileDate(day)}
                      className={cn(
                        "flex flex-col items-center p-3 rounded-lg min-w-[80px] transition-all",
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "bg-card border border-border hover:bg-accent"
                      )}
                    >
                      <div className="text-xs font-medium uppercase tracking-wide opacity-80">
                        {format(day, 'EEE', { locale: fr })}
                      </div>
                      <div className="text-lg font-bold mt-1">
                        {format(day, 'd')}
                      </div>
                      {isCurrentDay && !isSelected && (
                        <div className="w-1 h-1 bg-primary rounded-full mt-1"></div>
                      )}
                      {dayEvents.length > 0 && (
                        <div className="text-xs mt-1 opacity-70">
                          {dayEvents.length} cours
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Selected Day Content */}
          {(() => {
            const selectedDayEvents = getEventsForDate(selectedMobileDate)
            const isCurrentDay = isToday(selectedMobileDate)

            return (
              <Card className={cn(
                "shadow-soft transition-all border-l-4",
                isCurrentDay ? "border-l-foreground bg-accent/5" : "border-l-border"
              )}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={cn(
                        "flex flex-col items-center justify-center w-12 h-12 rounded-xl font-bold bg-muted text-muted-foreground transition-colors",
                        isCurrentDay && "bg-primary text-primary-foreground"
                      )}>
                        <div className="text-lg leading-none">
                          {format(selectedMobileDate, 'd')}
                        </div>
                        <div className="text-xs leading-none mt-1 uppercase tracking-wide">
                          {format(selectedMobileDate, 'MMM', { locale: fr })}
                        </div>
                      </div>
                      <div>
                        <div className={cn(
                          "font-semibold capitalize",
                          isCurrentDay && "text-primary"
                        )}>
                          {format(selectedMobileDate, 'EEEE', { locale: fr })}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {selectedDayEvents.length} cours
                        </div>
                      </div>
                    </div>
                    {isCurrentDay && (
                      <Badge variant="default">Aujourd'hui</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {selectedDayEvents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <IconCalendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Aucun cours prévu</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedDayEvents.map(event => {
                        const startTime = new Date(event.start_datetime)
                        const endTime = new Date(event.end_datetime)

                        return (
                          <Card key={event.id} className={cn(
                            "border-l-4 transition-all cursor-pointer hover:shadow-md",
                            event.user_booking && "border-l-foreground bg-accent/10",
                            event.user_waitlist_position && "border-l-muted-foreground bg-muted",
                            !event.user_booking && !event.user_waitlist_position && "border-l-accent bg-accent/5"
                          )}
                            onClick={() => handleEventClick(event)}>
                            <CardContent className="p-4">
                              <div className="space-y-3">
                                <div className="space-y-2">
                                  <div className="flex items-start justify-between">
                                    <h3 className="font-semibold leading-tight">{event.title}</h3>
                                    <Badge variant="outline" className="ml-2 shrink-0">
                                      {getDifficultyLabel(event.difficulty_level)}
                                    </Badge>
                                  </div>
                                  {event.description && (
                                    <p className="text-sm text-muted-foreground leading-relaxed">{event.description}</p>
                                  )}
                                </div>

                                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <IconClock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    <span className="truncate">{format(startTime, 'HH:mm')} - {format(endTime, 'HH:mm')}</span>
                                  </div>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <IconUser className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    <span className="truncate">{event.coach}</span>
                                  </div>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <IconMapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    <span className="truncate">{event.location}</span>
                                  </div>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <IconUsers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    <span className="tabular-nums">{event.current_bookings}/{event.max_capacity}</span>
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  {event.user_booking ? (
                                    <>
                                      <Badge variant="default" className="flex-1 justify-center">
                                        <IconCircleCheck className="h-3 w-3 mr-1" />
                                        Réservé
                                      </Badge>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleCancelBooking(event)
                                        }}
                                        className={cn(
                                          !canCancelBooking(event) && "opacity-50"
                                        )}
                                      >
                                        Annuler
                                      </Button>
                                    </>
                                  ) : event.user_waitlist_position ? (
                                    <Badge variant="secondary" className="flex-1 justify-center">
                                      Liste d'attente #{event.user_waitlist_position}
                                    </Badge>
                                  ) : (
                                    <>
                                      {currentPhase === 'pre-launch' ? (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                disabled
                                                className="flex-1"
                                              >
                                                <IconCalendarX className="h-4 w-4 mr-2" />
                                                Bientôt disponible
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>Réservations ouvertes {getOpeningTimeMessage(startTime)}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      ) : !isEventBookingOpen(startTime) ? (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                disabled
                                                className="flex-1"
                                              >
                                                <IconCalendarX className="h-4 w-4 mr-2" />
                                                Bientôt disponible
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>Réservations ouvertes {getOpeningTimeMessage(startTime)}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      ) : canUserBook(event) ? (
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleBookClass(event)
                                          }}
                                          disabled={loading}
                                          className="flex-1"
                                        >
                                          Réserver
                                        </Button>
                                      ) : canJoinWaitlist(event) ? (
                                        <Button
                                          variant="outline"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleJoinWaitlist(event)
                                          }}
                                          disabled={loading}
                                          className="flex-1"
                                        >
                                          Rejoindre la liste d'attente
                                        </Button>
                                      ) : isEventPast(event.start_datetime) ? (
                                        <Badge variant="secondary" className="flex-1 justify-center">
                                          <IconCalendarX className="h-3 w-3 mr-1" />
                                          Expiré
                                        </Badge>
                                      ) : (
                                        <Badge variant="secondary" className="flex-1 justify-center">Complet</Badge>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })()}
        </div>

        {/* Class Detail Modal */}
        <Dialog open={showEventModal} onOpenChange={setShowEventModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">{selectedEvent?.title}</DialogTitle>
            </DialogHeader>

            {selectedEvent && (
              <div className="space-y-6">
                {/* Header Info */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="text-sm">
                        {getDifficultyLabel(selectedEvent.difficulty_level)}
                      </Badge>
                      {selectedEvent.user_booking && (
                        <Badge variant="default" className="text-sm">
                          <IconCircleCheck className="h-3 w-3 mr-1" />
                          Réservé
                        </Badge>
                      )}
                      {selectedEvent.user_waitlist_position && (
                        <Badge variant="secondary" className="text-sm">
                          Liste d'attente #{selectedEvent.user_waitlist_position}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(selectedEvent.start_datetime), 'EEEE d MMMM yyyy', { locale: fr })}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {selectedEvent.user_booking ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          handleCancelBooking(selectedEvent)
                          if (canCancelBooking(selectedEvent)) {
                            setShowEventModal(false)
                          }
                        }}
                        className={cn(
                          !canCancelBooking(selectedEvent) && "opacity-50"
                        )}
                      >
                        Annuler la réservation
                      </Button>
                    ) : selectedEvent.user_waitlist_position ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          handleLeaveWaitlist(selectedEvent)
                          setShowEventModal(false)
                        }}
                        disabled={loading}
                      >
                        Quitter la liste d'attente
                      </Button>
                    ) : (
                      <>
                        {currentPhase === 'pre-launch' ? (
                          <Button variant="outline" disabled>
                            <IconCalendarX className="h-4 w-4 mr-2" />
                            Réservations bientôt ouvertes
                          </Button>
                        ) : !isEventBookingOpen(new Date(selectedEvent.start_datetime)) ? (
                          <Button variant="outline" disabled>
                            <IconCalendarX className="h-4 w-4 mr-2" />
                            Ouverture : {getOpeningTimeMessage(new Date(selectedEvent.start_datetime))}
                          </Button>
                        ) : canUserBook(selectedEvent) ? (
                          <Button
                            onClick={() => {
                              handleBookClass(selectedEvent)
                              setShowEventModal(false)
                            }}
                            disabled={loading}
                          >
                            Réserver ce cours
                          </Button>
                        ) : canJoinWaitlist(selectedEvent) ? (
                          <Button
                            variant="outline"
                            onClick={() => {
                              handleJoinWaitlist(selectedEvent)
                              setShowEventModal(false)
                            }}
                            disabled={loading}
                          >
                            Rejoindre la liste d'attente
                          </Button>
                        ) : isEventPast(selectedEvent.start_datetime) ? (
                          <Button variant="outline" disabled>
                            <IconCalendarX className="h-4 w-4 mr-2" />
                            Cours expiré
                          </Button>
                        ) : (
                          <Button variant="outline" disabled>
                            Cours complet
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Description */}
                {selectedEvent.description && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <IconInfoCircle className="h-4 w-4" />
                        Description
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{selectedEvent.description}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Class Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <IconClock className="h-4 w-4" />
                        Horaires
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Début:</span>
                        <span className="font-medium">
                          {format(new Date(selectedEvent.start_datetime), 'HH:mm')}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fin:</span>
                        <span className="font-medium">
                          {format(new Date(selectedEvent.end_datetime), 'HH:mm')}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Durée:</span>
                        <span className="font-medium">
                          {Math.round((new Date(selectedEvent.end_datetime).getTime() - new Date(selectedEvent.start_datetime).getTime()) / (1000 * 60))} min
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <IconUsers className="h-4 w-4" />
                        Participants
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Inscrits:</span>
                        <span className="font-medium">{selectedEvent.current_bookings}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Capacité max:</span>
                        <span className="font-medium">{selectedEvent.max_capacity}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Places restantes:</span>
                        <span className={cn(
                          "font-medium",
                          selectedEvent.max_capacity - selectedEvent.current_bookings <= 2 && "text-destructive",
                          selectedEvent.max_capacity - selectedEvent.current_bookings === 0 && "text-destructive"
                        )}>
                          {Math.max(0, selectedEvent.max_capacity - selectedEvent.current_bookings)}
                        </span>
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="text-muted-foreground">Remplissage</span>
                          <span className="font-mono text-xs tabular-nums">
                            {selectedEvent.current_bookings}/{selectedEvent.max_capacity}
                          </span>
                        </div>
                        {/* Segmented bar: one tick per place (Direction «Charbon») */}
                        <div className="flex gap-0.5" aria-hidden="true">
                          {Array.from({ length: Math.min(selectedEvent.max_capacity, 24) }).map((_, i) => (
                            <span
                              key={i}
                              className={cn(
                                "h-2 flex-1 rounded-[1px] transition-colors",
                                i < selectedEvent.current_bookings ? "bg-primary" : "bg-muted"
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <IconUser className="h-4 w-4" />
                        Coach
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="font-medium">{selectedEvent.coach}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <IconMapPin className="h-4 w-4" />
                        Lieu
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="font-medium">{selectedEvent.location}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <IconActivity className="h-4 w-4" />
                        Niveau
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {getDifficultyLabel(selectedEvent.difficulty_level)}
                        </Badge>
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((level) => (
                            <IconStar
                              key={level}
                              className={cn(
                                "h-4 w-4",
                                level <= (selectedEvent.difficulty_level === 'all_levels' ? 1 :
                                  selectedEvent.difficulty_level === 'intermediate' ? 3 : 5)
                                  ? "text-muted-foreground fill-muted-foreground"
                                  : "text-muted-foreground"
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}