import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Price from '../components/Price.tsx'
import ReviewList from '../components/ReviewList.tsx'
import { pixCents } from './money.ts'
import { toCatalogEntries } from './catalogFilter.ts'
import { syncSelection, buildReviewLines, linesTotalCents } from './selection.ts'
import { buildRequestMessage } from './whatsapp.ts'
import type { CatalogProduct } from './types.ts'

const product: CatalogProduct = {
  id: 'a', name: 'Anel', price: 200, promo_price: null, current_price: 200,
  category_slug: 'aneis', category_name: 'Anéis', description: '', material: 'Prata',
  available_quantity: 5, is_available: true, created_at: '', image_paths: [],
}
test('Pix normal e promoção acumulativa usam o mesmo preço em card e detalhe', () => {
  for (const [p, card, pix] of [
    [product, 'R$ 200,00', 'R$ 180,00'],
    [{ ...product, promo_price: 160, current_price: 160 }, 'R$ 160,00', 'R$ 144,00'],
  ] as const) {
    const html = renderToStaticMarkup(createElement(Price, { product: p }))
    assert.ok(html.includes(`${card} no cartão`))
    assert.ok(html.includes(`${pix} no Pix`))
  }
})
test('Pix arredonda meio centavo para cima, por unidade, sem ponto flutuante', () => {
  for (const [card, pix] of [[0, 0], [1, 1], [4, 4], [5, 5], [6, 5], [1005, 905], [999999999999, 899999999999]]) {
    assert.equal(pixCents(card), pix)
  }
  for (const invalid of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => pixCents(invalid))
})
test('revalidação de promoção/estoque atualiza revisão e WhatsApp com totais por unidade', () => {
  const entries = toCatalogEntries([{ ...product, promo_price: 10.05, current_price: 10.05, available_quantity: 2 }])
  const sync = syncSelection({ a: 3 }, { a: { cents: 20000, name: 'Anel' } }, entries)
  assert.deepEqual(sync.changes.map(c => c.kind), ['quantity', 'price'])
  const lines = buildReviewLines(sync.selection, entries)
  const html = renderToStaticMarkup(createElement(ReviewList, { lines, totalCents: linesTotalCents(lines) }))
  const message = buildRequestMessage(lines)
  for (const text of ['R$ 20,10', 'R$ 18,10', 'R$ 9,05']) {
    assert.ok(html.includes(text))
    assert.ok(message.includes(text))
  }
  assert.ok(message.includes('Quantidade: 2'))
  assert.ok(!message.includes('R$ 200,00'))
  const ended = toCatalogEntries([{ ...product, available_quantity: 2 }])
  assert.equal(syncSelection(sync.selection, sync.refs, ended).changes[0].kind, 'price')
  assert.equal(pixCents(buildReviewLines(sync.selection, ended)[0].unitCents), 18000)
})
