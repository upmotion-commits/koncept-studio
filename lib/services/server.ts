// Server-side service instances
import { WhatsAppService } from './whatsapp.service'

// Requests handled with the caller's session (server actions, admin pages).
export const whatsappServerService = new WhatsAppService(true)

// Crons and background workers: no session exists, so logs are written with
// the service role. Never import this into anything reachable from a client.
export const whatsappAdminService = new WhatsAppService(false, true)
