'use client'

import { useState, useEffect, useRef } from 'react'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarView, CalendarEvent, CalendarViewType } from '@/components/admin/calendar/calendar-view'
import { ScheduleForm } from '@/components/admin/calendar/schedule-form'
import { EventDetailsModal } from '@/components/admin/calendar/event-details-modal'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { IconCalendar, IconClock, IconUsers, IconDownload } from '@tabler/icons-react'
import { toast } from 'sonner'
import jsPDF from 'jspdf'

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [currentView, setCurrentView] = useState<CalendarViewType>('day')
  const [isExporting, setIsExporting] = useState(false)
  const calendarRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const fetchEvents = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .order('start_datetime', { ascending: true })

      if (error) throw error
      setEvents(data || [])
    } catch (err) {
      console.error('Error fetching events:', err)
      setError('Erreur lors du chargement des événements')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreateEvent = (date?: Date) => {
    setSelectedDate(date || new Date())
    setSelectedEvent(null)
    setShowScheduleForm(true)
  }

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event)
  }

  const handleCloseScheduleForm = () => {
    setShowScheduleForm(false)
    fetchEvents() // Refresh events after creating/editing
  }

  const handleCloseEventDetails = () => {
    setSelectedEvent(null)
    fetchEvents() // Refresh events after any modifications
  }

  const handleEditEvent = (event: CalendarEvent) => {
    setSelectedEvent(event)
    setSelectedDate(new Date(event.start_datetime))
    setShowScheduleForm(true)
  }

  const getViewStats = () => {
    let dateRange: { start: Date; end: Date }
    let periodLabel: string

    switch (currentView) {
      case 'day':
        dateRange = {
          start: startOfDay(selectedDate),
          end: endOfDay(selectedDate)
        }
        periodLabel = format(selectedDate, 'EEEE d MMMM', { locale: fr }).replace(/(^\w|\s\w)/g, (c) => c.toUpperCase())
        break
      case 'week':
        dateRange = {
          start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
          end: endOfWeek(selectedDate, { weekStartsOn: 1 })
        }
        periodLabel = `Semaine du ${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'd MMM', { locale: fr }).replace(/(^\w|\s\w)/g, (c) => c.toUpperCase())}`
        break
      case 'month':
        dateRange = {
          start: startOfMonth(selectedDate),
          end: endOfMonth(selectedDate)
        }
        periodLabel = format(selectedDate, 'MMMM yyyy', { locale: fr }).replace(/^\w/, (c) => c.toUpperCase())
        break
      default:
        dateRange = {
          start: startOfDay(selectedDate),
          end: endOfDay(selectedDate)
        }
        periodLabel = 'Aujourd\'hui'
    }

    const periodEvents = events.filter(event => {
      const eventDate = new Date(event.start_datetime)
      return (eventDate >= dateRange.start && eventDate <= dateRange.end)
    })

    const totalBookings = periodEvents.reduce((sum, event) => sum + event.current_bookings, 0)
    const totalCapacity = periodEvents.reduce((sum, event) => sum + event.max_capacity, 0)
    // TODO: Add cancellations data from database when available
    const totalCancellations = 0 // Placeholder - will need to query cancelled bookings

    const bookingPercentage = totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 100) : 0
    const cancellationPercentage = totalCapacity > 0 ? Math.round((totalCancellations / totalCapacity) * 100) : 0

    return {
      eventsCount: periodEvents.length,
      totalBookings,
      totalCapacity,
      totalCancellations,
      bookingPercentage,
      cancellationPercentage,
      periodLabel
    }
  }

  const stats = getViewStats()

  const handleExportPDF = async () => {
    try {
      setIsExporting(true)
      toast.info('Génération du PDF en cours...')

      // Get the date range and events for current view
      let dateRange: { start: Date; end: Date }
      let periodLabel: string
      let filename: string

      switch (currentView) {
        case 'day':
          dateRange = {
            start: startOfDay(selectedDate),
            end: endOfDay(selectedDate)
          }
          periodLabel = format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })
          filename = `planning-day-${format(selectedDate, 'yyyy-MM-dd')}.pdf`
          break
        case 'week':
          const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
          const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 })
          dateRange = { start: weekStart, end: weekEnd }
          periodLabel = `Semaine du ${format(weekStart, 'd MMM', { locale: fr })} au ${format(weekEnd, 'd MMM yyyy', { locale: fr })}`
          filename = `planning-week-${format(weekStart, 'yyyy-MM-dd')}-${format(weekEnd, 'yyyy-MM-dd')}.pdf`
          break
        case 'month':
          dateRange = {
            start: startOfMonth(selectedDate),
            end: endOfMonth(selectedDate)
          }
          periodLabel = format(selectedDate, 'MMMM yyyy', { locale: fr })
          filename = `planning-month-${format(selectedDate, 'yyyy-MM')}.pdf`
          break
        default:
          dateRange = {
            start: startOfDay(selectedDate),
            end: endOfDay(selectedDate)
          }
          periodLabel = 'Planning'
          filename = 'planning.pdf'
      }

      // Filter events for the current view
      const viewEvents = events.filter(event => {
        const eventDate = new Date(event.start_datetime)
        return eventDate >= dateRange.start && eventDate <= dateRange.end
      })

      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      // Add logo and header
      await addPDFHeader(pdf, periodLabel)

      // Generate content based on view
      switch (currentView) {
        case 'day':
          await generateDayViewPDF(pdf, viewEvents, selectedDate)
          break
        case 'week':
          await generateWeekViewPDF(pdf, viewEvents, dateRange.start, dateRange.end)
          break
        case 'month':
          await generateMonthViewPDF(pdf, viewEvents, selectedDate)
          break
      }

      pdf.save(filename)
      toast.success('PDF exporté avec succès!')
    } catch (error) {
      console.error('Error exporting PDF:', error)
      toast.error('Erreur lors de l\'export PDF')
    } finally {
      setIsExporting(false)
    }
  }

  const addPDFHeader = async (pdf: jsPDF, title: string) => {
    // Add logo (if available)
    try {
      const logoResponse = await fetch('/images/logo.svg')
      if (logoResponse.ok) {
        const logoSvg = await logoResponse.text()
        // For simplicity, we'll add a text-based header instead of SVG
      }
    } catch (error) {
      // Logo not available, continue without it
    }

    // Add title
    pdf.setFontSize(20)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Planning des Cours', 20, 25)

    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'normal')
    pdf.text(title, 20, 35)

    // Add line separator
    pdf.setLineWidth(0.5)
    pdf.line(20, 40, 190, 40)
  }

  const generateDayViewPDF = async (pdf: jsPDF, dayEvents: CalendarEvent[], date: Date) => {
    let yPosition = 55

    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Planning du jour', 20, yPosition)
    yPosition += 15

    if (dayEvents.length === 0) {
      pdf.setFont('helvetica', 'normal')
      pdf.text('Aucun cours programmé pour cette journée', 20, yPosition)
      return
    }

    // Sort events by time
    const sortedEvents = dayEvents.sort((a, b) =>
      new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
    )

    pdf.setFont('helvetica', 'normal')
    sortedEvents.forEach(event => {
      if (yPosition > 270) {
        pdf.addPage()
        yPosition = 20
      }

      const startTime = format(new Date(event.start_datetime), 'HH:mm', { locale: fr })
      const endTime = format(new Date(event.end_datetime), 'HH:mm', { locale: fr })

      // Time
      pdf.setFont('helvetica', 'bold')
      pdf.text(`${startTime} - ${endTime}`, 20, yPosition)

      // Event details
      pdf.setFont('helvetica', 'normal')
      pdf.text(event.title, 60, yPosition)
      pdf.text(`Coach: ${event.coach}`, 60, yPosition + 5)
      pdf.text(`Lieu: ${event.location}`, 60, yPosition + 10)
      pdf.text(`Réservations: ${event.current_bookings}/${event.max_capacity}`, 60, yPosition + 15)

      // Add separator line
      pdf.setLineWidth(0.2)
      pdf.line(20, yPosition + 20, 190, yPosition + 20)

      yPosition += 30
    })
  }

  const generateWeekViewPDF = async (pdf: jsPDF, weekEvents: CalendarEvent[], startDate: Date, endDate: Date) => {
    let yPosition = 55

    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Planning de la semaine', 20, yPosition)
    yPosition += 15

    // Generate days of the week
    const days: Date[] = []
    let currentDay = new Date(startDate)
    while (currentDay <= endDate) {
      days.push(new Date(currentDay))
      currentDay.setDate(currentDay.getDate() + 1)
    }

    const colWidth = 25
    const startX = 20

    // Headers
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    days.forEach((day, index) => {
      const dayName = format(day, 'EEE d', { locale: fr })
      pdf.text(dayName, startX + (index * colWidth), yPosition)
    })

    yPosition += 10
    pdf.setLineWidth(0.3)
    pdf.line(startX, yPosition, startX + (days.length * colWidth), yPosition)
    yPosition += 5

    // Get unique time slots
    const timeSlots = new Set<string>()
    weekEvents.forEach(event => {
      const time = format(new Date(event.start_datetime), 'HH:mm')
      timeSlots.add(time)
    })

    const sortedTimeSlots = Array.from(timeSlots).sort()

    // Render events by time slot
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)

    sortedTimeSlots.forEach(timeSlot => {
      if (yPosition > 260) {
        pdf.addPage()
        yPosition = 20
      }

      pdf.setFont('helvetica', 'bold')
      pdf.text(timeSlot, startX, yPosition)

      const rowEvents = weekEvents.filter(event =>
        format(new Date(event.start_datetime), 'HH:mm') === timeSlot
      )

      let maxLines = 1
      days.forEach((day, dayIndex) => {
        const dayEvents = rowEvents.filter(event => {
          const eventDate = new Date(event.start_datetime)
          return format(eventDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
        })

        let lineOffset = 0
        dayEvents.forEach(event => {
          const x = startX + (dayIndex * colWidth)
          pdf.setFont('helvetica', 'normal')
          pdf.text(event.title.substring(0, 10), x, yPosition + 3 + (lineOffset * 3))
          pdf.text(event.coach.substring(0, 8), x, yPosition + 6 + (lineOffset * 3))
          lineOffset += 2
          maxLines = Math.max(maxLines, lineOffset)
        })
      })

      yPosition += Math.max(15, maxLines * 3 + 5)

      // Separator line
      pdf.setLineWidth(0.1)
      pdf.line(startX, yPosition - 2, startX + (days.length * colWidth), yPosition - 2)
    })
  }

  const generateMonthViewPDF = async (pdf: jsPDF, monthEvents: CalendarEvent[], date: Date) => {
    let yPosition = 55

    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Planning du mois', 20, yPosition)
    yPosition += 15

    // Create monthly grid
    const monthStart = startOfMonth(date)
    const monthEnd = endOfMonth(date)
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

    const days = []
    let currentDay = new Date(calendarStart)
    while (currentDay <= calendarEnd) {
      days.push(new Date(currentDay))
      currentDay.setDate(currentDay.getDate() + 1)
    }

    const colWidth = 24
    const rowHeight = 25
    const startX = 20

    // Day headers
    const dayHeaders = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    dayHeaders.forEach((header, index) => {
      pdf.text(header, startX + (index * colWidth) + 2, yPosition)
    })

    yPosition += 5
    pdf.setLineWidth(0.3)
    pdf.line(startX, yPosition, startX + (7 * colWidth), yPosition)
    yPosition += 5

    // Calendar grid
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)

    const weeks = Math.ceil(days.length / 7)
    for (let week = 0; week < weeks; week++) {
      const weekStart = week * 7
      const weekEnd = Math.min(weekStart + 7, days.length)

      // Draw grid
      for (let day = weekStart; day < weekEnd; day++) {
        const dayDate = days[day]
        const dayX = startX + ((day % 7) * colWidth)
        const dayY = yPosition + (week * rowHeight)

        // Draw cell border
        pdf.setLineWidth(0.2)
        pdf.rect(dayX, dayY, colWidth, rowHeight)

        // Day number
        pdf.setFont('helvetica', 'bold')
        const isCurrentMonth = dayDate.getMonth() === date.getMonth()
        if (!isCurrentMonth) {
          pdf.setTextColor(150, 150, 150)
        } else {
          pdf.setTextColor(0, 0, 0)
        }

        pdf.text(format(dayDate, 'd'), dayX + 2, dayY + 8)

        // Events for this day
        const dayEvents = monthEvents.filter(event => {
          const eventDate = new Date(event.start_datetime)
          return format(eventDate, 'yyyy-MM-dd') === format(dayDate, 'yyyy-MM-dd')
        })

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(6)
        pdf.setTextColor(0, 0, 0)

        dayEvents.slice(0, 3).forEach((event, eventIndex) => {
          const eventY = dayY + 12 + (eventIndex * 3)
          const eventTime = format(new Date(event.start_datetime), 'HH:mm')
          const eventText = `${eventTime} ${event.title.substring(0, 8)}`
          pdf.text(eventText, dayX + 1, eventY)
        })

        if (dayEvents.length > 3) {
          pdf.text(`+${dayEvents.length - 3} autres`, dayX + 1, dayY + 21)
        }
      }
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Planning des Cours</h1>
        </div>
        <div className="text-center py-12">
          <IconCalendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Chargement du calendrier...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-3xl font-bold">Planning des Cours</h1>
        <Button
          onClick={handleExportPDF}
          variant="outline"
          disabled={isExporting}
          className="gap-2"
        >
          <IconDownload className="h-4 w-4" />
          {isExporting ? 'Export en cours...' : 'Exporter en PDF'}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cours - {stats.periodLabel}</CardTitle>
            <IconCalendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.eventsCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Réservations - {stats.periodLabel}</CardTitle>
            <IconUsers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.bookingPercentage}%</div>
            <p className="text-xs text-muted-foreground">{stats.totalBookings} sur {stats.totalCapacity} places</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Annulations - {stats.periodLabel}</CardTitle>
            <IconClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.cancellationPercentage}%</div>
            <p className="text-xs text-muted-foreground">{stats.totalCancellations} sur {stats.totalCapacity} places</p>
          </CardContent>
        </Card>

      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Calendar */}
      <div ref={calendarRef}>
        <CalendarView
          events={events}
          onEventClick={handleEventClick}
          onCreateEvent={handleCreateEvent}
          onDateChange={setSelectedDate}
          onViewChange={(view) => {
            setCurrentView(view)
          }}
        />
      </div>

      {/* Schedule Form Modal */}
      {showScheduleForm && (
        <ScheduleForm
          event={selectedEvent}
          selectedDate={selectedDate}
          onClose={handleCloseScheduleForm}
        />
      )}

      {/* Event Details Modal */}
      {selectedEvent && !showScheduleForm && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={handleCloseEventDetails}
          onEdit={handleEditEvent}
        />
      )}
    </div>
  )
}