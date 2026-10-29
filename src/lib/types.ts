export interface Category {
  id: string
  slug: string
  name: string
  sort_order: number
}

/** Linha da view pública `catalog_products` (somente dados seguros para visitantes). */
export interface CatalogProduct {
  id: string
  name: string
  category_slug: string
  category_name: string
  description: string
  material: string
  price: number
  promo_price: number | null
  current_price: number
  available_quantity: number
  is_available: boolean
  created_at: string
  image_paths: string[]
}

export interface ProductImage {
  id: string
  product_id: string
  storage_path: string
  sort_order: number
}

/** Linha da tabela `products` (somente painel administrativo). */
export interface AdminProduct {
  id: string
  sku: string | null
  name: string
  category_id: string
  description: string
  material: string
  price: number
  promo_price: number | null
  stock_quantity: number
  is_active: boolean
  archived_at: string | null
  created_at: string
  categories: { name: string } | null
  product_images: ProductImage[]
}
