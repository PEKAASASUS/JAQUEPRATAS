/** PostgreSQL nativo e descartável. Não lê .env, não aceita URL externa.
 * Auth/Storage são contratos mínimos de teste, não os serviços Supabase completos.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import EmbeddedPostgres from 'embedded-postgres'

const root = new URL('../../', import.meta.url)
const tables = ['customers', 'conditionals', 'conditional_items', 'sales', 'sale_items', 'payments',
  'payment_reversals', 'sale_item_reversals', 'conditional_events', 'operation_requests', 'customer_audit', 'customer_audit_subjects']
const adminId = '00000000-0000-4000-8000-000000000001'
const otherId = '00000000-0000-4000-8000-000000000002'
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let server, owner, temporaryDir
const logs = []

before(async () => {
  // A porta é escolhida pelo SO. O servidor só escuta em loopback e exige senha aleatória.
  const probe = createServer()
  await new Promise((resolve, reject) => { probe.on('error', reject); probe.listen(0, '127.0.0.1', resolve) })
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  temporaryDir = await mkdtemp(join(tmpdir(), 'jaque-marco-b-'))
  server = new EmbeddedPostgres({
    databaseDir: join(temporaryDir, 'data'), user: 'postgres', password: randomBytes(24).toString('hex'),
    port, persistent: true, createPostgresUser: false,
    postgresFlags: ['-h', '127.0.0.1', '-k', temporaryDir, '-c', 'fsync=off'],
    onLog: message => logs.push(message), onError: error => logs.push(String(error)),
  })
  try {
    await server.initialise()
    await server.start()
    owner = server.getPgClient('postgres', '127.0.0.1')
    await owner.connect()
    await owner.query(await readFile(new URL('tests/database/platform-fixture.sql', root), 'utf8'))
    for (const name of (await readdir(new URL('supabase/migrations/', root))).filter(n => n.endsWith('.sql')).sort()) {
      await owner.query(await readFile(new URL(`supabase/migrations/${name}`, root), 'utf8'))
    }
    await owner.query(`
      insert into auth.users(id) values ('${adminId}'), ('${otherId}');
      insert into public.admin_users(user_id) values ('${adminId}');
      select set_config('request.jwt.claim.sub', '${adminId}', false);
      insert into public.products(id, name, category_id, price, promo_price, stock_quantity)
        select '${id(1)}', 'Anel', id, 200, 160, 4 from public.categories where slug = 'aneis';
      insert into public.customers(id, name, created_by) values ('${id(2)}', 'Cliente teste', '${adminId}');
      insert into public.conditionals(id, customer_id, created_by) values ('${id(3)}', '${id(2)}', '${adminId}');
      insert into public.conditional_items(id, conditional_id, product_id, product_name, quantity_out)
        values ('${id(4)}', '${id(3)}', '${id(1)}', 'Anel', 3);
      insert into public.sales(id, customer_id, conditional_id, pricing_method, collection_terms, created_by)
        values ('${id(5)}', '${id(2)}', '${id(3)}', 'pix', 'immediate', '${adminId}');
      insert into public.sale_items(id, sale_id, product_id, conditional_id, conditional_item_id,
        product_name, quantity, pricing_method, list_price, promo_price)
        values ('${id(6)}', '${id(5)}', '${id(1)}', '${id(3)}', '${id(4)}', 'Anel', 2, 'pix', 200, 160);
      insert into public.payments(id, sale_id, method, amount, created_by)
        values ('${id(7)}', '${id(5)}', 'pix', 100, '${adminId}');
      insert into public.payment_reversals(payment_id, amount, reason, created_by)
        values ('${id(7)}', 20, 'Estorno parcial teste', '${adminId}');
      insert into public.sale_item_reversals(sale_item_id, quantity, reason, created_by)
        values ('${id(6)}', 1, 'Retorno parcial teste', '${adminId}');
      insert into public.conditional_events(conditional_item_id, kind, quantity, sale_item_id, reason, created_by)
        values ('${id(4)}', 'sale', 2, '${id(6)}', 'Compra parcial teste', '${adminId}');
      insert into public.operation_requests(id, operation, request_payload, result, created_by)
        values ('${id(8)}', 'fixture', '{}', '{}', '${adminId}');
    `)
  } catch (error) {
    throw new Error(`Falha ao preparar PostgreSQL isolado: ${error?.message ?? error}\n${logs.slice(-5).join('')}`, { cause: error })
  }
}, { timeout: 60000 })

after(async () => {
  if (owner) await owner.end()
  if (server) await server.stop()
  if (temporaryDir) await rm(temporaryDir, { recursive: true, force: true })
})

// Toda tentativa roda em transação e é desfeita, inclusive quando se espera erro.
async function asRole(role, userId, callback) {
  await owner.query('begin')
  try {
    await owner.query(`set local role ${role}`) // role é constante interna aos testes
    await owner.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ''])
    return await callback(owner)
  } finally { await owner.query('rollback') }
}
async function fails(sql, code, role = 'postgres', userId = adminId) {
  await assert.rejects(asRole(role, userId, client => client.query(sql)), error => error.code === code)
}

test('migrações aplicam integralmente em PostgreSQL nativo; RLS e grants de todas as tabelas privadas', async () => {
  const { rows } = await owner.query(`select c.relname, c.relrowsecurity from pg_class c
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`, [tables])
  assert.equal(rows.length, tables.length)
  assert.ok(rows.every(row => row.relrowsecurity))
  for (const table of tables) {
    const { rows: [acl] } = await owner.query(`select
      has_table_privilege('anon', $1, 'SELECT') as anon_read,
      has_table_privilege('authenticated', $1, 'SELECT') as auth_read,
      has_table_privilege('authenticated', $1, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as auth_write`, [`public.${table}`])
    assert.deepEqual(acl, { anon_read: false, auth_read: true, auth_write: false }, table)
  }
})

test('anon lê somente catálogo/categorias e não acessa gestão', async () => {
  await asRole('anon', null, async client => {
    assert.equal((await client.query('select * from public.catalog_products')).rows.length, 1)
    assert.ok((await client.query('select * from public.categories')).rows.length > 0)
  })
  for (const table of [...tables, 'products', 'admin_users', 'stock_movements']) {
    await fails(`select * from public.${table}`, '42501', 'anon', null)
  }
})

test('autenticado sem autorização vê zero linhas privadas; admin lê os registros', async () => {
  for (const table of tables) {
    await asRole('authenticated', otherId, async client => {
      assert.equal((await client.query(`select * from public.${table}`)).rows.length, 0, table)
      assert.equal((await client.query('select public.is_admin() as allowed')).rows[0].allowed, false)
    })
    await asRole('authenticated', adminId, async client => {
      assert.ok((await client.query(`select * from public.${table}`)).rows.length > 0, table)
    })
    // Autenticado sem sub não ganha acesso.
    await asRole('authenticated', null, async client => {
      assert.equal((await client.query(`select * from public.${table}`)).rows.length, 0)
    })
  }
})

test('nenhum papel da API, nem admin, escreve diretamente nas tabelas novas', async () => {
  for (const [role, user] of [['anon', null], ['authenticated', otherId], ['authenticated', adminId]]) {
    for (const table of tables) {
      for (const sql of [`insert into public.${table} default values`, `update public.${table} set id=id`,
        `delete from public.${table}`, `truncate public.${table}`]) {
        await fails(sql, '42501', role, user)
      }
    }
  }
})

test('não administrador não se promove via admin_users e revogação remove leitura imediatamente', async () => {
  await fails(`insert into public.admin_users(user_id) values ('${otherId}')`, '42501', 'authenticated', otherId)
  await fails(`delete from public.admin_users where user_id='${adminId}'`, '42501', 'authenticated', adminId)
  await owner.query('begin')
  try {
    await owner.query(`delete from public.admin_users where user_id='${adminId}'`)
    await owner.query('set local role authenticated')
    await owner.query("select set_config('request.jwt.claim.sub', $1, true)", [adminId])
    assert.equal((await owner.query('select * from public.customers')).rows.length, 0)
  } finally { await owner.query('rollback') }
})

test('funções auxiliares privadas não podem ser chamadas por anon/authenticated', async () => {
  for (const fn of ['audit_customer_change', 'reject_ledger_mutation', 'validate_sale_item_origin']) {
    const { rows: [acl] } = await owner.query(`select
      has_function_privilege('anon', $1, 'EXECUTE') as anon,
      has_function_privilege('authenticated', $1, 'EXECUTE') as authenticated`, [`public.${fn}()`])
    assert.deepEqual(acl, { anon: false, authenticated: false })
  }
  const { rows } = await owner.query(`select proname, proconfig from pg_proc where oid in
    ('public.is_admin()'::regprocedure, 'public.audit_customer_change()'::regprocedure)`)
  assert.ok(rows.every(row => row.proconfig.includes('search_path=""')))
})

test('preços históricos em decimal: promoção + Pix, soma de unidades e snapshot imutável', async () => {
  const { rows: [line] } = await owner.query(`select applicable_price, unit_discount, unit_price, subtotal
    from public.sale_items where id='${id(6)}'`)
  assert.deepEqual(line, { applicable_price: '160.00', unit_discount: '16.00', unit_price: '144.00', subtotal: '288.00' })
  await asRole('postgres', adminId, async client => {
    await client.query(`update public.products set price=250, promo_price=null where id='${id(1)}'`)
    assert.equal((await client.query(`select unit_price from public.sale_items where id='${id(6)}'`)).rows[0].unit_price, '144.00')
    await client.query(`insert into public.sales(id, customer_id, pricing_method, collection_terms, created_by)
      values ('${id(20)}', '${id(2)}', 'pix', 'immediate', '${adminId}')`)
    await client.query(`insert into public.sale_items(sale_id, product_id, product_name, quantity, pricing_method, list_price)
      values ('${id(20)}', '${id(1)}', 'Anel', 2, 'pix', 10.05)`)
    assert.equal((await client.query(`select subtotal from public.sale_items where sale_id='${id(20)}'`)).rows[0].subtotal, '18.10')
  })
  await fails(`update public.sale_items set list_price=1 where id='${id(6)}'`, '55000')
  await fails(`update public.sales set pricing_method='card' where id='${id(5)}'`, '55000')
})

test('histórico impede alteração, exclusão e truncate; cliente usa atualização auditada', async () => {
  for (const table of tables.filter(t => t !== 'customers')) {
    await fails(`update public.${table} set id=id`, '55000')
    await fails(`delete from public.${table}`, '55000')
    await fails(`truncate public.${table} cascade`, '55000')
  }
  await fails('delete from public.customers', '55000')
  await fails('truncate public.customers cascade', '55000')
  await asRole('postgres', adminId, async client => {
    await client.query(`update public.customers set name='Nome atualizado', archived_at=now() where id='${id(2)}'`)
    const { rows: [audit] } = await client.query(`select before_data, after_data, actor_id from public.customer_audit
      where customer_id='${id(2)}' and action='UPDATE'`)
    assert.equal(audit.before_data.name, 'Cliente teste')
    assert.equal(audit.after_data.name, 'Nome atualizado')
    assert.ok(audit.after_data.archived_at)
    assert.equal(audit.actor_id, adminId)
  })
})

test('constraints rejeitam quantidades/valores inválidos e vínculos inconsistentes', async () => {
  for (const value of ['0', '-1', "'NaN'"]) {
    await fails(`insert into public.payments(sale_id, method, amount, created_by)
      values ('${id(5)}', 'pix', ${value}, '${adminId}')`, '23514')
  }
  await fails(`insert into public.payments(sale_id, method, amount, created_by)
    values ('${id(5)}', 'pix', 'Infinity', '${adminId}')`, '22003')
  await fails(`insert into public.conditional_items(conditional_id, product_id, product_name, quantity_out)
    values ('${id(3)}', '${id(1)}', 'Anel', 0)`, '23514')
  await fails(`insert into public.sales(customer_id, conditional_id, pricing_method, collection_terms, created_by)
    values ('${id(99)}', '${id(3)}', 'card', 'immediate', '${adminId}')`, '23503')
  // Venda condicional não pode aceitar linha direta que escape de FK por NULL.
  await fails(`insert into public.sale_items(sale_id, product_id, product_name, quantity, pricing_method, list_price)
    values ('${id(5)}', '${id(1)}', 'Anel', 1, 'pix', 200)`, '23514')
  await fails(`insert into public.payments(sale_id, method, amount, created_by)
    values ('${id(5)}', 'store_credit', 1, '${adminId}')`, '23514')
  await fails(`insert into public.operation_requests(id, operation, request_payload, result, created_by)
    values ('${id(8)}', 'duplicado', '{}', '{}', '${adminId}')`, '23505')
})

test('catálogo e leitura de gestão não causam saídas ou recebimentos', async () => {
  assert.equal((await owner.query(`select stock_quantity from public.products where id='${id(1)}'`)).rows[0].stock_quantity, 4)
  assert.equal((await owner.query(`select count(*)::int as n from public.stock_movements where product_id='${id(1)}'`)).rows[0].n, 1)
  assert.equal((await owner.query('select count(*)::int as n from public.payments')).rows[0].n, 1)
})


test('falha de integridade desfaz a transação inteira, inclusive auditoria', async () => {
  await owner.query('begin')
  try {
    await owner.query(`insert into public.customers(id, name, created_by) values ('${id(30)}', 'Rollback', '${adminId}')`)
    await assert.rejects(owner.query(`insert into public.payments(sale_id, method, amount, created_by)
      values ('${id(5)}', 'pix', -1, '${adminId}')`), error => error.code === '23514')
  } finally { await owner.query('rollback') }
  assert.equal((await owner.query(`select * from public.customers where id='${id(30)}'`)).rows.length, 0)
  assert.equal((await owner.query(`select * from public.customer_audit where customer_id='${id(30)}'`)).rows.length, 0)
})

test('chave de operação impede duplicação com duas conexões concorrentes', async () => {
  const first = server.getPgClient('postgres', '127.0.0.1')
  const second = server.getPgClient('postgres', '127.0.0.1')
  await Promise.all([first.connect(), second.connect()])
  try {
    await first.query('begin')
    await second.query('begin')
    await second.query("set local lock_timeout='5s'")
    const sql = `insert into public.operation_requests(id, operation, request_payload, result, created_by)
      values ('${id(31)}', 'concorrencia_teste', '{}', '{}', '${adminId}')`
    await first.query(sql)
    const denied = assert.rejects(second.query(sql), error => error.code === '23505')
    await first.query('commit')
    await denied
    await second.query('rollback')
    assert.equal((await owner.query(`select count(*)::int as n from public.operation_requests where id='${id(31)}'`)).rows[0].n, 1)
  } finally {
    await Promise.all([first.query('rollback'), second.query('rollback')])
    await Promise.all([first.end(), second.end()])
  }
})

test('cartão/standard preservam preço integral; zero e Pix acumulativo seguem regra do catálogo', async () => {
  for (const [method, normal, promo, expected] of [
    ['card', 200, null, '200.00'], ['card', 200, 160, '160.00'],
    ['standard', 200, 160, '160.00'], ['pix', 200, null, '180.00'], ['pix', 200, 0, '0.00'],
  ]) {
    await asRole('postgres', adminId, async client => {
      await client.query(`insert into public.sales(id, customer_id, pricing_method, collection_terms, created_by)
        values ($1, $2, $3, 'immediate', $4)`, [id(40), id(2), method, adminId])
      await client.query(`insert into public.sale_items(sale_id, product_id, product_name, quantity, pricing_method, list_price, promo_price)
        values ($1, $2, 'Anel', 1, $3, $4, $5)`, [id(40), id(1), method, normal, promo])
      assert.equal((await client.query('select unit_price from public.sale_items where sale_id=$1', [id(40)])).rows[0].unit_price, expected)
    })
  }
})

test('cliente da condicional e origem/produto/método da venda são coerentes por FK', async () => {
  await asRole('postgres', adminId, async client => {
    await client.query(`insert into public.customers(id, name, created_by) values ('${id(41)}', 'Outra cliente', '${adminId}')`)
    await client.query('savepoint invalid')
    await assert.rejects(client.query(`insert into public.sales(customer_id, conditional_id, pricing_method, collection_terms, created_by)
      values ('${id(41)}', '${id(3)}', 'card', 'immediate', '${adminId}')`), error => error.code === '23503')
    await client.query('rollback to savepoint invalid')
    await client.query(`insert into public.sales(id, customer_id, conditional_id, pricing_method, collection_terms, created_by)
      values ('${id(42)}', '${id(2)}', '${id(3)}', 'card', 'immediate', '${adminId}')`)
    await client.query('savepoint invalid_line')
    await assert.rejects(client.query(`insert into public.sale_items(sale_id, product_id, conditional_id, conditional_item_id,
      product_name, quantity, pricing_method, list_price)
      values ('${id(42)}', '${id(1)}', '${id(3)}', '${id(4)}', 'Anel', 1, 'pix', 200)`), error => error.code === '23503')
    await client.query('rollback to savepoint invalid_line')
  })
})


async function command(client, action, payload, key = randomUUID()) {
 return (await client.query('select public.admin_execute($1,$2,$3) as result', [key, action, payload])).rows[0].result
}
async function snapshot(client) { return (await client.query('select public.admin_snapshot() as data')).rows[0].data }
async function productFor(client, quantity = 5) {
 const pid = randomUUID()
 await client.query(`insert into public.products(id,name,category_id,price,stock_quantity)
  select $1,'Joia de teste',id,100,$2 from public.categories where slug='aneis'`, [pid, quantity])
 return pid
}
async function rejectsCommand(client, action, payload, pattern = /./) {
 await client.query('savepoint rejected_command')
 await assert.rejects(command(client, action, payload), pattern)
 await client.query('rollback to savepoint rejected_command')
}

test('RPCs bloqueiam visitante e login sem admin, inclusive snapshot financeiro', async () => {
 for (const [role, user] of [['anon', null], ['authenticated', otherId]]) {
  await assert.rejects(asRole(role, user, client => command(client, 'customer_save', { name: 'Tentativa' })), e => e.code==='42501')
  await fails('select public.admin_snapshot()', '42501', role, user)
 }
})

test('venda direta calcula preço no backend, pagamento parcial/estorno e replay idempotente', async () => {
 await asRole('authenticated', adminId, async client => {
  const pid = await productFor(client, 3)
  const key = randomUUID()
  const payload = { customer_id:id(2), items:[{product_id:pid,quantity:2}], pricing_method:'pix', collection_terms:'store_credit', received:0, total:0.01 }
  const sale = await command(client, 'sale_create', payload, key)
  assert.deepEqual(await command(client,'sale_create',payload,key),sale)
  let state = await snapshot(client)
  assert.equal(state.products.find(p=>p.id===pid).stock_quantity,1)
  assert.equal(Number(state.sales.find(s=>s.id===sale.id).balance),180)
  const paymentKey=randomUUID()
  const payment = await command(client,'payment_add',{sale_id:sale.id,amount:60,method:'pix'},paymentKey)
  await command(client,'payment_add',{sale_id:sale.id,amount:60,method:'pix'},paymentKey)
  await command(client,'payment_reverse',{payment_id:payment.id,amount:20,reason:'Correção de recebimento'})
  state=await snapshot(client)
  assert.equal(Number(state.sales.find(s=>s.id===sale.id).balance),140)
  assert.equal(state.payments.filter(p=>p.sale_id===sale.id).length,1)
  await rejectsCommand(client,'payment_add',{sale_id:sale.id,amount:141,method:'pix'},/saldo/)
  await rejectsCommand(client,'payment_reverse',{payment_id:payment.id,amount:41,reason:'Estorno repetido'},/Estorno/)
  await client.query('savepoint changed_key')
  await assert.rejects(command(client,'sale_create',{...payload,received:1},key),/Chave reutilizada/)
  await client.query('rollback to savepoint changed_key')
  const movements=state.movements.filter(m=>m.product_id===pid)
  assert.equal(movements.length,2)
  assert.equal(movements.find(m=>m.movement_type==='venda_direta').reference_id,key)
 })
})

test('condicional: saída física, retorno/perda/compra parciais, devolução de venda e correção auditável', async () => {
 await asRole('authenticated',adminId, async client => {
  const pid=await productFor(client,5)
  const delivered=await command(client,'conditional_deliver',{customer_id:id(2),items:[{product_id:pid,quantity:3}]})
  let state=await snapshot(client)
  const item=state.conditional_items.find(i=>i.conditional_id===delivered.id)
  assert.equal(state.products.find(p=>p.id===pid).stock_quantity,2)
  const returned=await command(client,'conditional_resolve',{item_id:item.id,kind:'return',quantity:1,reason:'Peça devolvida'})
  const lost=await command(client,'conditional_resolve',{item_id:item.id,kind:'loss',quantity:1,reason:'Dano confirmado'})
  const sold=await command(client,'sale_create',{customer_id:id(2),conditional_id:delivered.id,items:[{product_id:pid,quantity:1}],pricing_method:'pix',collection_terms:'immediate',received:90,payment_method:'pix'})
  state=await snapshot(client)
  assert.equal(state.products.find(p=>p.id===pid).stock_quantity,3) // venda condicional não baixa de novo
  assert.equal(state.conditionals.find(c=>c.id===delivered.id).pending,0)
  await rejectsCommand(client,'conditional_resolve',{item_id:item.id,kind:'return',quantity:1,reason:'Retorno duplicado'},/quantidade inválida/)
  const line=state.sale_items.find(l=>l.sale_id===sold.id)
  await command(client,'sale_reverse',{item_id:line.id,quantity:1,reason:'Devolução confirmada',restock:true,refund_confirmed:true})
  state=await snapshot(client)
  assert.equal(state.products.find(p=>p.id===pid).stock_quantity,4)
  assert.equal(Number(state.sales.find(s=>s.id===sold.id).balance),0)
  assert.equal(Number(state.sales.find(s=>s.id===sold.id).net_total),0)
  assert.equal(Number(state.payment_reversals.find(r=>state.payments.some(p=>p.sale_id===sold.id&&p.id===r.payment_id)).amount),90)
  await command(client,'conditional_reverse',{event_id:lost.id,reason:'Peça recuperada'})
  state=await snapshot(client)
  assert.equal(state.conditionals.find(c=>c.id===delivered.id).pending,1)
  await command(client,'conditional_resolve',{item_id:item.id,kind:'return',quantity:1,reason:'Retorno recuperado'})
  await rejectsCommand(client,'conditional_reverse',{event_id:lost.id,reason:'Repetir correção'},/não reversível/)
  assert.ok(returned.id)
  assert.equal((await snapshot(client)).products.find(p=>p.id===pid).stock_quantity,5)
 })
})

test('venda à vista exige quitação, snapshot de cliente/produto e cancelamento integral atômico', async () => {
 await asRole('authenticated',adminId,async client=>{
  const a=await productFor(client,2), b=await productFor(client,2)
  const payload={customer_id:id(2),items:[{product_id:a,quantity:1},{product_id:b,quantity:1}],pricing_method:'card',collection_terms:'immediate',received:199,payment_method:'card'}
  await rejectsCommand(client,'sale_create',payload,/recebimento integral/)
  assert.equal((await snapshot(client)).products.find(p=>p.id===a).stock_quantity,2)
  const sale=await command(client,'sale_create',{...payload,received:200})
  await command(client,'customer_save',{id:id(2),name:'Novo nome',phone:'',notes:''})
  await client.query('update public.products set price=300 where id=$1',[a])
  let state=await snapshot(client)
  assert.equal(state.sales.find(s=>s.id===sale.id).customer_name,'Cliente teste')
  assert.equal(Number(state.sale_items.find(l=>l.sale_id===sale.id&&l.product_id===a).unit_price),100)
  await command(client,'sale_cancel',{sale_id:sale.id,reason:'Cancelamento com retorno físico',restock:true,refund_confirmed:true})
  state=await snapshot(client)
  assert.equal(state.products.find(p=>p.id===a).stock_quantity,2)
  assert.equal(state.products.find(p=>p.id===b).stock_quantity,2)
  assert.equal(Number(state.sales.find(s=>s.id===sale.id).balance),0)
  assert.equal(state.sale_reversals.filter(r=>state.sale_items.some(l=>l.id===r.sale_item_id&&l.sale_id===sale.id)).length,2)
 })
})

test('estoque exige motivo, impede edição direta e não admite ajuste negativo além do disponível', async()=>{
 await asRole('authenticated',adminId,async client=>{
  const pid=await productFor(client,2)
  await command(client,'stock_adjust',{product_id:pid,delta:3,kind:'entry',reason:'Compra de reposição'})
  await command(client,'stock_adjust',{product_id:pid,delta:-1,kind:'loss',reason:'Peça danificada'})
  await rejectsCommand(client,'stock_adjust',{product_id:pid,delta:-5,kind:'adjust',reason:'Contagem física'},/Estoque insuficiente/)
  await client.query('savepoint direct_stock')
  await assert.rejects(client.query('update public.products set stock_quantity=100 where id=$1',[pid]),e=>e.code==='42501')
  await client.query('rollback to savepoint direct_stock')
  assert.equal((await snapshot(client)).products.find(p=>p.id===pid).stock_quantity,4)
 })
})

test('concorrência real: somente uma venda consegue a última unidade', async()=>{
 const first=server.getPgClient('postgres','127.0.0.1'),second=server.getPgClient('postgres','127.0.0.1')
 await Promise.all([first.connect(),second.connect()])
 const pid=await productFor(owner,1)
 try {
  for(const client of [first,second]) {await client.query('begin');await client.query('set local role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,true)",[adminId])}
  const payload={customer_id:id(2),items:[{product_id:pid,quantity:1}],pricing_method:'card',collection_terms:'immediate',received:100,payment_method:'card'}
  await command(first,'sale_create',payload)
  const denied=assert.rejects(command(second,'sale_create',payload),/estoque insuficiente/)
  await first.query('commit');await denied;await second.query('rollback')
  assert.equal((await owner.query('select stock_quantity from public.products where id=$1',[pid])).rows[0].stock_quantity,0)
 } finally {await Promise.all([first.query('rollback'),second.query('rollback')]);await Promise.all([first.end(),second.end()])}
})

test('navegador: catálogo preservado e gestão conectada ao PostgreSQL isolado', { skip: process.env.JAQUE_BROWSER_TEST !== '1', timeout: 180000 }, async () => {
 const { chromium } = await import('playwright')
 const { createServer: createViteServer } = await import('vite')
 const { existsSync } = await import('node:fs')
 const { fileURLToPath } = await import('node:url')
 process.env.VITE_SUPABASE_URL='https://jaque-test.supabase.co'
 process.env.VITE_SUPABASE_ANON_KEY='test-anon-key'
 process.env.VITE_WHATSAPP_NUMBER='5569912345678'
 const vite=await createViteServer({root:fileURLToPath(root),server:{host:'127.0.0.1',port:0}})
 await vite.listen()
 const address=vite.httpServer.address();const base=`http://127.0.0.1:${address.port}`
 const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined)
 const browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox']})
 const api=server.getPgClient('postgres','127.0.0.1');await api.connect()
 const context=await browser.newContext({viewport:{width:1280,height:900}})
 const errors=[]
 const user={id:adminId,aud:'authenticated',role:'authenticated',email:'admin@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()}
 const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:adminId,exp:Math.floor(Date.now()/1000)+7200})).toString('base64url')}.fixture`
 await context.addInitScript(({token,user})=>localStorage.setItem('sb-jaque-test-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+7200,expires_in:7200,user})),{token,user})
 let queue=Promise.resolve(), failNext=false, unauthorized=false
 const transact=fn=>{const task=queue.then(async()=>{await api.query('begin');try{await api.query('set local role authenticated');await api.query("select set_config('request.jwt.claim.sub',$1,true)",[adminId]);const result=await fn(api);await api.query('commit');return result}catch(e){await api.query('rollback');throw e}});queue=task.catch(()=>{});return task}
 await context.route('https://jaque-test.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url())
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'}
  const respond=(json,status=200)=>route.fulfill({status,headers,body:JSON.stringify(json)})
  if(req.method()==='OPTIONS')return respond({})
  try{
   if(url.pathname.includes('/auth/v1/'))return respond(user)
   if(url.pathname.endsWith('/admin_users'))return respond(unauthorized?[]:[{user_id:adminId}])
   if(url.pathname.endsWith('/rpc/admin_snapshot')) {
    if(failNext){failNext=false;return respond({code:'P0001',message:'Falha de conexão simulada'},503)}
    return respond(await transact(snapshot))
   }
   if(url.pathname.endsWith('/rpc/admin_deletion_info')){const body=req.postDataJSON();return respond(await transact(async client=>(await client.query('select public.admin_deletion_info($1,$2) as info',[body.p_kind,body.p_id])).rows[0].info))}
   if(url.pathname.endsWith('/rpc/admin_execute')) {const body=req.postDataJSON();return respond(await transact(client=>command(client,body.p_action,body.p_data,body.p_request)))}
   if(url.pathname.endsWith('/categories'))return respond(await transact(async client=>(await client.query('select * from public.categories order by sort_order')).rows))
   if(url.pathname.endsWith('/catalog_products'))return respond(await transact(async client=>(await client.query('select * from public.catalog_products')).rows))
   if(url.pathname.endsWith('/products'))return respond(await transact(async client=>(await client.query("select to_jsonb(p)||jsonb_build_object('categories',jsonb_build_object('name',c.name),'product_images','[]'::jsonb) as row from public.products p join public.categories c on c.id=p.category_id")).rows.map(r=>r.row)))
   return respond({message:'Rota de teste não implementada'},404)
  }catch(e){return respond({code:e.code??'P0001',message:e.message},400)}
 })
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
 const visible=async locator=>{await locator.waitFor({state:'visible',timeout:15000});assert.ok(await locator.isVisible())}
 try{
  await page.goto(base)
  await visible(page.getByRole('heading',{name:'Nossas joias'}))
  await visible(page.getByText('R$ 144,00 no Pix',{exact:false}).first())
  await page.getByRole('button',{name:'Adicionar à seleção'}).first().click()
  await page.getByRole('button',{name:/Ver minha seleção/}).click()
  await page.getByRole('button',{name:'Revisar e solicitar condicional'}).click()
  await visible(page.getByRole('heading',{name:'Revisar solicitação'}))
  await visible(page.getByText('Total estimado no Pix (10%)'))
  await page.getByRole('button',{name:'Fechar',exact:true}).click()
  await page.goto(`${base}/admin/clientes`)
  await visible(page.getByRole('heading',{name:'Clientes',exact:true}))
  await page.getByRole('button',{name:'Cadastrar cliente'}).click()
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Nome',{exact:true}).fill('Cliente Navegador')
  await dialog.getByLabel('Telefone (opcional)').fill('000000000')
  await dialog.getByRole('button',{name:'Salvar cliente'}).click()
  await visible(page.getByRole('heading',{name:'Cliente Navegador',exact:true}))
  assert.equal(await page.getByRole('link',{name:'Estoque',exact:true}).count(),0)
  await page.goto(`${base}/admin/estoque`)
  await visible(page.getByRole('heading',{name:'Produtos',exact:true}))
  assert.equal(new URL(page.url()).pathname,'/admin/produtos')
  const stockProductRow=page.getByRole('row').filter({has:page.getByText('Anel',{exact:true})})
  await stockProductRow.getByRole('button',{name:'Movimentações'}).click()
  await visible(dialog.getByText('Disponível:',{exact:false}))
  await page.screenshot({path:fileURLToPath(new URL('docs/browser-product-movements.png',root)),fullPage:true})
  await dialog.getByLabel('Variação',{exact:false}).fill('1');await dialog.getByLabel('Motivo / observação').fill('Reposição navegador')
  await dialog.getByRole('button',{name:'Confirmar registro'}).click()
  await visible(dialog.getByText('Operação confirmada e registrada.'))
  await visible(dialog.getByText('Disponível:',{exact:false}))
  await dialog.getByRole('button',{name:'Fechar',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  assert.equal((await stockProductRow.getByRole('cell').nth(4).innerText()).trim(),'5')
  assert.equal(await page.getByRole('link',{name:'Condicionais',exact:true}).count(),0)
  await page.goto(`${base}/admin/condicionais`)
  await visible(page.getByRole('heading',{name:'Início',exact:true}))
  assert.equal(new URL(page.url()).pathname,'/admin')
  assert.equal(await page.getByText('Condicionais abertas',{exact:true}).count(),0)
  assert.equal(await page.getByText('Unidades em condicional',{exact:true}).count(),0)
  assert.equal(await page.locator('.stats .stat').count(),9)
  await visible(page.getByText('Unidades disponíveis',{exact:true}))
  await page.screenshot({path:fileURLToPath(new URL('docs/browser-dashboard-current.png',root)),fullPage:true})
  assert.equal(await page.getByRole('button',{name:'Preparar entrega física'}).count(),0)
  await page.getByRole('link',{name:'Vendas',exact:true}).click()
  const extraProduct=await productFor(owner,2)
  await owner.query("update public.products set name='Brinco navegador' where id=$1",[extraProduct])
  await page.getByRole('button',{name:'Atualizar dados'}).click()
  await page.getByRole('button',{name:'Registrar venda direta'}).click()
  const browserCustomer=(await owner.query("select id from public.customers where name='Cliente Navegador'")).rows[0].id
  await dialog.getByLabel(/^Cliente/).selectOption(browserCustomer)
  await dialog.getByRole('checkbox',{name:/^Anel/}).check()
  await dialog.getByRole('checkbox',{name:/^Brinco navegador/}).check()
  await visible(dialog.getByText('Total da venda: R$ 260,00',{exact:true}))
  await dialog.getByLabel('Brinco navegador (máximo atual 2)').fill('2')
  await visible(dialog.getByText('Total da venda: R$ 360,00',{exact:true}))
  await dialog.getByLabel(/^Preço/).selectOption('pix')
  await visible(dialog.getByText('Total da venda: R$ 324,00',{exact:true}))
  await dialog.getByLabel('Buscar produto').fill('Brinco')
  await dialog.getByRole('checkbox',{name:/^Brinco navegador/}).uncheck()
  await visible(dialog.getByText('Total da venda: R$ 144,00',{exact:true}))
  await dialog.getByRole('checkbox',{name:/^Brinco navegador/}).check()
  await dialog.getByLabel('Brinco navegador (máximo atual 2)').fill('2')
  await dialog.getByLabel('Buscar produto').fill('')
  await visible(dialog.getByText('Total da venda: R$ 324,00',{exact:true}))
  await page.screenshot({path:fileURLToPath(new URL('docs/browser-sale-multiple.png',root)),fullPage:true})
  await dialog.getByLabel('Condição de recebimento').selectOption('store_credit')
  await dialog.getByLabel('Recebido agora',{exact:false}).fill('224')
  await dialog.getByRole('checkbox',{name:'Conferi as peças, o preço e o recebimento informado.'}).check();await dialog.getByRole('button',{name:'Confirmar e registrar'}).click()
  await dialog.waitFor({state:'hidden'})
  const multiSale=(await snapshot(owner)).sales.find(s=>s.customer_id===browserCustomer)
  const multiState=await snapshot(owner)
  assert.equal(multiState.sale_items.filter(i=>i.sale_id===multiSale.id).length,2)
  assert.equal(Number(multiSale.net_total),324)
  assert.equal(multiState.products.find(p=>p.id===extraProduct).stock_quantity,0)
  assert.equal(await page.getByRole('link',{name:'Recebimentos',exact:true}).count(),0)
  await page.getByRole('button',{name:'Recebimentos',exact:true}).click()
  await visible(page.getByRole('heading',{name:'Contas a receber',exact:true}))
  assert.equal(new URL(page.url()).pathname,'/admin/vendas')
  await page.goto(`${base}/admin/recebimentos`)
  await visible(page.getByRole('heading',{name:'Contas a receber',exact:true}))
  assert.equal(new URL(page.url()).pathname,'/admin/vendas')
  assert.equal(new URL(page.url()).searchParams.get('aba'),'recebimentos')
  const saleCard=page.locator('.management-card').filter({has:page.getByRole('heading',{name:/Cliente Navegador/})}).filter({has:page.getByRole('button',{name:'Registrar recebimento'})})
  await saleCard.getByRole('button',{name:'Registrar recebimento'}).click()
  await dialog.getByLabel('Valor em R$',{exact:false}).fill('100')
  await dialog.getByRole('button',{name:'Confirmar registro'}).click()
  await page.getByRole('button',{name:'Ver vendas',exact:true}).click()
  const fullSale=page.locator('.management-card').filter({has:page.getByRole('heading',{name:/Cliente Navegador/})})
  await visible(fullSale.getByText('Quitada',{exact:false}))
  await fullSale.getByRole('button',{name:'Cancelar venda inteira'}).click()
  await dialog.getByLabel('Motivo / observação').fill('Cancelamento navegador')
  for(const box of await dialog.getByRole('checkbox').all())await box.check()
  await dialog.getByRole('button',{name:'Confirmar registro'}).click()
  await visible(fullSale.getByText('Cancelada/devolvida integralmente',{exact:false}))
  await page.getByRole('link',{name:'Relatórios',exact:true}).click()
  assert.equal(await page.getByText('Condicionais abertas',{exact:true}).count(),0)
  assert.equal(await page.getByText('Unidades em condicional',{exact:true}).count(),0)
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar vendas CSV'}).click()
  assert.equal((await downloadEvent).suggestedFilename(),'vendas.csv')
  failNext=true;await page.getByRole('button',{name:'Atualizar dados'}).click()
  await visible(page.getByRole('alert').filter({hasText:'Falha de conexão simulada'}))
  await page.getByRole('button',{name:'Atualizar dados'}).click()
  await page.setViewportSize({width:390,height:844})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'layout não deve criar overflow horizontal')
  await page.screenshot({path:fileURLToPath(new URL('docs/browser-mobile.png',root)),fullPage:true})
  await page.setViewportSize({width:1280,height:900})
  await page.getByRole('link',{name:'Clientes',exact:true}).click()
  await page.getByRole('button',{name:'Cadastrar cliente'}).click()
  await dialog.getByLabel('Nome',{exact:true}).fill('Cliente Exclusão')
  await dialog.getByRole('button',{name:'Salvar cliente'}).click()
  const emptyCustomerCard=page.locator('.management-card').filter({has:page.getByRole('heading',{name:'Cliente Exclusão',exact:true})})
  await emptyCustomerCard.getByRole('button',{name:'Excluir cliente'}).click()
  await visible(dialog.getByText('não poderá ser desfeita',{exact:false}))
  assert.ok(await dialog.getByRole('button',{name:'Excluir definitivamente',exact:true}).isDisabled())
  await page.screenshot({path:fileURLToPath(new URL('docs/browser-v41-delete.png',root)),fullPage:true})
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button',{name:'Excluir definitivamente',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  assert.equal(await page.getByRole('heading',{name:'Cliente Exclusão',exact:true}).count(),0)
  const withHistory=page.locator('.management-card').filter({has:page.getByRole('heading',{name:'Cliente Navegador',exact:true})})
  await withHistory.getByRole('button',{name:'Excluir cliente'}).click()
  await visible(dialog.getByText('Exclusão definitiva bloqueada.',{exact:true}))
  assert.equal(await dialog.getByRole('button',{name:'Excluir definitivamente',exact:true}).count(),0)
  await page.screenshot({path:fileURLToPath(new URL('docs/browser-v41-blocked.png',root)),fullPage:true})
  await dialog.getByRole('button',{name:'Arquivar cliente',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  assert.equal(await page.getByRole('heading',{name:'Cliente Navegador',exact:true}).count(),0)
  await page.getByLabel(/^Status/).selectOption('archived')
  await withHistory.getByRole('button',{name:'Reativar',exact:true}).click()
  await dialog.getByRole('button',{name:'Reativar cadastro',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  await page.getByLabel(/^Status/).selectOption('')
  await visible(page.getByRole('heading',{name:'Cliente Navegador',exact:true}))
  const disposable=await productFor(owner,0)
  await owner.query("update public.products set name='Peça descartável navegador' where id=$1",[disposable])
  await page.getByRole('link',{name:'Produtos',exact:true}).click()
  const productRow=page.getByRole('row').filter({hasText:'Peça descartável navegador'})
  await productRow.getByRole('button',{name:'Excluir peça',exact:true}).click()
  await visible(dialog.getByText('não poderá ser desfeita',{exact:false}))
  await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Excluir definitivamente',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  assert.equal(await page.getByRole('row').filter({hasText:'Peça descartável navegador'}).count(),0)
  await page.getByRole('row').filter({has:page.getByText('Anel',{exact:true})}).getByRole('button',{name:'Excluir peça'}).click()
  await visible(dialog.getByText('Exclusão definitiva bloqueada.',{exact:true}))
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click()
  unauthorized=true;await page.reload()
  await visible(page.getByRole('heading',{name:'Acesso não autorizado'}))
  assert.deepEqual(errors,[])
  const state=await snapshot(owner)
  const browserSale=state.sales.find(s=>s.customer_id===browserCustomer)
  assert.equal(Number(browserSale.net_total),0);assert.equal(Number(browserSale.balance),0)
  assert.equal(state.products.find(p=>p.id===id(1)).stock_quantity,5)
 }catch(e){await page.screenshot({path:fileURLToPath(new URL('docs/browser-failure.png',root)),fullPage:true});console.error((await page.locator('body').innerText()).slice(-5000));console.error(errors);throw e}finally{await context.close();await browser.close();await api.end();await vite.close()}
})


test('script único para SQL Editor executa integralmente e desfaz fixtures', async()=>{
 const before=(await owner.query('select count(*)::int as n from public.sales')).rows[0].n
 const results=await owner.query(await readFile(new URL('supabase/tests_full_sql_editor.sql',root),'utf8'))
 assert.ok(results.at(-1).rows[0].resultado.startsWith('PASSOU:'))
 assert.equal((await owner.query('select count(*)::int as n from public.sales')).rows[0].n,before)
})

test('venda com promoção zero continua válida; categoria/descrição históricas e preço Pix são protegidos',async()=>{
 await asRole('authenticated',adminId,async client=>{
  const pid=await productFor(client,2)
  await client.query("update public.products set promo_price=0,description='Descrição original' where id=$1",[pid])
  const sale=await command(client,'sale_create',{customer_id:id(2),items:[{product_id:pid,quantity:1}],pricing_method:'pix',collection_terms:'immediate',received:0,payment_method:'pix'})
  await client.query("update public.products set name='Nome novo',description='Outra descrição',promo_price=null,category_id=(select id from public.categories where slug='brincos') where id=$1",[pid])
  const state=await snapshot(client),row=state.sales.find(s=>s.id===sale.id),line=state.sale_items.find(l=>l.sale_id===sale.id)
  assert.equal(Number(row.net_total),0);assert.equal(Number(row.remaining_units),1)
  assert.equal(line.product_description,'Descrição original');assert.equal(line.category_name,'Anéis')
  const paid=await command(client,'sale_create',{customer_id:id(2),items:[{product_id:pid,quantity:1}],pricing_method:'pix',collection_terms:'store_credit',received:0})
  await rejectsCommand(client,'payment_add',{sale_id:paid.id,amount:1,method:'card'},/incompatível/)
 })
})


async function deletionInfo(client,kind,id){return (await client.query('select public.admin_deletion_info($1,$2) as info',[kind,id])).rows[0].info}

test('V4.1 exclui cliente sem histórico, preserva auditoria/identidade e aceita replay',async()=>{
 await asRole('authenticated',adminId,async client=>{
  const c=await command(client,'customer_save',{name:'Cliente sem vínculos'})
  assert.equal((await deletionInfo(client,'customer',c.id)).allowed,true)
  const key=randomUUID(),payload={id:c.id,confirm_name:'Cliente sem vínculos'}
  const first=await command(client,'customer_delete',payload,key)
  assert.equal(first.deleted,true)
  assert.deepEqual(await command(client,'customer_delete',payload,key),first)
  assert.equal((await client.query('select * from public.customers where id=$1',[c.id])).rows.length,0)
  assert.equal((await client.query('select * from public.customer_audit where customer_id=$1',[c.id])).rows.length,1)
  assert.equal((await client.query('select * from public.customer_audit_subjects where id=$1',[c.id])).rows.length,1)
  assert.equal((await client.query('select * from public.operation_requests where id=$1',[key])).rows.length,1)
 })
})

test('V4.1 bloqueia cliente com vendas/condicionais e com alterações relevantes de auditoria',async()=>{
 await asRole('authenticated',adminId,async client=>{
  const info=await deletionInfo(client,'customer',id(2));assert.equal(info.allowed,false)
  assert.ok(info.reasons.some(r=>r.includes('vendas')));assert.ok(info.reasons.some(r=>r.includes('condicionais')))
  await rejectsCommand(client,'customer_delete',{id:id(2),confirm_name:'Cliente teste'},/bloqueada/)
  const c=await command(client,'customer_save',{name:'Cliente editado'})
  await command(client,'customer_save',{id:c.id,name:'Cliente editado',notes:'Histórico relevante'})
  assert.equal((await deletionInfo(client,'customer',c.id)).allowed,false)
  await rejectsCommand(client,'customer_delete',{id:c.id,confirm_name:'Cliente editado'},/auditoria/)
 })
})

test('V4.1 arquiva/reativa cliente sem sobrescrever campos e impede novas operações enquanto arquivado',async()=>{
 await asRole('authenticated',adminId,async client=>{
  const c=await command(client,'customer_save',{name:'Cliente arquivável',phone:'000',notes:'Preservar'})
  const key=randomUUID()
  await command(client,'customer_archive',{id:c.id,archived:true},key)
  await command(client,'customer_archive',{id:c.id,archived:true},key)
  let state=await snapshot(client);let customer=state.customers.find(x=>x.id===c.id)
  assert.ok(customer.archived_at);assert.equal(customer.notes,'Preservar');assert.equal(customer.phone,'000')
  await rejectsCommand(client,'conditional_deliver',{customer_id:c.id,items:[{product_id:id(1),quantity:1}]},/no rows|não encontrado/i)
  await command(client,'customer_archive',{id:c.id,archived:false})
  state=await snapshot(client);assert.equal(state.customers.find(x=>x.id===c.id).archived_at,null)
  assert.equal(state.customer_audit.filter(x=>x.customer_id===c.id).length,3) // INSERT + dois estados, sem replay duplicado
 })
})

test('V4.1 exclui peça sem estoque/histórico e repete a mesma chave sem novo efeito',async()=>{
 await asRole('authenticated',adminId,async client=>{
  const pid=await productFor(client,0),key=randomUUID(),payload={id:pid,confirm_name:'Joia de teste'}
  assert.equal((await deletionInfo(client,'product',pid)).allowed,true)
  const first=await command(client,'product_delete',payload,key)
  assert.equal(first.deleted,true);assert.deepEqual(await command(client,'product_delete',payload,key),first)
  assert.equal((await client.query('select * from public.products where id=$1',[pid])).rows.length,0)
  await client.query('savepoint invalid_key')
  await assert.rejects(command(client,'product_delete',{...payload,confirm_name:'outro nome'},key),/Chave reutilizada/)
  await client.query('rollback to savepoint invalid_key')
 })
})

test('V4.1 bloqueia peça vendida e preserva snapshots, recebimentos e saldo',async()=>{
 await asRole('authenticated',adminId,async client=>{
  const pid=await productFor(client,1)
  const sale=await command(client,'sale_create',{customer_id:id(2),items:[{product_id:pid,quantity:1}],pricing_method:'card',collection_terms:'immediate',received:100,payment_method:'card'})
  const before=await snapshot(client),info=await deletionInfo(client,'product',pid)
  assert.equal(info.allowed,false);assert.ok(info.reasons.some(r=>r.includes('vendas')))
  await rejectsCommand(client,'product_delete',{id:pid,confirm_name:'Joia de teste'},/bloqueada/)
  const after=await snapshot(client)
  assert.deepEqual(after.sales.find(s=>s.id===sale.id),before.sales.find(s=>s.id===sale.id))
  assert.deepEqual(after.payments.filter(p=>p.sale_id===sale.id),before.payments.filter(p=>p.sale_id===sale.id))
 })
})

test('V4.1 bloqueia peça em condicional pendente e também após encerramento',async()=>{
 await asRole('authenticated',adminId,async client=>{
  const pid=await productFor(client,1)
  const c=await command(client,'conditional_deliver',{customer_id:id(2),items:[{product_id:pid,quantity:1}]})
  let info=await deletionInfo(client,'product',pid);assert.ok(info.reasons.some(r=>r.includes('condicionais')))
  await rejectsCommand(client,'product_delete',{id:pid,confirm_name:'Joia de teste'},/bloqueada/)
  const item=(await snapshot(client)).conditional_items.find(i=>i.conditional_id===c.id)
  await command(client,'conditional_resolve',{item_id:item.id,kind:'return',quantity:1,reason:'Retorno integral'})
  info=await deletionInfo(client,'product',pid);assert.equal(info.allowed,false)
  assert.ok(info.reasons.some(r=>r.includes('condicionais')))
 })
})

test('V4.1 bloqueia histórico de estoque mesmo com saldo zerado e fotos sem apagar Storage',async()=>{
 await asRole('authenticated',adminId,async client=>{
  const pid=await productFor(client,1)
  await command(client,'stock_adjust',{product_id:pid,delta:-1,kind:'loss',reason:'Perda registrada'})
  const info=await deletionInfo(client,'product',pid);assert.ok(info.reasons.some(r=>r.includes('movimentação')))
  await rejectsCommand(client,'product_delete',{id:pid,confirm_name:'Joia de teste'},/bloqueada/)
  const photoProduct=await productFor(client,0),path=photoProduct+'/photo.jpg'
  await client.query('insert into public.product_images(product_id,storage_path) values($1,$2)',[photoProduct,path])
  const images=await deletionInfo(client,'product',photoProduct);assert.equal(images.allowed,false);assert.ok(images.reasons.some(r=>r.includes('fotos')))
  await rejectsCommand(client,'product_delete',{id:photoProduct,confirm_name:'Joia de teste'},/fotos/)
  assert.equal((await client.query('select * from public.product_images where storage_path=$1',[path])).rows.length,1)
 })
})

test('V4.1 visitante/login comum não excluem nem inspecionam e a API não recebe DELETE direto',async()=>{
 for(const [role,user] of [['anon',null],['authenticated',otherId]]){
  await assert.rejects(asRole(role,user,c=>command(c,'customer_delete',{id:id(2),confirm_name:'Cliente teste'})),e=>e.code==='42501')
  await assert.rejects(asRole(role,user,c=>deletionInfo(c,'product',id(1))),e=>e.code==='42501')
 }
 for(const table of ['customers','products'])await fails(`delete from public.${table} where id='${id(1)}'`,'42501','authenticated',adminId)
 for(const fn of ['public.admin_execute_v40(uuid,text,jsonb)','public.deletion_dependencies(text,uuid)','public.guard_record_delete()']){
  const acl=(await owner.query("select has_function_privilege('authenticated',$1,'EXECUTE') as allowed",[fn])).rows[0]
  assert.equal(acl.allowed,false)
 }
})

test('V4.1 arquiva/reativa peça, oculta do catálogo e bloqueia nova venda mesmo de condicional',async()=>{
 await asRole('authenticated',adminId,async client=>{
  const pid=await productFor(client,2), c=await command(client,'conditional_deliver',{customer_id:id(2),items:[{product_id:pid,quantity:1}]})
  await command(client,'product_archive',{id:pid,archived:true})
  assert.equal((await client.query('select * from public.catalog_products where id=$1',[pid])).rows.length,0)
  await rejectsCommand(client,'sale_create',{customer_id:id(2),conditional_id:c.id,items:[{product_id:pid,quantity:1}],pricing_method:'card',collection_terms:'immediate',received:100,payment_method:'card'},/arquivada/)
  await command(client,'product_archive',{id:pid,archived:false})
  assert.equal((await client.query('select * from public.catalog_products where id=$1',[pid])).rows.length,0) // continua inativo
  await client.query('update public.products set is_active=true where id=$1',[pid])
  assert.equal((await client.query('select * from public.catalog_products where id=$1',[pid])).rows.length,1)
 })
})

test('V4.1 bloqueia referência futura, inclusive FK que tentaria apagar em cascata',async()=>{
 await asRole('postgres',adminId,async client=>{
  const c=await command(client,'customer_save',{name:'Cliente dependência futura'})
  await client.query('create table public.v41_test_dependency(customer_id uuid references public.customers(id) on delete cascade)')
  await client.query('insert into public.v41_test_dependency values($1)',[c.id])
  const info=await deletionInfo(client,'customer',c.id);assert.ok(info.reasons.some(r=>r.includes('v41_test_dependency')))
  await rejectsCommand(client,'customer_delete',{id:c.id,confirm_name:'Cliente dependência futura'},/bloqueada/)
  assert.equal((await client.query('select * from public.v41_test_dependency')).rows.length,1)
 })
})

test('V4.1 rollback restaura cadastro se gravar a operação idempotente falhar após DELETE',async()=>{
 await asRole('postgres',adminId,async client=>{
  const c=await command(client,'customer_save',{name:'Cliente rollback'})
  await client.query(`create function public.v41_reject_delete_log() returns trigger language plpgsql as $$ begin
   if new.operation='customer_delete' then raise exception 'Falha fictícia no ledger';end if;return new;end $$;
   create trigger v41_reject_delete_log before insert on public.operation_requests for each row execute function public.v41_reject_delete_log()`)
  await rejectsCommand(client,'customer_delete',{id:c.id,confirm_name:'Cliente rollback'},/Falha fictícia/)
  assert.equal((await client.query('select * from public.customers where id=$1',[c.id])).rows.length,1)
  assert.equal((await client.query('select * from public.customer_audit where customer_id=$1',[c.id])).rows.length,1)
 })
})

test('V4.1 concorrência entre excluir cliente e entregar condicional preserva integridade nas duas ordens',async()=>{
 for(const deletingFirst of [true,false]){
  const customer=await command(owner,'customer_save',{name:'Cliente concorrência V4.1'})
  const pid=await productFor(owner,1)
  const first=server.getPgClient('postgres','127.0.0.1'),second=server.getPgClient('postgres','127.0.0.1')
  await Promise.all([first.connect(),second.connect()])
  try{
   for(const c of [first,second]){await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[adminId])}
   const deletion={id:customer.id,confirm_name:'Cliente concorrência V4.1'}
   const delivery={customer_id:customer.id,items:[{product_id:pid,quantity:1}]}
   await command(first,deletingFirst?'customer_delete':'conditional_deliver',deletingFirst?deletion:delivery)
   const rejected=assert.rejects(command(second,deletingFirst?'conditional_deliver':'customer_delete',deletingFirst?delivery:deletion),deletingFirst?/no rows|não encontrado/:/bloqueada/)
   await first.query('commit');await rejected;await second.query('rollback')
   assert.equal((await owner.query('select count(*)::int as n from public.customers where id=$1',[customer.id])).rows[0].n,deletingFirst?0:1)
   assert.equal((await owner.query('select count(*)::int as n from public.conditionals where customer_id=$1',[customer.id])).rows[0].n,deletingFirst?0:1)
  }finally{await Promise.all([first.query('rollback'),second.query('rollback')]);await Promise.all([first.end(),second.end()])}
 }
})

test('V4.1 nome alterado após confirmação prévia exige nova conferência e não apaga peça errada',async()=>{
 await asRole('authenticated',adminId,async c=>{
  const pid=await productFor(c,0)
  assert.equal((await deletionInfo(c,'product',pid)).allowed,true)
  await c.query("update public.products set name='Peça renomeada' where id=$1",[pid])
  await rejectsCommand(c,'product_delete',{id:pid,confirm_name:'Joia de teste'},/nome.*mudou/i)
  assert.equal((await c.query('select name from public.products where id=$1',[pid])).rows[0].name,'Peça renomeada')
 })
})

test('V4.1 script de homologação SQL Editor executa e reverte todas as fixtures',async()=>{
 const before=(await owner.query('select count(*)::int as n from public.customers')).rows[0].n
 const results=await owner.query(await readFile(new URL('supabase/tests_v41_sql_editor.sql',root),'utf8'))
 assert.ok(results.at(-1).rows[0].resultado.startsWith('PASSOU:'))
 assert.equal((await owner.query('select count(*)::int as n from public.customers')).rows[0].n,before)
})

test('V4.1 migra base V4.0 já populada sem alterar cadastros/auditoria e mantém identidade após excluir',async()=>{
 const name='jaque_v41_upgrade_fixture'
 await owner.query(`create database ${name}`)
 const db=server.getPgClient(name,'127.0.0.1');await db.connect()
 try{
  const fixture=(await readFile(new URL('tests/database/platform-fixture.sql',root),'utf8')).replace('create role anon nologin;','').replace('create role authenticated nologin;','')
  await db.query(fixture)
  for(const file of ['20260101000000_fundacao.sql','20261028000000_gestao_base.sql','20261029000000_operacoes.sql'])await db.query(await readFile(new URL(`supabase/migrations/${file}`,root),'utf8'))
  await db.query(`insert into auth.users(id) values('${adminId}');insert into public.admin_users(user_id) values('${adminId}');select set_config('request.jwt.claim.sub','${adminId}',false)`)
  const created=await command(db,'customer_save',{name:'Cliente existente antes da V4.1',notes:'Não alterar'})
  const customerBefore=(await db.query('select * from public.customers where id=$1',[created.id])).rows[0]
  const auditBefore=(await db.query('select * from public.customer_audit where customer_id=$1',[created.id])).rows
  await db.query(await readFile(new URL('supabase/migrations/20261029010000_exclusao_segura_v41.sql',root),'utf8'))
  assert.deepEqual((await db.query('select * from public.customers where id=$1',[created.id])).rows[0],customerBefore)
  assert.deepEqual((await db.query('select * from public.customer_audit where customer_id=$1',[created.id])).rows,auditBefore)
  await command(db,'customer_delete',{id:created.id,confirm_name:'Cliente existente antes da V4.1'})
  assert.deepEqual((await db.query('select * from public.customer_audit where customer_id=$1',[created.id])).rows,auditBefore)
  assert.equal((await db.query('select * from public.customer_audit_subjects where id=$1',[created.id])).rows.length,1)
 }finally{await db.end();await owner.query(`drop database ${name}`)}
})
