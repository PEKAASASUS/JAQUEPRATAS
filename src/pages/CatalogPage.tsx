import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ProductImage from '../components/ProductImage'
import Price from '../components/Price'
import ProductDetail from '../components/ProductDetail'
import SelectionDrawer from '../components/SelectionDrawer'
import { fetchCatalog, fetchCategories } from '../lib/catalog'
import { toCents } from '../lib/money'
import { filterProducts, sortProducts, toCatalogEntries, type Sort } from '../lib/catalogFilter'
import { useSelection } from '../lib/SelectionContext'
import type { CatalogProduct, Category } from '../lib/types'

const toAddable = (p: CatalogProduct) => ({ id: p.id, name: p.name, cents: toCents(p.current_price), available: p.available_quantity })

export default function CatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [cat, setCat] = useState('todos')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('novidades')
  const [detail, setDetail] = useState<CatalogProduct | null>(null)
  const [drawer, setDrawer] = useState(false)
  const { selection, count, add, syncWithCatalog } = useSelection()

  useEffect(() => {
    let alive = true
    setStatus('loading')
    Promise.all([fetchCatalog(), fetchCategories()])
      .then(([prods, cats]) => {
        if (!alive) return
        setProducts(prods)
        setCategories(cats)
        syncWithCatalog(toCatalogEntries(prods))
        setStatus('ok')
      })
      .catch(() => alive && setStatus('error'))
    return () => { alive = false }
  }, [reloadKey, syncWithCatalog])

  const visible = useMemo(() => sortProducts(filterProducts(products, cat, q), sort), [products, cat, q, sort])

  const countByCat = (slug: string) => products.filter(p => p.category_slug === slug).length

  return (
    <>
      <header className="site-header">
        <div className="wrap hd">
          <a className="logo" href="#inicio" aria-label="JaquePratas, ir para o início">
            <img src="/images/logo.png"alt=""className="logo-image"/>JAQUE PRATAS
          </a>
          <button className="btn btn-primary btn-sm" onClick={() => setDrawer(true)}>
            Ver minha seleção{count > 0 ? ` (${count})` : ''}
          </button>
        </div>
      </header>


     


      <main>
        <section className="hero on-dark" id="inicio">
          <div className="wrap hero-in">
            <h1>Elegância em cada detalhe</h1>
            <p>Escolha as joias que quer experimentar, monte sua seleção e peça sua condicional. Sem cadastro, sem senha.</p>
            <a className="btn btn-light" href="#catalogo">Ver joias</a>
          </div>
        </section>

        <section className="section" id="catalogo" aria-labelledby="cat-h">
          <div className="wrap">
            <div className="sec-head"><h2 id="cat-h">Nossas joias</h2></div>

            <div className="toolbar">
              <div className="chips" role="group" aria-label="Filtrar por categoria">
                <button className="chip" aria-pressed={cat === 'todos'} onClick={() => setCat('todos')}>Todas</button>
                {categories.map(c => (
                  <button key={c.id} className="chip" aria-pressed={cat === c.slug} onClick={() => setCat(c.slug)}>
                    {c.name}{status === 'ok' ? ` (${countByCat(c.slug)})` : ''}
                  </button>
                ))}
              </div>
              <div className="tools">
                <label className="field grow">Pesquisar por nome
                  <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Ex.: anel, corrente, brinco…" />
                </label>
                <label className="field">Ordenar por
                  <select value={sort} onChange={e => setSort(e.target.value as Sort)}>
                    <option value="novidades">Novidades</option>
                    <option value="menor">Menor preço</option>
                    <option value="maior">Maior preço</option>
                  </select>
                </label>
              </div>
            </div>

            {status === 'loading' && <p className="state" role="status">Carregando as joias…</p>}
            {status === 'error' && (
              <div className="state" role="alert">
                <p>Não foi possível carregar as joias agora.</p>
                <button className="btn btn-ghost" onClick={() => setReloadKey(k => k + 1)}>Tentar de novo</button>
              </div>
            )}
            {status === 'ok' && products.length === 0 && <p className="state">Ainda não há joias cadastradas. Volte em breve!</p>}
            {status === 'ok' && products.length > 0 && visible.length === 0 && (
              <div className="state">
                <p>Nenhuma joia encontrada.</p>
                <button className="btn btn-ghost" onClick={() => { setQ(''); setCat('todos') }}>Limpar filtros</button>
              </div>
            )}

            <div className="grid">
              {visible.map(p => {
                const inSel = selection[p.id] ?? 0
                return (
                  <article className="card" key={p.id}>
                    <div className="card-media">
                      <button className="media-hit" onClick={() => setDetail(p)} aria-label={`Ver detalhes de ${p.name}`} />
                      <ProductImage path={p.image_paths[0]} alt={`${p.name}, ${p.material}`} />
                      {!p.is_available ? <span className="badge badge-off">Indisponível</span>
                        : p.promo_price !== null ? <span className="badge badge-new">Promoção</span> : null}
                    </div>
                    <div className="card-body">
                      <p className="mat">{p.material}</p>
                      <h3 className="name">{p.name}</h3>
                      <Price product={p} />
                      <div className="card-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setDetail(p)}>Detalhes</button>
                        <button className="btn btn-primary btn-sm" disabled={!p.is_available || inSel >= p.available_quantity}
                          onClick={() => add(toAddable(p))}>
                          {!p.is_available ? 'Indisponível' : inSel > 0 ? `Na seleção (${inSel})` : 'Adicionar à seleção'}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer on-dark">
        <div className="wrap ft-bottom">
          <p>JAQUE PRATAS · Joias em prata</p>
          <Link className="link" to="/admin">Área da loja</Link>
        </div>
      </footer>

      <ProductDetail product={detail} onClose={() => setDetail(null)} />
      <SelectionDrawer open={drawer} onClose={() => setDrawer(false)} products={products} />
    </>
  )
}
