import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function validProjectUrl(value: string | undefined): boolean {
  if (!value || value.includes('seu-projeto')) return false
  try {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname)
  } catch { return false }
}

export const isConfigured = validProjectUrl(url) && Boolean(anonKey && anonKey !== 'CHAVE_PUBLICA_ANON_DO_PROJETO')

// Só a URL e a chave PÚBLICA (anon) existem no front. A segurança vem do RLS no banco.
export const supabase = createClient(
  isConfigured ? url! : 'http://localhost:54321',
  isConfigured ? anonKey! : 'sem-configuracao',
)

export const PRODUCT_BUCKET = 'product-images'

export function imageUrl(path: string): string {
  return supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path).data.publicUrl
}
