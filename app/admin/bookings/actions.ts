'use server'

import { createClient } from '@/lib/supabase/server'

// Mark a booking as no-show. The database function verifies the caller is an
// admin, that the booking is confirmed and that the class has started, then
// creates a 24h booking penalty (one per booking — duplicates are impossible).
export async function flagNoShow(bookingId: string): Promise<{
  success: boolean
  error?: string
  startsAt?: string
  expiresAt?: string
}> {
  try {
    const supabase = await createClient()

    const { data: result, error } = await supabase.rpc('flag_no_show', {
      p_booking_id: bookingId
    })

    if (error) {
      return { success: false, error: error.message }
    }
    if (!result?.success) {
      return { success: false, error: result?.message || 'Impossible de marquer cette absence' }
    }

    return { success: true, startsAt: result.starts_at, expiresAt: result.expires_at }
  } catch (error) {
    console.error('Error in flagNoShow:', error)
    return { success: false, error: "Une erreur inattendue s'est produite" }
  }
}

// Revert a no-show flag (restores the booking to confirmed and removes the penalty)
export async function unflagNoShow(bookingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: result, error } = await supabase.rpc('unflag_no_show', {
      p_booking_id: bookingId
    })

    if (error) {
      return { success: false, error: error.message }
    }
    if (!result?.success) {
      return { success: false, error: result?.message || "Impossible d'annuler cette absence" }
    }

    return { success: true }
  } catch (error) {
    console.error('Error in unflagNoShow:', error)
    return { success: false, error: "Une erreur inattendue s'est produite" }
  }
}
