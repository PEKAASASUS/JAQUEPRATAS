import { PRODUCT_BUCKET, supabase } from './supabase'
import type { AdminProduct } from './types'

export interface ProductInput {
  sku: string | null
  name: string
  category_id: string
  description: string
  material: string
  price: string          // "89.90"
  promo_price: string | null
  stock_quantity: number
  is_active: boolean
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const SELECT = '*, categories(name), product_images(id, product_id, storage_path, sort_order)'

function friendly(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'Já existe um produto com este código (SKU).'
  if (error.code === '23514') return 'Algum valor é inválido (preço, preço promocional ou quantidade).'
  if (error.code === '42501') return 'Sem permissão para esta ação. Entre novamente como administradora.'
  return 'Não foi possível salvar. Tente novamente.'
}

export async function listProducts(): Promise<AdminProduct[]> {
  const { data, error } = await supabase.from('products').select(SELECT).order('created_at', { ascending: false })
  if (error) throw new Error('Não foi possível carregar os produtos.')
  return ((data ?? []) as unknown as AdminProduct[]).map(p => ({
    ...p,
    product_images: [...p.product_images].sort((a, b) => a.sort_order - b.sort_order),
  }))
}

export async function createProduct(input: ProductInput): Promise<string> {
  const { data, error } = await supabase.from('products').insert(input).select('id').single()
  if (error || !data) throw new Error(friendly(error ?? { message: '' }))
  return data.id as string
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  const { stock_quantity: _stock, ...details } = input
  const { error } = await supabase.from('products').update(details).eq('id', id)
  if (error) throw new Error(friendly(error))
}

export async function setActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase.from('products').update({ is_active }).eq('id', id)
  if (error) throw new Error(friendly(error))
}

/** Arquivar não apaga nada: preserva histórico de vendas e estoque. */
export async function setArchived(id: string, archived: boolean): Promise<void> {
  const patch = archived ? { archived_at: new Date().toISOString(), is_active: false } : { archived_at: null }
  const { error } = await supabase.from('products').update(patch).eq('id', id)
  if (error) throw new Error(friendly(error))
}

export function validateImage(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return `"${file.name}": use imagem JPG, PNG ou WebP.`
  if (file.size > MAX_IMAGE_BYTES) return `"${file.name}": a imagem passa de 5 MB.`
  return null
}

export async function uploadImage(productId: string, file: File, sortOrder: number): Promise<void> {
  const problem = validateImage(file)
  if (problem) throw new Error(problem)
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${productId}/${crypto.randomUUID()}.${ext}`
  const up = await supabase.storage.from(PRODUCT_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (up.error) throw new Error(`Não foi possível enviar "${file.name}".`)
  const ins = await supabase.from('product_images').insert({ product_id: productId, storage_path: path, sort_order: sortOrder })
  if (ins.error) {
    await supabase.storage.from(PRODUCT_BUCKET).remove([path]) // não deixa arquivo órfão
    throw new Error(`Não foi possível registrar "${file.name}".`)
  }
}

export async function deleteImage(imageId: string, storagePath: string): Promise<void> {
  const del = await supabase.from('product_images').delete().eq('id', imageId)
  if (del.error) throw new Error('Não foi possível remover a imagem.')
  await supabase.storage.from(PRODUCT_BUCKET).remove([storagePath])
}

/** Coloca a imagem escolhida como principal (primeira). */
export async function makeCover(productId: string, imageId: string): Promise<void> {
  const { data, error } = await supabase.from('product_images').select('id, sort_order').eq('product_id', productId).order('sort_order')
  if (error || !data) throw new Error('Não foi possível reordenar as imagens.')
  const ordered = [imageId, ...data.map(i => i.id as string).filter(id => id !== imageId)]
  for (let i = 0; i < ordered.length; i++) {
    const r = await supabase.from('product_images').update({ sort_order: i }).eq('id', ordered[i])
    if (r.error) throw new Error('Não foi possível reordenar as imagens.')
  }
}

export async function countAvailable(): Promise<number> {
  const { count, error } = await supabase.from('products').select('id', { count: 'exact', head: true })
    .eq('is_active', true).is('archived_at', null).gt('stock_quantity', 0)
  if (error) throw new Error('Não foi possível contar os produtos.')
  return count ?? 0
}
