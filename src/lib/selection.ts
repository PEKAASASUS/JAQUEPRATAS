import { formatBRL } from './money'

/** Seleção da cliente (pública). Não reserva estoque: apenas limita a quantidade ao disponível. */
export type Selection = Record<string, number>

export function addToSelection(sel: Selection, id: string, available: number, n = 1): Selection {
  const current = sel[id] ?? 0
  const next = Math.min(current + n, Math.max(available, 0))
  if (next <= 0) return removeFromSelection(sel, id)
  return { ...sel, [id]: next }
}

export function setQuantity(sel: Selection, id: string, qty: number, available: number): Selection {
  if (!Number.isInteger(qty) || qty <= 0) return removeFromSelection(sel, id)
  return { ...sel, [id]: Math.min(qty, Math.max(available, 0)) }
}

export function removeFromSelection(sel: Selection, id: string): Selection {
  const { [id]: _removed, ...rest } = sel
  return rest
}

export function countItems(sel: Selection): number {
  return Object.values(sel).reduce((a, q) => a + q, 0)
}

/** Total em centavos. `unitCents` mapeia id -> preço vigente em centavos. */
export function totalCents(sel: Selection, unitCents: Record<string, number>): number {
  return Object.entries(sel).reduce((acc, [id, q]) => acc + (unitCents[id] ?? 0) * q, 0)
}

/** Remove itens que sumiram do catálogo e reduz quantidades acima do estoque atual. */
export function reconcile(sel: Selection, available: Record<string, number>): Selection {
  const out: Selection = {}
  for (const [id, q] of Object.entries(sel)) {
    const max = available[id] ?? 0
    if (max > 0 && q > 0) out[id] = Math.min(q, max)
  }
  return out
}

// ---------------------------------------------------------------------------
// Marco 2: sincronização da seleção com o catálogo ATUAL e dados da revisão.
// Tudo aqui é puro (sem rede, sem banco): nada reserva estoque nem registra venda.
// ---------------------------------------------------------------------------
/** Referência do que a cliente viu ao adicionar a peça (preço em centavos e nome). */
export interface RefItem { cents: number; name: string }
export type Refs = Record<string, RefItem>

/** Dados atuais de uma peça do catálogo público, já em centavos. */
export interface CatalogEntry { id: string; name: string; cents: number; available: number }

export type SelectionChange =
  | { kind: 'price'; id: string; name: string; oldCents: number; newCents: number }
  | { kind: 'removed'; id: string; name: string }
  | { kind: 'quantity'; id: string; name: string; from: number; to: number }

export interface SyncResult { selection: Selection; refs: Refs; changes: SelectionChange[] }

const UNKNOWN_NAME = 'Uma peça'

/**
 * Confere a seleção contra o catálogo atual (que só traz produtos ativos e não arquivados).
 * - peça ausente do catálogo (arquivada/desativada) ou sem estoque: sai da seleção e é informada;
 * - quantidade acima do disponível: reduzida e informada;
 * - preço diferente do que a cliente viu: preço novo passa a valer e a mudança é informada.
 * Nunca mantém silenciosamente um preço antigo.
 */
export function syncSelection(sel: Selection, refs: Refs, catalog: CatalogEntry[]): SyncResult {
  const byId = new Map(catalog.map(c => [c.id, c]))
  const selection: Selection = {}
  const nextRefs: Refs = {}
  const changes: SelectionChange[] = []

  for (const [id, qty] of Object.entries(sel)) {
    if (!Number.isInteger(qty) || qty <= 0) continue
    const entry = byId.get(id)
    const old = refs[id]
    if (!entry || entry.available <= 0) {
      changes.push({ kind: 'removed', id, name: entry?.name ?? old?.name ?? UNKNOWN_NAME })
      continue
    }
    const finalQty = Math.min(qty, entry.available)
    if (finalQty < qty) changes.push({ kind: 'quantity', id, name: entry.name, from: qty, to: finalQty })
    if (old && old.cents !== entry.cents) {
      changes.push({ kind: 'price', id, name: entry.name, oldCents: old.cents, newCents: entry.cents })
    }
    selection[id] = finalQty
    nextRefs[id] = { cents: entry.cents, name: entry.name }
  }
  return { selection, refs: nextRefs, changes }
}

export interface ReviewLine { id: string; name: string; quantity: number; unitCents: number; subtotalCents: number }

/** Linhas da revisão (na ordem em que foram adicionadas), a partir do catálogo atual. */
export function buildReviewLines(sel: Selection, catalog: CatalogEntry[]): ReviewLine[] {
  const byId = new Map(catalog.map(c => [c.id, c]))
  const lines: ReviewLine[] = []
  for (const [id, quantity] of Object.entries(sel)) {
    const e = byId.get(id)
    if (!e || !Number.isInteger(quantity) || quantity <= 0) continue
    lines.push({ id, name: e.name, quantity, unitCents: e.cents, subtotalCents: e.cents * quantity })
  }
  return lines
}

export function linesTotalCents(lines: ReviewLine[]): number {
  return lines.reduce((acc, l) => acc + l.subtotalCents, 0)
}

/** Texto amigável (pt-BR) para avisar a cliente de uma alteração. */
export function describeChange(c: SelectionChange): string {
  switch (c.kind) {
    case 'price':
      return `${c.name}: o preço mudou de ${formatBRL(c.oldCents)} para ${formatBRL(c.newCents)}.`
    case 'removed':
      return `${c.name}: não está mais disponível e saiu da sua seleção.`
    case 'quantity':
      return `${c.name}: a quantidade foi ajustada de ${c.from} para ${c.to}, o máximo disponível agora.`
  }
}
