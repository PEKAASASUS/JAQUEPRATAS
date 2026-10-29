import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addToSelection, setQuantity, removeFromSelection, countItems, totalCents, reconcile } from './selection.ts'

test('adicionar respeita o estoque disponível', () => {
  let s = addToSelection({}, 'a', 2)
  s = addToSelection(s, 'a', 2)
  s = addToSelection(s, 'a', 2)
  assert.deepEqual(s, { a: 2 })
})
test('produto sem estoque não entra na seleção', () => {
  assert.deepEqual(addToSelection({}, 'a', 0), {})
})
test('setQuantity limita, remove com 0 e rejeita não inteiros', () => {
  assert.deepEqual(setQuantity({ a: 1 }, 'a', 9, 3), { a: 3 })
  assert.deepEqual(setQuantity({ a: 1 }, 'a', 0, 3), {})
  assert.deepEqual(setQuantity({ a: 1 }, 'a', 1.5, 3), {})
})
test('total em centavos e contagem', () => {
  const s = { a: 2, b: 1 }
  assert.equal(totalCents(s, { a: 8990, b: 14990 }), 32970)
  assert.equal(countItems(s), 3)
})
test('reconcile remove itens indisponíveis e reduz excedentes', () => {
  assert.deepEqual(reconcile({ a: 5, b: 1, c: 2 }, { a: 2, b: 0 }), { a: 2 })
  assert.deepEqual(removeFromSelection({ a: 1, b: 2 }, 'a'), { b: 2 })
})

// ---------------- Marco 2: sincronização com o catálogo atual ----------------
import { syncSelection, buildReviewLines, linesTotalCents, describeChange } from './selection.ts'

const cat = (over: Partial<{ id: string; name: string; cents: number; available: number }> = {}) =>
  ({ id: 'a', name: 'Anel Solitário', cents: 8990, available: 5, ...over })

test('sync: sem mudanças mantém seleção e registra a referência de preço', () => {
  const r = syncSelection({ a: 2 }, { a: { cents: 8990, name: 'Anel Solitário' } }, [cat()])
  assert.deepEqual(r.selection, { a: 2 })
  assert.deepEqual(r.changes, [])
  assert.deepEqual(r.refs, { a: { cents: 8990, name: 'Anel Solitário' } })
})
test('sync: preço mudou -> informa e passa a usar o preço novo (nunca o antigo)', () => {
  const r = syncSelection({ a: 1 }, { a: { cents: 8990, name: 'Anel Solitário' } }, [cat({ cents: 9990 })])
  assert.deepEqual(r.changes, [{ kind: 'price', id: 'a', name: 'Anel Solitário', oldCents: 8990, newCents: 9990 }])
  assert.equal(r.refs.a.cents, 9990)
  assert.match(describeChange(r.changes[0]), /R\$ 89,90 para R\$ 99,90/)
  // depois de informada, uma nova conferência não repete o aviso
  assert.deepEqual(syncSelection(r.selection, r.refs, [cat({ cents: 9990 })]).changes, [])
})
test('sync: peça arquivada/desativada (ausente do catálogo) sai da seleção e é informada pelo nome', () => {
  const r = syncSelection({ a: 1, b: 1 }, { a: { cents: 100, name: 'Arquivada' } }, [cat({ id: 'b', name: 'B' })])
  assert.deepEqual(r.selection, { b: 1 })
  assert.deepEqual(r.changes, [{ kind: 'removed', id: 'a', name: 'Arquivada' }])
  assert.ok(!('a' in r.refs))
})
test('sync: sem estoque sai; quantidade acima do disponível é reduzida e informada', () => {
  const out = syncSelection({ a: 3 }, {}, [cat({ available: 0 })])
  assert.deepEqual(out.selection, {})
  assert.equal(out.changes[0].kind, 'removed')
  const red = syncSelection({ a: 5 }, {}, [cat({ available: 2 })])
  assert.deepEqual(red.selection, { a: 2 })
  assert.deepEqual(red.changes, [{ kind: 'quantity', id: 'a', name: 'Anel Solitário', from: 5, to: 2 }])
})
test('sync: quantidades inválidas (0, negativa, fracionária) nunca entram', () => {
  const r = syncSelection({ a: 0, b: -1, c: 1.5 }, {}, [cat(), cat({ id: 'b' }), cat({ id: 'c' })])
  assert.deepEqual(r.selection, {})
})
test('sync e revisão não modificam os dados de entrada (nada de estoque/venda)', () => {
  const sel = Object.freeze({ a: 2 }); const refs = Object.freeze({ a: Object.freeze({ cents: 1, name: 'x' }) })
  const catalog = Object.freeze([Object.freeze(cat({ cents: 2 }))])
  syncSelection(sel, refs, catalog)
  buildReviewLines(sel, catalog)
  assert.equal(catalog[0].available, 5)
})
test('revisão: subtotais e total corretos (centavos inteiros)', () => {
  const catalog = [cat({ id: 'a', cents: 8990 }), cat({ id: 'b', name: 'Corrente', cents: 14990 })]
  const lines = buildReviewLines({ a: 2, b: 1 }, catalog)
  assert.deepEqual(lines.map(l => l.subtotalCents), [17980, 14990])
  assert.equal(linesTotalCents(lines), 32970)
})
