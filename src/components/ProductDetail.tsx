import { useState } from 'react'
import Dialog from './Dialog'
import ProductImage from './ProductImage'
import Price from './Price'
import { toCents } from '../lib/money'
import { useSelection } from '../lib/SelectionContext'
import type { CatalogProduct } from '../lib/types'

interface Props { product: CatalogProduct | null; onClose: () => void }

export default function ProductDetail({ product, onClose }: Props) {
  const { selection, add } = useSelection()
  const [idx, setIdx] = useState(0)
  const p = product
  const inSel = p ? selection[p.id] ?? 0 : 0
  const atMax = p ? inSel >= p.available_quantity : true

  return (
    <Dialog open={Boolean(p)} onClose={() => { setIdx(0); onClose() }} label="Detalhes da joia" className="detail">
      {p && (
        <div className="det">
          <div>
            <div className="det-media"><ProductImage path={p.image_paths[idx]} alt={p.name} /></div>
            {p.image_paths.length > 1 && (
              <div className="thumbs">
                {p.image_paths.map((path, i) => (
                  <button key={path} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} aria-label={`Ver foto ${i + 1}`}>
                    <ProductImage path={path} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="det-info">
            <p className="mat">{p.category_name}</p>
            <h2>{p.name}</h2>
            <Price product={p} />
            <p className={p.is_available ? 'avail ok' : 'avail no'}>
              {p.is_available ? `Disponível (${p.available_quantity} ${p.available_quantity === 1 ? 'unidade' : 'unidades'})` : 'Indisponível no momento'}
            </p>
            {p.description && <p className="det-desc">{p.description}</p>}
            <dl className="specs"><div><dt>Material</dt><dd>{p.material}</dd></div></dl>
            <div className="det-actions">
              <button className="btn btn-primary" disabled={!p.is_available || atMax} onClick={() => add({ id: p.id, name: p.name, cents: toCents(p.current_price), available: p.available_quantity })}>
                {inSel > 0 ? `Adicionar mais (${inSel} na seleção)` : 'Adicionar à seleção'}
              </button>
              <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
