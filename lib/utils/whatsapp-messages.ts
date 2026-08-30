import { APP_CONFIG } from '@/constants/config'
import { formatPhoneNumber } from './phone'

interface UserProfile {
  full_name: string | null
  email: string
  phone?: string | null
}

interface SubscriptionPlan {
  name: string
}

interface SubscriptionRequest {
  id: string
  planName: string
  requestType: 'new' | 'renewal' | 'upgrade' | 'additional'
  userNotes?: string
  preferredStartDate?: string
  budgetMax?: number
}

/**
 * Generate welcome WhatsApp message for new user signup
 */
export function generateSignupMessage(user: UserProfile): string {
  const name = user.full_name || 'Cher membre'

  return `🎉 *Bienvenue chez Koncept Studio !*

Bonjour ${name},

Merci de vous être inscrit(e) ! Votre compte a été créé avec succès.

📌 *Prochaines étapes:*
• Explorez nos formules d'abonnement depuis votre espace membre
• Choisissez la formule qui vous convient
• Rendez-vous au studio pour procéder au paiement

📍 *Notre adresse:*
${APP_CONFIG.CONTACT.ADDRESS}

📞 *Contact:*
${formatPhoneNumber(APP_CONFIG.CONTACT.PHONE)}

Nous avons hâte de vous accueillir !

L'équipe Koncept Studio 💪`
}

/**
 * Generate account activation WhatsApp message
 */
export function generateActivationMessage(user: UserProfile): string {
  const name = user.full_name || 'Cher membre'

  return `✅ *Abonnement activé!*

Bonjour ${name},

Félicitations ! Votre abonnement Koncept Studio est maintenant actif. 🎉

🎯 *Vous pouvez désormais:*
• Réserver vos séances
• Gérer votre abonnement
• Accéder à tous nos services

🚀 *Pour commencer:*
Connectez-vous à votre espace membre et découvrez notre planning de cours.

Besoin d'aide ? Contactez-nous au ${formatPhoneNumber(APP_CONFIG.CONTACT.PHONE)}

Bons entraînements !

L'équipe Koncept Studio 💪`
}

/**
 * Generate waitlist promotion WhatsApp message
 */
export function generateWaitlistPromotionMessage(user: UserProfile): string {
  const name = user.full_name || 'Cher membre'

  return `🎊 *Bonne nouvelle !*

Bonjour ${name},

Vous avez été promu(e) de la liste d'attente !

✨ *Votre place est maintenant confirmée.*

📞 *Questions ?* Contactez-nous au ${formatPhoneNumber(APP_CONFIG.CONTACT.PHONE)}

Nous avons hâte de vous voir au studio !

L'équipe Koncept Studio 💪`
}

/**
 * Generate class cancellation WhatsApp message
 */
export function generateClassCancellationMessage(
  user: UserProfile,
  className: string,
  classDate: string,
  classTime: string
): string {
  const name = user.full_name || 'Cher membre'

  return `⚠️ *Annulation de cours*

Bonjour ${name},

Nous sommes désolés de vous informer que le cours suivant a été annulé :

📅 *Cours:* ${className}
🕒 *Date et heure:* ${classDate} à ${classTime}

Nous nous excusons pour ce désagrément. Votre séance vous sera restitutée en crédits sur vore solde.

💡 *Alternatives:*
• Consultez notre planning pour d'autres créneaux disponibles
• Contactez-nous pour reprogrammer votre séance

📞 *Contact:* ${formatPhoneNumber(APP_CONFIG.CONTACT.PHONE)}

Merci de votre compréhension.

L'équipe Koncept Studio 💪`
}

/**
 * Generate simple subscription request confirmation WhatsApp message
 */
export function generateSubscriptionRequestMessage(
  user: UserProfile,
  planName: string
): string {
  const name = user.full_name || 'Cher membre'

  return `📋 *Demande d'abonnement reçue*

Bonjour ${name},

Nous avons bien reçu votre demande d'abonnement !

📝 *Détails de la demande:*
• Plan: ${planName}

⏰ *Prochaines étapes:*
• Rendez-vous au studio pour procéder au paiement et activer votre formule
• Vous recevrez une confirmation de traitement

📞 *Questions urgentes ?*
Contactez-nous au ${formatPhoneNumber(APP_CONFIG.CONTACT.PHONE)}

Merci de votre confiance !

L'équipe Koncept Studio 💪`
}







/**
 * Generate subscription expiry warning WhatsApp message (sent ~7 days before
 * the plan's end date by the expiring-subscriptions cron)
 */
export function generateSubscriptionExpiryMessage(
  user: UserProfile,
  planName: string,
  endDateIso: string
): string {
  const name = user.full_name || 'Cher membre'
  const endDate = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Casablanca',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(endDateIso))

  return `⏳ *Votre abonnement expire bientôt*

Bonjour ${name},

Votre formule *${planName}* arrive à expiration le *${endDate}*.

Pour continuer à réserver vos cours sans interruption, pensez à renouveler votre abonnement :
• Directement au studio
• Ou contactez-nous au ${formatPhoneNumber(APP_CONFIG.CONTACT.PHONE)}

À très vite !

L'équipe Koncept Studio 💪`
}
