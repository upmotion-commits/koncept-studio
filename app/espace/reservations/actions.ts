'use server'

import { createClient } from '@/lib/supabase/server'
import { deliverPendingWaitlistPromotions } from '@/lib/services/waitlist-promotion-notifier'

/**
 * Deliver any waitlist-promotion notices that are still pending.
 *
 * Called right after a member cancels, because that cancellation is what
 * usually frees the place. It only drains the queue the database wrote — it
 * takes no arguments and cannot be pointed at a member of the caller's
 * choosing — so requiring a signed-in caller is sufficient authorization.
 * The cron re-runs it for anything this call misses.
 */
export async function flushWaitlistPromotionNotices(): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Utilisateur non authentifié' }
    }

    await deliverPendingWaitlistPromotions()
    return { success: true }
  } catch (error) {
    console.error('Error delivering waitlist promotion notices:', error)
    return { success: false, error: 'Erreur lors de l\'envoi de la notification' }
  }
}

interface AdminBookClassParams {
  userId: string
  scheduleId: string
  adminId: string
}

export async function adminBookClass({
  userId,
  scheduleId,
  adminId
}: AdminBookClassParams): Promise<{ success: boolean; error?: string; bookingId?: string }> {
  try {
    const supabase = await createClient()

    // Atomic, capacity-safe admin booking. Authorization (admin role) is
    // enforced inside the database function via auth.uid().
    const { data: result, error } = await supabase.rpc('admin_book_class_v2', {
      p_user_id: userId,
      p_schedule_id: scheduleId
    })

    if (error) {
      if (error.message?.includes('capacité maximale')) {
        return { success: false, error: 'Le cours est complet' }
      }
      return { success: false, error: error.message }
    }

    if (!result?.success) {
      return { success: false, error: result?.message || 'Erreur lors de la création de la réservation' }
    }

    return { success: true, bookingId: result.booking_id }
  } catch (error) {
    console.error('Error in adminBookClass:', error)
    return { success: false, error: 'Une erreur inattendue s\'est produite' }
  }
}
