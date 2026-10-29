import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterProducts, sortProducts, toCatalogEntries, normalize } from './catalogFilter.ts'
import type { CatalogProduct } from './types.ts'

const p = (o: Partial<CatalogProduct>): CatalogProduct => ({
  id: 'x', name: 'Item', category_slug: 'aneis', category_name: 'Anéis', description: '', material: 'Prata 925',
  price: 100, promo_price: null, current_price: 100, available_quantity: 1, is_available: true,
  created_at: '2026-01-01T00:00:00Z', image_paths: [], ...o,
})
const list = [
  p({ id: '1', name: 'Anel Solitário', current_price: 89.9, created_at: '2026-03-01T00:00:00Z' }),
  p({ id: '2', name: 'Corrente Veneziana', category_slug: 'correntes', category_name: 'Correntes', current_price: 149.9, created_at: '2026-02-01T00:00:00Z' }),
  p({ id: '3', name: 'Brinco Argola', category_slug: 'brincos', category_name: 'Brincos', current_price: 59.9, created_at: '2026-04-01T00:00:00Z' }),
]

test('normalize ignora acentos e caixa', () => assert.equal(normalize('ANÉL Solitário'), 'anel solitario'))
test('filtro por categoria', () => {
  assert.deepEqual(filterProducts(list, 'correntes', '').map(x => x.id), ['2'])
  assert.equal(filterProducts(list, 'todos', '').length, 3)
})
test('pesquisa por nome sem depender de acento/caixa e exigindo todas as palavras', () => {
  assert.deepEqual(filterProducts(list, 'todos', 'SOLITARIO').map(x => x.id), ['1'])
  assert.deepEqual(filterProducts(list, 'todos', 'corrente venez').map(x => x.id), ['2'])
  assert.deepEqual(filterProducts(list, 'todos', 'anel brinco'), [])
})
test('categoria e pesquisa combinadas; nenhum resultado => lista vazia', () => {
  assert.deepEqual(filterProducts(list, 'aneis', 'argola'), [])
  assert.deepEqual(filterProducts(list, 'brincos', 'argola').map(x => x.id), ['3'])
})
test('ordenação por preço e por novidade', () => {
  assert.deepEqual(sortProducts(list, 'menor').map(x => x.id), ['3', '1', '2'])
  assert.deepEqual(sortProducts(list, 'maior').map(x => x.id), ['2', '1', '3'])
  assert.deepEqual(sortProducts(list, 'novidades').map(x => x.id), ['3', '1', '2'])
})
test('toCatalogEntries usa o preço vigente (promoção) em centavos', () => {
  const e = toCatalogEntries([p({ id: 'z', price: 100, promo_price: 79.9, current_price: 79.9, available_quantity: 3 })])
  assert.deepEqual(e, [{ id: 'z', name: 'Item', cents: 7990, available: 3 }])
})
