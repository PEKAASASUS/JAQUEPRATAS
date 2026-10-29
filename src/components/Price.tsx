import { formatBRL, toCents, pixCents } from '../lib/money'
import type { CatalogProduct } from '../lib/types'

export default function Price({ product }: { product: CatalogProduct }) {
  // current_price vem da view: coalesce(promo_price, price), validado pelos CHECKs.
  const card = toCents(product.current_price)
  return (
    <div className="price">
      {product.promo_price !== null && <s className="price-old" aria-label={`Preço normal ${formatBRL(toCents(product.price))}`}>{formatBRL(toCents(product.price))}</s>}
      <p>{formatBRL(card)} no cartão</p>
      <p className="fine">{formatBRL(pixCents(card))} no Pix (10% de desconto)</p>
    </div>
  )
}
