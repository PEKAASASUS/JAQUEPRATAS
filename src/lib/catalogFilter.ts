import { toCents } from './money'
import type { CatalogProduct } from './types'
import type { CatalogEntry } from './selection'

export type Sort = 'novidades' | 'menor' | 'maior'

/** Minúsculas e sem acentos, para a pesquisa ignorar "Anél" x "anel". */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Filtra por categoria ('todos' = todas) e pesquisa (todas as palavras precisam aparecer). */
export function filterProducts(products: CatalogProduct[], category: string, query: string): CatalogProduct[] {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean)
  return products.filter(p => {
    if (category !== 'todos' && p.category_slug !== category) return false
    if (!words.length) return true
    const hay = normalize(`${p.name} ${p.category_name} ${p.material} ${p.description}`)
    return words.every(w => hay.includes(w))
  })
}

export function sortProducts(list: CatalogProduct[], sort: Sort): CatalogProduct[] {
  return [...list].sort((a, b) => {
    if (sort === 'menor') return toCents(a.current_price) - toCents(b.current_price)
    if (sort === 'maior') return toCents(b.current_price) - toCents(a.current_price)
    return b.created_at.localeCompare(a.created_at)
  })
}

/** Dados do catálogo no formato usado pela seleção (preço em centavos). */
export function toCatalogEntries(products: CatalogProduct[]): CatalogEntry[] {
  return products.map(p => ({ id: p.id, name: p.name, cents: toCents(p.current_price), available: p.available_quantity }))
}
