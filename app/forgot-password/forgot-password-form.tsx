'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { validateInput, emailSchema } from '@/lib/validation'
import Image from 'next/image'
import { MESSAGES } from '@/constants'
import { CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Surface errors coming back from the email-link flow (previously the
  // ?error= query param was silently ignored and users saw a dead end)
  useEffect(() => {
    const error = searchParams.get('error')
    if (error === 'invalid_link') {
      toast.error('Lien invalide ou expiré', {
        description: 'Veuillez demander un nouveau lien de réinitialisation ci-dessous.'
      })
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (loading) return

    setLoading(true)

    try {
      // Validate email
      const validation = validateInput(emailSchema, email)

      if (!validation.success) {
        const errorMessage = validation.errors?.[0] || 'Email invalide'
        toast.error(errorMessage)
        return
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
      })

      if (error) {
        if (error.message.includes('Email not found')) {
          toast.error('Aucun compte associé à cette adresse email')
        } else {
          toast.error(error.message || 'Une erreur est survenue')
        }
        return
      }

      setSent(true)
      toast.success('Email de réinitialisation envoyé !')

    } catch (error) {
      toast.error('Une erreur est survenue lors de l\'envoi')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <>
        <CardHeader className="text-center space-y-4 pb-8">
          <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center shadow-soft">
            <svg
              className="w-8 h-8 text-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div>
            <CardTitle className="text-3xl font-bold text-gradient mb-2">Email envoyé !</CardTitle>
            <CardDescription className="text-muted-foreground">
              Si un compte existe avec cette adresse email, vous recevrez un lien de réinitialisation sous peu.
            </CardDescription>
          </div>
        </CardHeader>
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Vérifiez également vos spams si vous ne recevez rien.
          </p>
          <Button
            onClick={() => router.push('/login')}
            className="w-full h-12 shadow-soft hover:shadow-brutal transition-all font-semibold"
            size="lg"
          >
            Retour à la connexion
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <CardHeader className="text-center space-y-4 pb-8">
        <div className="mx-auto w-16 h-16 flex items-center justify-center">
          <Image
            src="/images/logo.svg"
            alt="Koncept Studio Logo"
            width={64}
            height={64}
            className="w-16 h-16 dark:invert"
          />
        </div>
        <div>
          <CardTitle className="text-3xl font-bold text-gradient mb-2">Mot de passe oublié</CardTitle>
          <CardDescription className="text-muted-foreground">
            Saisissez votre email pour recevoir un lien de réinitialisation
          </CardDescription>
        </div>
      </CardHeader>
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-6">
        <div className="space-y-3">
          <Label htmlFor="email" className="text-sm font-medium">
            Adresse email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder={MESSAGES.PLACEHOLDERS.EMAIL}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 px-4 border-border focus:border-primary focus:ring-primary/20 transition-all"
          />
        </div>
      </div>

      <div className="space-y-4">
        <Button
          type="submit"
          disabled={loading}
          className="w-full h-12 shadow-soft hover:shadow-brutal transition-all font-semibold"
          size="lg"
        >
          {loading ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
        </Button>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Vous recevrez un email avec les instructions pour réinitialiser votre mot de passe.
          </p>
        </div>
      </div>
      </form>
    </>
  )
}