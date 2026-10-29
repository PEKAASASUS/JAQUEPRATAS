import { supabase } from './supabase'
import type { CatalogProduct, Category } from './types'

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('id, slug, name, sort_order').order('sort_order')
  if (error) throw new Error('Não foi possível carregar as categorias.')
  return (data ?? []) as Category[]
}

export async function fetchCatalog(): Promise<CatalogProduct[]> {
  const { data, error } = await supabase
    .from('catalog_products')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error('Não foi possível carregar as joias agora.')
  return (data ?? []) as CatalogProduct[]
}

export { normalize } from './catalogFilter'
