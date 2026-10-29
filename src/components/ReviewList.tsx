import { formatBRL, pixCents } from '../lib/money'
import type { ReviewLine } from '../lib/selection'

/** Lista de conferência: peça, quantidade, preço unitário, subtotal e total estimado. */
export default function ReviewList({ lines, totalCents }: { lines: ReviewLine[]; totalCents: number }) {
  return (
    <>
      <ul className="review-list" aria-label="Peças da solicitação">
        {lines.map(l => (
          <li key={l.id} className="review-line">
            <p className="review-name">{l.name}</p>
            <p className="review-calc">
              Cartão: {l.quantity} × {formatBRL(l.unitCents)} = <b>{formatBRL(l.subtotalCents)}</b>
            </p>
            <p className="review-calc">Pix: {l.quantity} × {formatBRL(pixCents(l.unitCents))} = <b>{formatBRL(pixCents(l.unitCents) * l.quantity)}</b></p>
          </li>
        ))}
      </ul>
      <div className="sub"><span>Total estimado no cartão</span><b>{formatBRL(totalCents)}</b></div>
      <div className="sub"><span>Total estimado no Pix (10%)</span><b>{formatBRL(lines.reduce((sum, l) => sum + pixCents(l.unitCents) * l.quantity, 0))}</b></div>
    </>
  )
}
