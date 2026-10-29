import { normalizeWhatsAppNumber } from './whatsapp'

/**
 * Número comercial da loja para o WhatsApp, lido de VITE_WHATSAPP_NUMBER (.env.local ou variável do
 * Cloudflare Pages). Não existe número padrão: se estiver vazio/inválido, o envio fica desativado
 * e a cliente vê um aviso claro. Veja o README.
 */
export const whatsappNumber: string | null = normalizeWhatsAppNumber(
  import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined,
)
