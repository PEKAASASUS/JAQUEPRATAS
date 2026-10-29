import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCSV, csvCell, withinPeriod } from './management.ts'
test('CSV neutraliza fórmulas, delimita textos e escapa aspas/quebras', () => {
 for (const value of ['=1+1', '+SUM(A1)', '-cmd', '@SUM(A1)', ' \t=HYPERLINK("x")']) assert.ok(csvCell(value).startsWith('"\''))
 assert.equal(csvCell('Joia; "Prata"'), '"Joia; ""Prata"""')
 assert.equal(buildCSV([['Nome', 'Valor'], ['Anel', 90]]), '\ufeff"Nome";"Valor"\r\n"Anel";"90"')
})
test('período inclui início/fim locais e rejeita timestamps inválidos', () => {
 assert.equal(withinPeriod(new Date(2026, 9, 29, 0).toISOString(), '2026-10-29', '2026-10-29'), true)
 assert.equal(withinPeriod(new Date(2026, 9, 29, 23, 59, 59, 999).toISOString(), '2026-10-29', '2026-10-29'), true)
 assert.equal(withinPeriod(new Date(2026, 9, 30, 0).toISOString(), '2026-10-29', '2026-10-29'), false)
 assert.equal(withinPeriod('inválido', '', ''), false)
})
