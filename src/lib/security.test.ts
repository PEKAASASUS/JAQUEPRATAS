/**
 * Verificações ESTÁTICAS de segurança. Leem as migrations e o código-fonte; NÃO falam com um Supabase
 * real (isso exigiria credenciais). Servem de rede de proteção contra regressões em revisões de código.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const migrationsDir = join(root, 'supabase', 'migrations')
const sql = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(join(migrationsDir, f), 'utf8')).join('\n')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(n) && !n.endsWith('.test.ts') ? [p] : []
  })
}
const src = sourceFiles(join(root, 'src'))
const read = (p: string) => readFileSync(p, 'utf8')
// Fora da varredura "código público": painel admin, login do Marco 1 (auth.tsx lê só a própria linha de
// admin_users) e types.ts (apenas declarações de tipo, inclusive o AdminProduct).
const isPublicCode = (f: string) => !/[\\/]admin[\\/]/.test(f) && !/adminProducts|auth\.tsx$|types\.ts$/.test(f)

test('toda tabela criada tem RLS habilitado', () => {
  const tables = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/g)].map(m => m[1])
  assert.ok(tables.length > 0)
  for (const t of tables) assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`), t)
})
test('visitante (anon) não tem política nem permissão de escrita em nada', () => {
  for (const m of sql.matchAll(/create policy[^;]*?for (insert|update|delete|all)[^;]*?;/gis)) {
    assert.ok(!/\bto\b[^;]*\banon\b/i.test(m[0]), `política de escrita para anon: ${m[0].slice(0, 80)}`)
    assert.ok(/is_admin\(\)/.test(m[0]), `política de escrita sem is_admin(): ${m[0].slice(0, 80)}`)
  }
  assert.ok(!/grant\s+(insert|update|delete|all)[^;]*\bto\b[^;]*\banon\b/i.test(sql))
})
test('visitante só lê a view do catálogo e as categorias; produtos/estoque/admin ficam fechados', () => {
  assert.match(sql, /revoke all on public\.products, public\.product_images, public\.stock_movements, public\.admin_users from anon/)
  assert.match(sql, /grant select on public\.catalog_products to anon, authenticated/)
  assert.match(sql, /grant select on public\.categories to anon/)
})
test('a view pública só traz produtos ativos e não arquivados, sem SKU', () => {
  const view = /create view public\.catalog_products as([\s\S]*?);/.exec(sql)?.[1] ?? ''
  assert.match(view, /where p\.is_active and p\.archived_at is null/)
  assert.ok(!/\bsku\b/i.test(view))
})
test('modelagem de gestão existe sem escrita pública ou escrita direta autenticada', () => {
  const management = readFileSync(join(migrationsDir, '20261028000000_gestao_base.sql'), 'utf8')
  for (const table of ['customers', 'conditionals', 'conditional_items', 'sales', 'sale_items', 'payments',
    'payment_reversals', 'sale_item_reversals', 'conditional_events', 'operation_requests', 'customer_audit']) {
    assert.ok(management.includes(`revoke all on public.${table} from public, anon, authenticated`))
    assert.ok(management.includes(`grant select on public.${table} to authenticated`))
  }
  assert.ok(!/grant\s+(insert|update|delete|all)[^;]*\bto\b[^;]*\bauthenticated\b/i.test(management))
})
test('o código do front não usa service_role nem desativa RLS', () => {
  for (const f of src) assert.ok(!/service_role/i.test(read(f)), f)
  assert.ok(!/disable row level security/i.test(sql))
})
test('código público (catálogo, seleção, revisão, WhatsApp) não escreve no banco nem mexe em estoque', () => {
  const publicFiles = src.filter(isPublicCode)
  assert.ok(publicFiles.length > 5)
  for (const f of publicFiles) {
    const c = read(f)
    assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(c), `${f} escreve no banco`)
    assert.ok(!/stock_quantity|stock_movements|\.storage\.from\([^)]*\)\.(upload|remove)/.test(c), `${f} mexe em estoque/arquivos`)
  }
})
test('leitura pública usa só catalog_products e categories', () => {
  const tablesRead = new Set<string>()
  for (const f of src.filter(isPublicCode)) {
    for (const m of read(f).matchAll(/\.from\('([\w-]+)'\)/g)) if (m[1] !== 'product-images') tablesRead.add(m[1])
  }
  assert.deepEqual([...tablesRead].sort(), ['catalog_products', 'categories'])
})
