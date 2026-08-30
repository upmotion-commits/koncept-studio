import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ForgotPasswordForm from './forgot-password-form'
import { Card, CardContent } from '@/components/ui/card'

export default async function ForgotPasswordPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/espace')
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-muted/10 to-background p-4 relative">
      {/* Background Effects */}
      <div className="absolute inset-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-primary/5 to-transparent" />

      <div className="relative z-10 max-w-md w-full">
        <Card className="shadow-brutal border-2 border-border bg-card/95 backdrop-blur-sm animate-slide-up">
          <CardContent className="pt-8">
            <Suspense>
              <ForgotPasswordForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}