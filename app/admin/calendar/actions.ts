'use server'

import { createClient } from '@/lib/supabase/server'
import { whatsappServerService } from '@/lib/services/server'
import { generateClassCancellationMessage } from '@/lib/utils/whatsapp-messages'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface DeleteClassEventParams {
  eventId: string
  deleteType: 'single' | 'all_recurring'
  classId?: string
}

interface CancelClassEventParams {
  eventId: string
}

export async function deleteClassEvent({
  eventId,
  deleteType,
  classId
}: DeleteClassEventParams): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // First get affected bookings and user details
    let scheduleIds: string[] = []

    if (deleteType === 'single') {
      scheduleIds = [eventId]
    } else if (deleteType === 'all_recurring' && classId) {
      // Get all recurring schedules for this class
      const { data: recurringSchedules, error: recurringError } = await supabase
        .from('class_schedules')
        .select('id')
        .eq('class_id', classId)
        .eq('is_recurring', true)

      if (recurringError) {
        console.error('Error fetching recurring schedules:', recurringError)
        return { success: false, error: 'Erreur lors de la récupération des cours récurrents' }
      }

      scheduleIds = recurringSchedules?.map(s => s.id) || []
    }

    if (scheduleIds.length === 0) {
      return { success: false, error: 'Aucun cours trouvé à supprimer' }
    }

    // Get affected bookings with user and schedule details
    const { data: bookings, error: bookingsError } = await supabase
      .from('class_bookings')
      .select(`
        id,
        user_id,
        schedule_id,
        subscription_id,
        profiles!user_id (
          id,
          full_name,
          email,
          phone
        ),
        class_schedules!schedule_id (
          id,
          start_datetime,
          classes (
            title
          )
        ),
        user_subscriptions!subscription_id (
          id,
          credits_remaining,
          credits_used
        )
      `)
      .in('schedule_id', scheduleIds)
      .eq('status', 'confirmed')

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError)
      // Continue with deletion even if we can't get bookings
    }

    // Cancel + refund every confirmed booking (and waitlist entry) on the
    // affected FUTURE schedules, type-aware (weekly credit for abonnement,
    // carnet credit otherwise), atomically per schedule. Past classes are not
    // refunded — those credits were legitimately consumed. This replaces the
    // old logic that always credited `credits_remaining` (wrong field for
    // abonnement users) and refunded historical bookings.
    for (const scheduleId of scheduleIds) {
      const { data: refundResult, error: refundError } = await supabase.rpc(
        'admin_refund_schedule_bookings',
        { p_schedule_id: scheduleId }
      )
      if (refundError || !refundResult?.success) {
        console.error(`Error refunding schedule ${scheduleId}:`, refundError || refundResult)
        return { success: false, error: 'Erreur lors du remboursement des réservations. Suppression annulée.' }
      }
    }

    // Delete the class schedule(s)
    if (deleteType === 'single') {
      const { error } = await supabase
        .from('class_schedules')
        .delete()
        .eq('id', eventId)

      if (error) {
        console.error('Error deleting single event:', error)
        return { success: false, error: 'Erreur lors de la suppression du cours' }
      }
    } else if (deleteType === 'all_recurring' && classId) {
      const { error } = await supabase
        .from('class_schedules')
        .delete()
        .eq('class_id', classId)
        .eq('is_recurring', true)

      if (error) {
        console.error('Error deleting recurring events:', error)
        return { success: false, error: 'Erreur lors de la suppression des cours récurrents' }
      }
    }

    // Send WhatsApp notifications to affected users
    if (bookings && bookings.length > 0) {
      const notificationPromises = bookings
        .filter(booking => (booking.profiles as any)?.phone) // Only users with phone numbers
        .map(async (booking) => {
          try {
            const user = booking.profiles as any
            const schedule = booking.class_schedules as any

            if (!user || !schedule || !user.phone) return

            const classDate = format(new Date(schedule.start_datetime), 'EEEE dd MMMM yyyy', { locale: fr })
            const classTime = format(new Date(schedule.start_datetime), 'HH:mm', { locale: fr })

            const message = generateClassCancellationMessage(
              user,
              schedule.classes?.title || 'Cours',
              classDate,
              classTime
            )

            await whatsappServerService.sendMessage({
              phoneNumber: user.phone,
              message,
              eventType: 'class_cancellation',
              userId: user.id
            })

            console.log(`WhatsApp cancellation notification sent to ${user.email}`)
          } catch (error) {
            console.error(`Error sending WhatsApp notification to user:`, error)
            // Don't fail the whole process if individual notifications fail
          }
        })

      // Send all notifications concurrently
      await Promise.allSettled(notificationPromises)
    }

    return { success: true }
  } catch (error) {
    console.error('Error in deleteClassEvent:', error)
    return { success: false, error: 'Une erreur inattendue s\'est produite' }
  }
}

