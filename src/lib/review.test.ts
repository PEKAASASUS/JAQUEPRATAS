import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReviewList from '../components/ReviewList.tsx'
import { buildReviewLines, linesTotalCents } from './selection.ts'

test('revisão exibe peças, quantidades, unitários, subtotais e total em formato brasileiro', () => {
  const catalog = [
    { id: 'a', name: 'Anel Solitário', cents: 8990, available: 5 },
    { id: 'b', name: 'Corrente Veneziana', cents: 14990, available: 2 },
  ]
  const lines = buildReviewLines({ a: 2, b: 1 }, catalog)
  const html = renderToStaticMarkup(createElement(ReviewList, { lines, totalCents: linesTotalCents(lines) }))
  for (const s of ['Anel Solitário', 'Corrente Veneziana', '2 × R$ 89,90', 'R$ 179,80', '1 × R$ 149,90', 'R$ 149,90', 'Total estimado', 'R$ 329,70']) {
    assert.ok(html.includes(s), `faltou "${s}" na revisão`)
  }
})
