'use server'

import { createClient } from '@/lib/supabase/server'
import { deliverPendingWaitlistPromotions } from '@/lib/services/waitlist-promotion-notifier'

export async function promoteFromWaitlist(waitlistEntryId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // Get waitlist entry with user and class details
    const { data: waitlistEntry, error: waitlistError } = await supabase
      .from('class_waitlist')
      .select(`
        *,
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
            title,
            max_capacity
          )
        )
      `)
      .eq('id', waitlistEntryId)
      .single()

    if (waitlistError || !waitlistEntry) {
      return { success: false, error: 'Entrée de liste d\'attente non trouvée' }
    }

    const { profiles: user, class_schedules: schedule } = waitlistEntry

    if (!user) {
      return { success: false, error: 'Utilisateur non trouvé' }
    }

    if (!schedule) {
      return { success: false, error: 'Cours non trouvé' }
    }

    // Check if there's space in the class
    const { data: currentBookings, error: bookingsError } = await supabase
      .from('class_bookings')
      .select('id')
      .eq('schedule_id', schedule.id)
      .eq('status', 'confirmed')

    if (bookingsError) {
      return { success: false, error: 'Erreur lors de la vérification de la capacité' }
    }

    const currentCount = currentBookings?.length || 0
    const maxCapacity = schedule.classes?.max_capacity || 0

    if (currentCount >= maxCapacity) {
      return { success: false, error: 'Le cours est toujours complet' }
    }

    // Get user's subscription
    const { data: subscription, error: subscriptionError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('end_date', new Date().toISOString())
      .order('end_date', { ascending: false })
      .limit(1)
      .single()

    if (subscriptionError || !subscription) {
      return { success: false, error: 'Aucun abonnement actif trouvé pour cet utilisateur' }
    }

    // Create the booking
    const { error: bookingError } = await supabase
      .from('class_bookings')
      .insert({
        user_id: user.id,
        schedule_id: schedule.id,
        subscription_id: subscription.id,
        status: 'confirmed',
        booked_at: new Date().toISOString()
      })

    if (bookingError) {
      console.error('Error creating booking:', bookingError)
      return { success: false, error: 'Erreur lors de la création de la réservation' }
    }

    // Remove from waitlist
    const { error: removeError } = await supabase
      .from('class_waitlist')
      .delete()
      .eq('id', waitlistEntryId)

    if (removeError) {
      console.error('Error removing from waitlist:', removeError)
      // Don't fail the whole process if this fails
    }

    // NOTE: no credit deduction here. The user already paid one credit when
    // joining the waitlist; deducting again on promotion double-charged them
    // (verified in the production audit).

    // Queue the notification, then deliver it. Enqueuing goes through a
    // SECURITY DEFINER function that re-checks the admin role and that the
    // member really holds a confirmed place, so this cannot be used to send a
    // WhatsApp to an arbitrary user id. If delivery fails here the notice
    // stays queued and the cron retries it.
    const { data: enqueued, error: enqueueError } = await supabase.rpc(
      'enqueue_waitlist_promotion_notice',
      { p_user_id: user.id, p_schedule_id: schedule.id }
    )

    if (enqueueError || !(enqueued as any)?.success) {
      console.error('Could not queue waitlist promotion notice:', enqueueError || enqueued)
    } else {
      try {
        await deliverPendingWaitlistPromotions()
      } catch (error) {
        console.error('Waitlist promotion notice queued but not yet delivered:', error)
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Error in promoteFromWaitlist:', error)
    return { success: false, error: 'Une erreur inattendue s\'est produite' }
  }
}

export async function forcePromoteFromWaitlist(waitlistEntryId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // Get waitlist entry with user and class details
    const { data: waitlistEntry, error: waitlistError } = await supabase
      .from('class_waitlist')
      .select(`
        *,
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
            title,
            max_capacity
          )
        )
      `)
      .eq('id', waitlistEntryId)
      .single()

    if (waitlistError || !waitlistEntry) {
      return { success: false, error: 'Entrée de liste d\'attente non trouvée' }
    }

    const { profiles: user, class_schedules: schedule } = waitlistEntry

    if (!user) {
      return { success: false, error: 'Utilisateur non trouvé' }
    }

    if (!schedule) {
      return { success: false, error: 'Cours non trouvé' }
    }

    // Check if user already has a booking for this schedule
    const { data: existingBooking, error: existingBookingError } = await supabase
      .from('class_bookings')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('schedule_id', schedule.id)
      .single()

    if (existingBookingError && existingBookingError.code !== 'PGRST116') {
      // PGRST116 means no rows found, which is expected
      console.error('Error checking existing booking:', existingBookingError)
      return { success: false, error: 'Erreur lors de la vérification des réservations existantes' }
    }

    if (existingBooking) {
      return { success: false, error: `L'utilisateur a déjà une réservation (${existingBooking.status}) pour ce cours` }
    }

    // Get user's subscription (no capacity check for forced promotion)
    const { data: subscription, error: subscriptionError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('end_date', new Date().toISOString())
      .order('end_date', { ascending: false })
      .limit(1)
      .single()

    if (subscriptionError || !subscription) {
      return { success: false, error: 'Aucun abonnement actif trouvé pour cet utilisateur' }
    }

    // Create the booking (FORCE OVERBOOKING - no capacity check)
    const { error: bookingError } = await supabase
      .from('class_bookings')
      .insert({
        user_id: user.id,
        schedule_id: schedule.id,
        subscription_id: subscription.id,
        status: 'confirmed',
        booked_at: new Date().toISOString()
      })

    if (bookingError) {
      console.error('Error creating force booking:', bookingError)
      console.error('Booking details:', {
        user_id: user.id,
        schedule_id: schedule.id,
        subscription_id: subscription.id
      })
      return { success: false, error: `Erreur lors de la création de la réservation forcée: ${bookingError.message}` }
    }

    // Remove from waitlist
    const { error: removeError } = await supabase
      .from('class_waitlist')
      .delete()
      .eq('id', waitlistEntryId)

    if (removeError) {
      console.error('Error removing from waitlist:', removeError)
      // Don't fail the whole process if this fails
    }

    // NOTE: no credit deduction here. The user already paid one credit when
    // joining the waitlist; deducting again on promotion double-charged them
    // (verified in the production audit).

    // Queue the notification, then deliver it. Enqueuing goes through a
    // SECURITY DEFINER function that re-checks the admin role and that the
    // member really holds a confirmed place, so this cannot be used to send a
    // WhatsApp to an arbitrary user id. If delivery fails here the notice
    // stays queued and the cron retries it.
    const { data: enqueued, error: enqueueError } = await supabase.rpc(
      'enqueue_waitlist_promotion_notice',
      { p_user_id: user.id, p_schedule_id: schedule.id }
    )

    if (enqueueError || !(enqueued as any)?.success) {
      console.error('Could not queue waitlist promotion notice:', enqueueError || enqueued)
    } else {
      try {
        await deliverPendingWaitlistPromotions()
      } catch (error) {
        console.error('Waitlist promotion notice queued but not yet delivered:', error)
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Error in forcePromoteFromWaitlist:', error)
    return { success: false, error: 'Une erreur inattendue s\'est produite' }
  }
}