export async function cancelClassEvent({
  eventId
}: CancelClassEventParams): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // Get affected bookings with user and schedule details before cancelling
    const { data: bookings, error: bookingsError } = await supabase
      .from('class_bookings')
      .select(`
        id,
        user_id,
        schedule_id,
        subscription_id,
        profiles!user_id (
          id,
          full_name,
          email,
          phone
        ),
        class_schedules!schedule_id (
          id,
          start_datetime,
          classes (
            title
          )
        ),
        user_subscriptions!subscription_id (
          id,
          credits_remaining,
          credits_used
        )
      `)
      .eq('schedule_id', eventId)
      .eq('status', 'confirmed')

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError)
      // Continue with cancellation even if we can't get bookings
    }

    // Cancel + refund every confirmed booking and waitlist entry, type-aware
    // and atomic (see deleteClassEvent above for details).
    const { data: refundResult, error: refundError } = await supabase.rpc(
      'admin_refund_schedule_bookings',
      { p_schedule_id: eventId }
    )
    if (refundError || !refundResult?.success) {
      console.error(`Error refunding schedule ${eventId}:`, refundError || refundResult)
      return { success: false, error: 'Erreur lors du remboursement des réservations. Annulation interrompue.' }
    }

    // Cancel the event
    const { error } = await supabase
      .from('class_schedules')
      .update({
        is_cancelled: true,
        cancellation_reason: 'Annulé par l\'administrateur'
      })
      .eq('id', eventId)

    if (error) {
      console.error('Error cancelling event:', error)
      return { success: false, error: 'Erreur lors de l\'annulation du cours' }
    }

    // Send WhatsApp notifications to affected users
    if (bookings && bookings.length > 0) {
      const notificationPromises = bookings
        .filter(booking => (booking.profiles as any)?.phone) // Only users with phone numbers
        .map(async (booking) => {
          try {
            const user = booking.profiles as any
            const schedule = booking.class_schedules as any

            if (!user || !schedule || !user.phone) return

            const classDate = format(new Date(schedule.start_datetime), 'EEEE dd MMMM yyyy', { locale: fr })
            const classTime = format(new Date(schedule.start_datetime), 'HH:mm', { locale: fr })

            const message = generateClassCancellationMessage(
              user,
              schedule.classes?.title || 'Cours',
              classDate,
              classTime
            )

            await whatsappServerService.sendMessage({
              phoneNumber: user.phone,
              message,
              eventType: 'class_cancellation',
              userId: user.id
            })

            console.log(`WhatsApp cancellation notification sent to ${user.email}`)
          } catch (error) {
            console.error(`Error sending WhatsApp notification to user:`, error)
            // Don't fail the whole process if individual notifications fail
          }
        })

      // Send all notifications concurrently
      await Promise.allSettled(notificationPromises)
    }

    return { success: true }
  } catch (error) {
    console.error('Error in cancelClassEvent:', error)
    return { success: false, error: 'Une erreur inattendue s\'est produite' }
  }
}