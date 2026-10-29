import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toCents, centsToDecimalString, formatBRL, parseBRLInput, centsToInput } from './money.ts'

test('toCents converte sem erro de ponto flutuante', () => {
  assert.equal(toCents(89.9), 8990)
  assert.equal(toCents(0.1 + 0.2), 30)
  assert.equal(toCents('149.90'), 14990)
  assert.equal(toCents('150'), 15000)
  assert.equal(toCents(1234567.89), 123456789)
  assert.throws(() => toCents('abc'))
})
test('formatBRL', () => {
  assert.equal(formatBRL(8990), 'R$ 89,90')
  assert.equal(formatBRL(5), 'R$ 0,05')
  assert.equal(formatBRL(123456789), 'R$ 1.234.567,89')
  assert.equal(formatBRL(0), 'R$ 0,00')
})
test('parseBRLInput', () => {
  assert.equal(parseBRLInput('89,90'), 8990)
  assert.equal(parseBRLInput('R$ 1.234,56'), 123456)
  assert.equal(parseBRLInput('150'), 15000)
  assert.equal(parseBRLInput('79,9'), 7990)
  assert.equal(parseBRLInput('-5'), null)
  assert.equal(parseBRLInput('12,345'), null)
  assert.equal(parseBRLInput('1.23'), null)
  assert.equal(parseBRLInput(''), null)
  assert.equal(parseBRLInput('abc'), null)
})
test('centsToDecimalString e centsToInput', () => {
  assert.equal(centsToDecimalString(8990), '89.90')
  assert.equal(centsToDecimalString(5), '0.05')
  assert.equal(centsToInput(8990), '89,90')
})
