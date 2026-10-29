/**
 * Dinheiro sempre em CENTAVOS inteiros no front (nunca float em cálculos).
 * O banco guarda numeric(12,2); o PostgREST devolve number JSON, convertido aqui por texto.
 */

/** Converte valor vindo do banco (number ou "89.90") em centavos, sem aritmética de ponto flutuante. */
export function toCents(value: number | string): number {
  const text = typeof value === 'number' ? value.toFixed(2) : value.trim()
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text)
  if (!m) throw new Error(`Valor monetário inválido: ${String(value)}`)
  const cents = parseInt(m[2], 10) * 100 + parseInt((m[3] ?? '').padEnd(2, '0') || '0', 10)
  return m[1] === '-' ? -cents : cents
}

/** 8990 -> "89.90" (formato aceito pelo numeric do Postgres). */
export function centsToDecimalString(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error('Centavos devem ser inteiros')
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** 8990 -> "R$ 89,90" */
export function formatBRL(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}R$ ${reais},${String(abs % 100).padStart(2, '0')}`
}

/**
 * Interpreta o que a proprietária digita: "89,90", "1.234,56", "150", "R$ 79,9".
 * Retorna centavos ou null se inválido/negativo.
 */
export function parseBRLInput(input: string): number | null {
  const text = input.replace(/R\$/gi, '').replace(/\s/g, '')
  if (!text) return null
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(text)
  if (!m) return null
  const reais = parseInt(m[1].replace(/\./g, ''), 10)
  const cents = parseInt((m[2] ?? '').padEnd(2, '0') || '0', 10)
  const total = reais * 100 + cents
  return Number.isSafeInteger(total) ? total : null
}

/** 8990 -> "89,90" (para preencher campos de formulário). */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`
}

/** Pix: 90% do preço vigente, arredondado por UNIDADE ao centavo mais próximo.
 * Meio centavo arredonda para cima. Multiplicar o unitário arredondado pela quantidade
 * mantém catálogo, seleção, revisão e WhatsApp coerentes.
 */
export function pixCents(cardCents: number): number {
  if (!Number.isSafeInteger(cardCents) || cardCents < 0) throw new Error('Preço inválido.')
  return Number((BigInt(cardCents) * 9n + 5n) / 10n)
}
