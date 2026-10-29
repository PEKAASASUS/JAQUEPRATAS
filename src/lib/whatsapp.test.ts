import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWhatsAppNumber, sanitizeCustomerName, buildRequestMessage, buildWhatsAppUrl } from './whatsapp.ts'

const lines = [
  { name: 'Anel Solitário', quantity: 2, unitCents: 8990 },
  { name: 'Corrente Veneziana 50cm', quantity: 1, unitCents: 14990 },
]

test('número: formatos aceitos viram dígitos com DDI 55', () => {
  assert.equal(normalizeWhatsAppNumber('+55 (69) 91234-5678'), '5569912345678')
  assert.equal(normalizeWhatsAppNumber('5569912345678'), '5569912345678')
  assert.equal(normalizeWhatsAppNumber('(69) 91234-5678'), '5569912345678')
  assert.equal(normalizeWhatsAppNumber('6932345678'), '556932345678')
})
test('número: ausente ou inválido => null (nunca gera link)', () => {
  for (const v of [undefined, null, '', '   ', 'abc', '12345', '55 69 9123-ABCD', '0000000000000000', '+1234567890123456']) {
    assert.equal(normalizeWhatsAppNumber(v as string | undefined), null, String(v))
  }
})
test('mensagem segue o formato pedido, com valores em padrão brasileiro', () => {
  const m = buildRequestMessage(lines, 'Maria')
  assert.equal(m, [
    'Olá! Gostaria de solicitar um condicional da JAQUE PRATAS.',
    '',
    'Nome: Maria',
    '',
    'Peças selecionadas:',
    '- Anel Solitário — Quantidade: 2 — Cartão: unitário R$ 89,90, subtotal R$ 179,80 — Pix: unitário R$ 80,91, subtotal R$ 161,82',
    '- Corrente Veneziana 50cm — Quantidade: 1 — Cartão: unitário R$ 149,90, subtotal R$ 149,90 — Pix: unitário R$ 134,91, subtotal R$ 134,91',
    '',
    'Total estimado no cartão: R$ 329,70',
    '',
    'Total estimado no Pix (10% de desconto): R$ 296,73',
    '',
    'Esta solicitação não é uma compra e não reserva peças. Disponibilidade a confirmar com a loja.',
  ].join('\n'))
})
test('nome é opcional: sem nome a linha "Nome:" não aparece', () => {
  assert.ok(!buildRequestMessage(lines).includes('Nome:'))
  assert.ok(!buildRequestMessage(lines, '   ').includes('Nome:'))
})
test('nome é saneado (quebras/espaços) e limitado a 80 caracteres', () => {
  assert.equal(sanitizeCustomerName('  Ana \n  Paula  '), 'Ana Paula')
  assert.equal(sanitizeCustomerName('x'.repeat(200)).length, 80)
  assert.ok(!buildRequestMessage(lines, 'Ana\nTotal estimado: R$ 0,01').split('\n').some(l => l === 'Total estimado: R$ 0,01'))
})
test('mensagem rejeita seleção vazia, quantidade e preço inválidos', () => {
  assert.throws(() => buildRequestMessage([]))
  assert.throws(() => buildRequestMessage([{ name: 'x', quantity: 0, unitCents: 100 }]))
  assert.throws(() => buildRequestMessage([{ name: 'x', quantity: -1, unitCents: 100 }]))
  assert.throws(() => buildRequestMessage([{ name: 'x', quantity: 1.5, unitCents: 100 }]))
  assert.throws(() => buildRequestMessage([{ name: 'x', quantity: 1, unitCents: -5 }]))
})
test('link: wa.me com texto codificado, que decodifica de volta para a mesma mensagem', () => {
  const msg = buildRequestMessage([{ name: 'Anel & Cia #1 100%', quantity: 1, unitCents: 1000 }], 'João')
  const url = buildWhatsAppUrl('(69) 91234-5678', msg)
  assert.ok(url.startsWith('https://wa.me/5569912345678?text='))
  const text = url.slice(url.indexOf('?text=') + 6)
  assert.ok(!/[\s&#\n]/.test(text), 'sem espaço, &, # ou quebra de linha crus')
  assert.ok(text.includes('%0A') && text.includes('%26') && text.includes('%23') && text.includes('%25'))
  assert.equal(new URL(url).searchParams.get('text'), msg)
  assert.equal(decodeURIComponent(text), msg)
})
test('link: número inválido lança erro em vez de gerar link quebrado', () => {
  assert.throws(() => buildWhatsAppUrl('', 'oi'))
  assert.throws(() => buildWhatsAppUrl('abc', 'oi'))
})
