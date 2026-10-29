import { supabase } from '../lib/supabase'
export interface Customer { id: string; name: string; phone: string; notes: string; archived_at: string | null }
export interface StockProduct { id: string; name: string; description: string; category: string; category_id: string; stock_quantity: number; in_conditional: number; price: number; promo_price: number | null; is_active: boolean; archived_at: string | null }
export interface Conditional { id: string; customer_id: string; customer_name: string; pending: number; delivered_at: string; due_at: string | null; notes: string }
export interface ConditionalItem { id: string; conditional_id: string; product_id: string; product_name: string; quantity_out: number; pending: number }
export interface ConditionalEvent { id: string; conditional_item_id: string; kind: string; quantity: number; reason: string; reverses_event_id: string | null; created_at: string }
export interface Sale { remaining_units: number; id: string; customer_id: string; customer_name: string; conditional_id: string | null; pricing_method: string; collection_terms: string; sold_at: string; due_at: string | null; net_total: number; balance: number }
export interface SaleItem { category_id: string | null; category_name: string; id: string; sale_id: string; product_id: string; product_name: string; quantity: number; reversed: number; unit_price: number; subtotal: number; pricing_method: string }
export interface Payment { id: string; sale_id: string; amount: number; reversed: number; method: string; received_at: string }
export interface Reversal { id: string; amount?: number; quantity?: number; payment_id?: string; sale_item_id?: string; reason: string; created_at: string }
export interface Movement { id: string; product_id: string; movement_type: string; quantity_delta: number; quantity_after: number; origin: string; reference_id: string | null; created_at: string }
export interface Audit { id: string; customer_id: string; action: string; created_at: string }
export interface Snapshot { customers: Customer[]; products: StockProduct[]; conditionals: Conditional[]; conditional_items: ConditionalItem[]; events: ConditionalEvent[]; sales: Sale[]; sale_items: SaleItem[]; payments: Payment[]; payment_reversals: Reversal[]; sale_reversals: Reversal[]; movements: Movement[]; customer_audit: Audit[] }
function message(error: { code?: string; message: string }): string {
 if (error.code === 'PGRST202' || error.code === '42883') return 'A gestão ainda não está instalada neste banco. Aplique as migrações em ambiente autorizado.'
 if (error.code === '42501') return 'Acesso administrativo necessário. Entre novamente.'
 if (error.code === 'P0002') return 'Registro não encontrado ou indisponível. Atualize os dados.'
 if (error.code === '23514' || error.code === '23502' || error.code === '22P02' || error.code === '22007') return 'Confira os campos, quantidades e valores informados.'
 if (error.code === 'P0001' || error.code === '22023') return error.message
 return 'Não foi possível confirmar a operação. Atualize ou tente novamente com os mesmos dados; a chave da tentativa será preservada.'
}
export async function loadManagement(): Promise<Snapshot> {
 const { data, error } = await supabase.rpc('admin_snapshot')
 if (error) throw new Error(message(error))
 return data as Snapshot
}
export async function executeManagement(key: string, action: string, payload: Record<string, unknown>): Promise<{ id: string }> {
 const { data, error } = await supabase.rpc('admin_execute', { p_request: key, p_action: action, p_data: payload })
 if (error) throw new Error(message(error))
 return data as { id: string }
}

export type RecordKind = 'customer' | 'product'
export interface DeletionInfo { id: string; kind: RecordKind; name: string; archived: boolean; allowed: boolean; reasons: string[] }
export async function inspectDeletion(kind: RecordKind, id: string): Promise<DeletionInfo> {
 const { data, error } = await supabase.rpc('admin_deletion_info', { p_kind: kind, p_id: id })
 if (error) throw new Error(message(error))
 return data as DeletionInfo
}
