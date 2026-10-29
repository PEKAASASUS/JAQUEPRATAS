import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey && !url.includes('seu-projeto'))

// Só a URL e a chave PÚBLICA (anon) existem no front. A segurança vem do RLS no banco.
export const supabase = createClient(
  isConfigured ? url! : 'http://localhost:54321',
  isConfigured ? anonKey! : 'sem-configuracao',
)

export const PRODUCT_BUCKET = 'product-images'

export function imageUrl(path: string): string {
  return supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path).data.publicUrl
}
