'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { UserSubscriptionView } from '@/components/user/subscription/user-subscription-view'
import { LoadingSpinner } from '@/components/ui/loading'

export default function UserSubscriptionPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [currentSubscriptions, setCurrentSubscriptions] = useState<any[]>([])
  const [subscriptionHistory, setSubscriptionHistory] = useState<any[]>([])
  const [recentBookings, setRecentBookings] = useState<any[]>([])
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

        // Get user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        // Get all current active subscriptions with plan details
        const { data: currentSubscriptions } = await supabase
          .from('user_subscriptions')
          .select(`
            *,
            subscription_plans (*)
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .gt('end_date', new Date().toISOString())
          .order('end_date', { ascending: false })

        // Get subscription history
        const { data: subscriptionHistory } = await supabase
          .from('user_subscriptions')
          .select(`
            *,
            subscription_plans (name, type)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        // Get recent bookings for usage stats
        const { data: recentBookings } = await supabase
          .from('class_bookings')
          .select(`
            *,
            class_schedules (
              start_datetime,
              classes (title)
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'confirmed')
          .order('booked_at', { ascending: false })
          .limit(20)

        setUser(user)
        setProfile(profile)
        setCurrentSubscriptions(currentSubscriptions || [])
        setSubscriptionHistory(subscriptionHistory || [])
        setRecentBookings(recentBookings || [])
      } catch (error) {
        console.error('Error initializing page:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initializePage()
  }, [router, supabase])

  if (isLoading || !profile) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <LoadingSpinner message="Chargement de votre abonnement" />
        </div>
      </div>
    )
  }

  return (
    <UserSubscriptionView
      user={profile}
      currentSubscriptions={currentSubscriptions}
      subscriptionHistory={subscriptionHistory}
      recentBookings={recentBookings}
    />
  )
}