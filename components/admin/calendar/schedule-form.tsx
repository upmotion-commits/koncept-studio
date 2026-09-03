'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addDays, addWeeks, addMonths, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarEvent } from './calendar-view'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { IconCalendar, IconClock, IconRepeat, IconX } from '@tabler/icons-react'

interface ScheduleFormProps {
  event?: CalendarEvent | null
  selectedDate: Date
  onClose: () => void
}

interface Class {
  id: string
  title: string
  description: string
  duration: number
  coach: string
  location: string
  difficulty_level: string
  max_capacity: number
}

interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number
  daysOfWeek?: number[] // 0 = Sunday, 1 = Monday, etc.
  endDate?: string
  exceptionDates?: string[] // Array of dates to exclude from the series
}

interface ScheduleFormData {
  class_id: string
  start_date: string
  start_time: string
  end_time: string
  is_recurring: boolean
  recurrence_rule?: RecurrenceRule
  recurrence_end_date?: string
}

export function ScheduleForm({ event, selectedDate, onClose }: ScheduleFormProps) {
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState<ScheduleFormData>({
    class_id: '',
    start_date: format(selectedDate, 'yyyy-MM-dd'),
    start_time: '09:00',
    end_time: '10:00',
    is_recurring: false,
  })

  const supabase = createClient()

  useEffect(() => {
    fetchClasses()
    if (event) {
      populateFormFromEvent(event)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])

  // Auto-calculate end time when class or start time changes
  useEffect(() => {
    if (formData.class_id && formData.start_time) {
      const selectedClass = classes.find(c => c.id === formData.class_id)
      if (selectedClass) {
        const startTime = new Date(`2000-01-01T${formData.start_time}`)
        const endTime = new Date(startTime.getTime() + selectedClass.duration * 60000)
        const endTimeString = endTime.toTimeString().slice(0, 5)
        
        setFormData(prev => ({ ...prev, end_time: endTimeString }))
      }
    }
  }, [formData.class_id, formData.start_time, classes])

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('title')

      if (error) throw error
      setClasses(data || [])
    } catch (err) {
      console.error('Error fetching classes:', err)
      setError('Erreur lors du chargement des cours')
    }
  }

  const populateFormFromEvent = (event: CalendarEvent) => {
    const startDate = new Date(event.start_datetime)
    const endDate = new Date(event.end_datetime)

    setFormData({
      class_id: event.class_id,
      start_date: format(startDate, 'yyyy-MM-dd'),
      start_time: format(startDate, 'HH:mm'),
      end_time: format(endDate, 'HH:mm'),
      is_recurring: event.is_recurring,
      recurrence_rule: event.recurrence_rule,
      recurrence_end_date: event.recurrence_rule?.endDate
    })
  }

  const handleInputChange = (field: keyof ScheduleFormData, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value }
      
      // Sync recurrence_end_date with recurrence_rule.endDate
      if (field === 'recurrence_end_date') {
        updated.recurrence_rule = {
          ...updated.recurrence_rule,
          endDate: value
        } as RecurrenceRule
      }
      
      return updated
    })
  }

  const handleRecurrenceChange = (field: keyof RecurrenceRule, value: any) => {
    setFormData(prev => ({
      ...prev,
      recurrence_rule: {
        frequency: 'daily',
        interval: 1,
        ...prev.recurrence_rule,
        [field]: value
      } as RecurrenceRule
    }))
  }

  const handleDayOfWeekToggle = (day: number, checked: boolean) => {
    const currentDays = formData.recurrence_rule?.daysOfWeek || []
    const alreadyChecked = currentDays.includes(day)

    if (alreadyChecked === checked) {
      return // Already in the desired state
    }

    const newDays = checked
      ? [...currentDays, day].sort()
      : currentDays.filter(d => d !== day)

    setFormData({
      ...formData,
      recurrence_rule: {
        frequency: 'weekly' as const,
        interval: formData.recurrence_rule?.interval || 1,
        daysOfWeek: newDays,
        endDate: formData.recurrence_rule?.endDate,
        exceptionDates: formData.recurrence_rule?.exceptionDates
      }
    })
  }

  const generateRecurringEvents = (
    startDateTime: Date,
    endDateTime: Date,
    rule: RecurrenceRule
  ): { start_datetime: string; end_datetime: string }[] => {
    const events: { start_datetime: string; end_datetime: string }[] = []
    const duration = endDateTime.getTime() - startDateTime.getTime()

    // Set default end dates based on frequency if not provided
    let defaultEndDate: Date
    if (rule.frequency === 'daily') {
      defaultEndDate = addDays(startDateTime, 30) // 30 days for daily
    } else if (rule.frequency === 'weekly') {
      defaultEndDate = addWeeks(startDateTime, 12) // 12 weeks (3 months) for weekly
    } else if (rule.frequency === 'monthly') {
      defaultEndDate = addMonths(startDateTime, 12) // 1 year for monthly
    } else {
      defaultEndDate = addDays(startDateTime, 365) // fallback
    }

    const endDate = rule.endDate ? new Date(rule.endDate) : defaultEndDate
    const exceptionDates = rule.exceptionDates || []
    
    const isExceptionDate = (date: Date): boolean => {
      const dateString = format(date, 'yyyy-MM-dd')
      return exceptionDates.includes(dateString)
    }
    
    if (rule.frequency === 'daily') {
      let currentDate = new Date(startDateTime)
      while (currentDate <= endDate) {
        if (!isExceptionDate(currentDate)) {
          const eventEnd = new Date(currentDate.getTime() + duration)
          events.push({
            start_datetime: currentDate.toISOString(),
            end_datetime: eventEnd.toISOString()
          })
        }
        currentDate = addDays(currentDate, rule.interval || 1)
        // Safety limit: prevent infinite loops
        if (events.length > 500) {
          break
        }
      }
    } else if (rule.frequency === 'weekly') {
      if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
        // For weekly with specific days, we iterate through weeks
        let currentWeek = startOfWeek(startDateTime, { weekStartsOn: 1 })
        let weekCount = 0
        
        while (currentWeek <= endDate) {
          // Only process this week if it matches our interval
          if (weekCount % (rule.interval || 1) === 0) {
            for (const dayOfWeek of rule.daysOfWeek) {
              const eventDate = new Date(currentWeek)
              const daysToAdd = dayOfWeek === 0 ? 6 : dayOfWeek - 1
              eventDate.setDate(currentWeek.getDate() + daysToAdd)
              eventDate.setHours(startDateTime.getHours(), startDateTime.getMinutes(), startDateTime.getSeconds(), 0)
              
              // Check if event date is within our range and not an exception
              if (eventDate >= startDateTime && eventDate <= endDate && !isExceptionDate(eventDate)) {
                const eventEnd = new Date(eventDate.getTime() + duration)
                events.push({
                  start_datetime: eventDate.toISOString(),
                  end_datetime: eventEnd.toISOString()
                })
              }
            }
          }
          currentWeek = addWeeks(currentWeek, 1)
          weekCount++
          // Safety limit
          if (events.length > 1000 || weekCount > 500) {
            break
          }
        }
      } else {
        // For weekly without specific days, use the original start day
        let currentDate = new Date(startDateTime)
        while (currentDate <= endDate) {
          if (!isExceptionDate(currentDate)) {
            const eventEnd = new Date(currentDate.getTime() + duration)
            events.push({
              start_datetime: currentDate.toISOString(),
              end_datetime: eventEnd.toISOString()
            })
          }
          currentDate = addWeeks(currentDate, rule.interval || 1)
          // Safety limit
          if (events.length > 1000) {
            break
          }
        }
      }
    } else if (rule.frequency === 'monthly') {
      let currentDate = new Date(startDateTime)
      let monthCount = 0
      
      while (currentDate <= endDate) {
        // Only create event if it matches our interval
        if (monthCount % (rule.interval || 1) === 0) {
          if (!isExceptionDate(currentDate)) {
            const eventEnd = new Date(currentDate.getTime() + duration)
            events.push({
              start_datetime: currentDate.toISOString(),
              end_datetime: eventEnd.toISOString()
            })
          }
        }
        
        // Always advance by one month and increment counter
        currentDate = addMonths(currentDate, 1)
        monthCount++
        
        // Safety limits
        if (events.length > 1000 || monthCount > 500) {
          break
        }
      }
    }

    return events
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const selectedClass = classes.find(c => c.id === formData.class_id)
      if (!selectedClass) {
        throw new Error('Cours sélectionné introuvable')
      }

      const startDateTime = new Date(`${formData.start_date}T${formData.start_time}`)
      const endDateTime = new Date(`${formData.start_date}T${formData.end_time}`)

      // Check if recurring based on days selected
      const isRecurring = formData.recurrence_rule?.daysOfWeek && formData.recurrence_rule.daysOfWeek.length > 0

      if (isRecurring && formData.recurrence_rule) {
        // Generate all recurring events
        const recurringEvents = generateRecurringEvents(
          startDateTime,
          endDateTime,
          formData.recurrence_rule
        )

        // Create only the individual occurrences (no parent schedule needed)
        const scheduleInserts = recurringEvents.map(eventData => ({
          class_id: formData.class_id,
          start_datetime: eventData.start_datetime,
          end_datetime: eventData.end_datetime,
          is_recurring: true,
          recurrence_rule: formData.recurrence_rule,
          recurrence_end_date: formData.recurrence_end_date
        }))

        const { error: instancesError } = await supabase
          .from('class_schedules')
          .insert(scheduleInserts)

        if (instancesError) throw instancesError

      } else {
        // Create single event
        const { error } = await supabase
          .from('class_schedules')
          .insert({
            class_id: formData.class_id,
            start_datetime: startDateTime.toISOString(),
            end_datetime: endDateTime.toISOString(),
            is_recurring: false
          })

        if (error) throw error
      }

      onClose()
    } catch (err: any) {
      console.error('Error creating schedule:', err)
      setError(err.message || 'Erreur lors de la création du planning')
    } finally {
      setLoading(false)
    }
  }

  const weekDays = [
    { value: 1, label: 'Lundi' },
    { value: 2, label: 'Mardi' },
    { value: 3, label: 'Mercredi' },
    { value: 4, label: 'Jeudi' },
    { value: 5, label: 'Vendredi' },
    { value: 6, label: 'Samedi' },
    { value: 0, label: 'Dimanche' },
  ]

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {event ? 'Modifier le Planning' : 'Planifier un Cours'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

          {/* Class Selection */}
          <div className="space-y-2">
            <Label htmlFor="class_id">Cours</Label>
            <Select
              value={formData.class_id}
              onValueChange={(value) => handleInputChange('class_id', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un cours" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    <div className="flex items-center justify-between w-full">
                      <span>{cls.title}</span>
                      <Badge variant="outline" className="ml-2">
                        {cls.duration}min
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="start_date">Date</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => handleInputChange('start_date', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start_time">Heure de début</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) => handleInputChange('start_time', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_time">Heure de fin</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time}
                onChange={(e) => handleInputChange('end_time', e.target.value)}
                required
              />
            </div>
          </div>

          {/* Recurring Options */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <IconRepeat className="h-5 w-5" />
                  Répéter ?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Days of Week */}
                <div className="space-y-3">
                  <Label>Jours de la semaine</Label>
                  <p className="text-sm text-muted-foreground">
                    Sélectionnez les jours où le cours doit se répéter (laisser vide pour un cours unique)
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {weekDays.map(day => {
                      const isChecked = (formData.recurrence_rule?.daysOfWeek || []).includes(day.value)
                      return (
                        <div
                          key={day.value}
                          className={`flex items-center space-x-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                            isChecked
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                          onClick={() => handleDayOfWeekToggle(day.value, !isChecked)}
                        >
                          <div className="h-4 w-4 shrink-0 rounded-sm border border-primary flex items-center justify-center" style={{
                            backgroundColor: isChecked ? 'currentColor' : 'transparent'
                          }}>
                            {isChecked && (
                              <svg width="12" height="12" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="white" fillRule="evenodd" clipRule="evenodd"></path>
                              </svg>
                            )}
                          </div>
                          <span className="text-sm font-medium flex-1">
                            {day.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {formData.recurrence_rule?.daysOfWeek && formData.recurrence_rule.daysOfWeek.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formData.recurrence_rule.daysOfWeek.length} jour{formData.recurrence_rule.daysOfWeek.length > 1 ? 's' : ''} sélectionné{formData.recurrence_rule.daysOfWeek.length > 1 ? 's' : ''}
                    </p>
                  )}
                </div>

                {/* End Date - only show if days are selected */}
                {formData.recurrence_rule?.daysOfWeek && formData.recurrence_rule.daysOfWeek.length > 0 && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="recurrence_end_date">Date de fin (optionnel)</Label>
                      <Input
                        id="recurrence_end_date"
                        type="date"
                        value={formData.recurrence_end_date || ''}
                        onChange={(e) => handleInputChange('recurrence_end_date', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Par défaut: 12 semaines à partir de la date de début
                      </p>
                    </div>

                    {/* Exception Dates */}
                    <div className="space-y-2">
                      <Label>Dates d'exception (cours annulés)</Label>
                      <p className="text-sm text-muted-foreground">
                        Spécifiez les dates où le cours ne doit pas avoir lieu
                      </p>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            type="date"
                            placeholder="Ajouter une date d'exception"
                            id="exception-date-input"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const input = e.target as HTMLInputElement
                                if (input.value) {
                                  const currentExceptions = formData.recurrence_rule?.exceptionDates || []
                                  if (!currentExceptions.includes(input.value)) {
                                    handleRecurrenceChange('exceptionDates', [...currentExceptions, input.value])
                                  }
                                  input.value = ''
                                }
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const input = document.getElementById('exception-date-input') as HTMLInputElement
                              if (input && input.value) {
                                const currentExceptions = formData.recurrence_rule?.exceptionDates || []
                                if (!currentExceptions.includes(input.value)) {
                                  handleRecurrenceChange('exceptionDates', [...currentExceptions, input.value])
                                }
                                input.value = ''
                              }
                            }}
                          >
                            Ajouter
                          </Button>
                        </div>

                        {formData.recurrence_rule?.exceptionDates && formData.recurrence_rule.exceptionDates.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {formData.recurrence_rule.exceptionDates.map((date, index) => (
                              <Badge key={index} variant="secondary" className="flex items-center gap-1">
                                {format(new Date(date), 'dd/MM/yyyy', { locale: fr })}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto p-0 w-4 h-4"
                                  onClick={() => {
                                    const newExceptions = formData.recurrence_rule?.exceptionDates?.filter((_, i) => i !== index) || []
                                    handleRecurrenceChange('exceptionDates', newExceptions)
                                  }}
                                >
                                  <IconX className="h-3 w-3" />
                                </Button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Recurrence Summary */}
                    <Alert>
                      <IconRepeat className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-1">
                          <p className="font-semibold">Résumé:</p>
                          <ul className="text-sm space-y-1 ml-4 list-disc">
                            <li>
                              Cours chaque semaine le{' '}
                              {formData.recurrence_rule.daysOfWeek.map(d => weekDays.find(wd => wd.value === d)?.label).join(', ')}
                            </li>
                            <li>
                              {formData.recurrence_end_date
                                ? `Jusqu'au ${format(new Date(formData.recurrence_end_date), 'dd/MM/yyyy', { locale: fr })}`
                                : 'Pendant 12 semaines par défaut'
                              }
                            </li>
                            {formData.recurrence_rule.exceptionDates && formData.recurrence_rule.exceptionDates.length > 0 && (
                              <li>{formData.recurrence_rule.exceptionDates.length} date(s) d'exception</li>
                            )}
                          </ul>
                        </div>
                      </AlertDescription>
                    </Alert>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
          </div>

          {/* Actions - Sticky Footer */}
          <div className="flex justify-end space-x-2 pt-4 border-t bg-background">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Création...' : event ? 'Modifier' : 'Planifier'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}