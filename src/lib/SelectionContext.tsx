import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  addToSelection, countItems, removeFromSelection, setQuantity, syncSelection,
  type CatalogEntry, type Refs, type Selection, type SelectionChange,
} from './selection'

/** Dados mínimos da peça necessários para guardá-la na seleção. */
export interface AddableProduct { id: string; name: string; cents: number; available: number }

interface Ctx {
  selection: Selection
  count: number
  /** Avisos pendentes (preço mudou, peça saiu do catálogo, quantidade ajustada) ainda não vistos pela cliente. */
  notices: SelectionChange[]
  add: (p: AddableProduct) => void
  setQty: (id: string, qty: number, available: number) => void
  remove: (id: string) => void
  /** Confere a seleção com o catálogo atual; devolve as alterações encontradas nesta conferência. */
  syncWithCatalog: (catalog: CatalogEntry[]) => SelectionChange[]
  dismissNotices: () => void
  clear: () => void
}

const KEY = 'jackpratas:selecao'          // mesma chave do Marco 1: seleções existentes continuam valendo
const REFS_KEY = 'jackpratas:selecao-ref' // preço/nome vistos pela cliente ao adicionar
const SelectionCtx = createContext<Ctx | null>(null)

interface State { selection: Selection; refs: Refs; notices: SelectionChange[] }

function readJSON(key: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch { return {} }
}

function load(): State {
  const selection: Selection = {}
  for (const [id, q] of Object.entries(readJSON(KEY))) {
    if (typeof q === 'number' && Number.isInteger(q) && q > 0) selection[id] = q
  }
  const refs: Refs = {}
  for (const [id, r] of Object.entries(readJSON(REFS_KEY))) {
    const o = r as { cents?: unknown; name?: unknown } | null
    if (selection[id] && o && typeof o.cents === 'number' && Number.isInteger(o.cents) && typeof o.name === 'string') {
      refs[id] = { cents: o.cents, name: o.name }
    }
  }
  return { selection, refs, notices: [] }
}

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load)
  const ref = useRef(state)
  const commit = useCallback((next: State) => { ref.current = next; setState(next) }, [])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state.selection))
      localStorage.setItem(REFS_KEY, JSON.stringify(state.refs))
    } catch { /* armazenamento indisponível: a seleção continua funcionando em memória */ }
  }, [state.selection, state.refs])

  const add = useCallback((p: AddableProduct) => {
    const s = ref.current
    const selection = addToSelection(s.selection, p.id, p.available)
    if (selection === s.selection || !selection[p.id]) return
    // O preço de referência é o visto na PRIMEIRA vez que a peça entrou na seleção.
    const refs = s.refs[p.id] ? s.refs : { ...s.refs, [p.id]: { cents: p.cents, name: p.name } }
    commit({ ...s, selection, refs })
  }, [commit])

  const setQty = useCallback((id: string, q: number, available: number) => {
    const s = ref.current
    const selection = setQuantity(s.selection, id, q, available)
    const refs = selection[id] ? s.refs : removeRef(s.refs, id)
    commit({ ...s, selection, refs })
  }, [commit])

  const remove = useCallback((id: string) => {
    const s = ref.current
    commit({ ...s, selection: removeFromSelection(s.selection, id), refs: removeRef(s.refs, id) })
  }, [commit])

  const syncWithCatalog = useCallback((catalog: CatalogEntry[]) => {
    const s = ref.current
    const r = syncSelection(s.selection, s.refs, catalog)
    commit({ selection: r.selection, refs: r.refs, notices: [...s.notices, ...r.changes] })
    return r.changes
  }, [commit])

  const dismissNotices = useCallback(() => commit({ ...ref.current, notices: [] }), [commit])
  const clear = useCallback(() => commit({ selection: {}, refs: {}, notices: [] }), [commit])

  const value = useMemo<Ctx>(
    () => ({
      selection: state.selection, count: countItems(state.selection), notices: state.notices,
      add, setQty, remove, syncWithCatalog, dismissNotices, clear,
    }),
    [state, add, setQty, remove, syncWithCatalog, dismissNotices, clear],
  )
  return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>
}

function removeRef(refs: Refs, id: string): Refs {
  const { [id]: _gone, ...rest } = refs
  return rest
}

export function useSelection(): Ctx {
  const v = useContext(SelectionCtx)
  if (!v) throw new Error('useSelection fora do SelectionProvider')
  return v
}
