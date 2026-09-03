'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { UserReservationsView } from '@/components/user/reservations/user-reservations-view'
import { LoadingSpinner } from '@/components/ui/loading'

export default function UserReservationsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const initializePage = async () => {
      try {
        setIsLoading(true)

        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        // Check if user is admin and redirect to admin area
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (userProfile?.role === 'admin') {
          router.push('/admin')
          return
        }

        // Get user profile for subscription status
        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_status')
          .eq('id', user.id)
          .single()

        setUser(user)
        setProfile(profile)
      } catch (error) {
        console.error('Error initializing page:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initializePage()
  }, [router, supabase])

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <LoadingSpinner message="Chargement de vos réservations" />
        </div>
      </div>
    )
  }

  return (
    <UserReservationsView
      userId={user.id}
      userSubscriptionStatus={profile?.subscription_status}
    />
  )
}