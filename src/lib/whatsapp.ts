/**
 * Mensagem e link do WhatsApp para solicitar um condicional.
 * Módulo puro: não acessa rede nem banco. Abrir o WhatsApp NÃO cria venda, NÃO reserva peças
 * e NÃO altera estoque; é só uma conversa iniciada pela cliente.
 */
import { formatBRL, pixCents } from './money'

export interface MessageLine { name: string; quantity: number; unitCents: number }

/**
 * Normaliza o número comercial para o formato do wa.me (somente dígitos, com DDI).
 * - "(69) 91234-5678" ou "69912345678" (10/11 dígitos): entendido como número brasileiro, recebe 55;
 * - "+55 69 91234-5678" ou "5569912345678": mantido;
 * - qualquer outra coisa (vazio, letras, curto/longo demais): null (não gera link).
 */
export function normalizeWhatsAppNumber(raw: string | undefined | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  // aceita apenas dígitos e a pontuação comum de telefone; letras invalidam o número
  if (!trimmed || /[^\d\s()+\-.]/.test(trimmed)) return null
  let digits = trimmed.replace(/\D/g, '').replace(/^00/, '')
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits
  if (digits.length < 12 || digits.length > 15) return null
  if (/^0/.test(digits)) return null
  return digits
}

/** Nome opcional: espaços/quebras de linha colapsados e limite de tamanho. */
export function sanitizeCustomerName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 80)
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Monta o texto do pedido. Lança erro se não houver peças ou se algum valor for inválido. */
export function buildRequestMessage(lines: MessageLine[], customerName = ''): string {
  if (lines.length === 0) throw new Error('A seleção está vazia.')
  let totalCents = 0
  let totalPixCents = 0
  const items = lines.map(l => {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new Error('Quantidade inválida.')
    if (!Number.isInteger(l.unitCents) || l.unitCents < 0) throw new Error('Preço inválido.')
    const subtotal = l.unitCents * l.quantity
    totalCents += subtotal
    const pixUnit = pixCents(l.unitCents)
    totalPixCents += pixUnit * l.quantity
    return `- ${oneLine(l.name)} — Quantidade: ${l.quantity} — Cartão: unitário ${formatBRL(l.unitCents)}, subtotal ${formatBRL(subtotal)} — Pix: unitário ${formatBRL(pixUnit)}, subtotal ${formatBRL(pixUnit * l.quantity)}`
  })
  const name = sanitizeCustomerName(customerName)
  const parts = ['Olá! Gostaria de solicitar um condicional da JAQUE PRATAS.']
  if (name) parts.push(`Nome: ${name}`)
  parts.push(`Peças selecionadas:\n${items.join('\n')}`)
  parts.push(`Total estimado no cartão: ${formatBRL(totalCents)}`)
  parts.push(`Total estimado no Pix (10% de desconto): ${formatBRL(totalPixCents)}`)
  parts.push('Esta solicitação não é uma compra e não reserva peças. Disponibilidade a confirmar com a loja.')
  return parts.join('\n\n')
}

/** Link do WhatsApp com o texto codificado (acentos, quebras de linha, &, # etc.). */
export function buildWhatsAppUrl(number: string, message: string): string {
  const digits = normalizeWhatsAppNumber(number)
  if (!digits) throw new Error('Número do WhatsApp inválido.')
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
