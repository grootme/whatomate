// WhatsApp Account type definition
export interface WhatsAppAccount {
  id: string
  organization_id: string
  name: string
  client_type: 'meta' | 'whatsmeow'
  app_id: string
  phone_id: string
  business_id: string
  api_version: string
  is_default_incoming: boolean
  is_default_outgoing: boolean
  auto_read_receipt: boolean
  status: 'active' | 'disconnected' | 'pending' | 'banned'
  qr_code?: string
  webhook_verify_token: string
  created_at: string
  updated_at: string
}
