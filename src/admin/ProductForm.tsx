import { useRef, useState, type FormEvent } from 'react'
import ProductImage from '../components/ProductImage'
import {
  createProduct, deleteImage, makeCover, updateProduct, uploadImage, validateImage, type ProductInput,
} from '../lib/adminProducts'
import { centsToDecimalString, centsToInput, parseBRLInput, toCents } from '../lib/money'
import type { AdminProduct, Category } from '../lib/types'

interface Props {
  product: AdminProduct | null     // null = novo produto
  categories: Category[]
  onSaved: (message: string) => void
  onImagesChanged: () => void      // recarrega a lista quando imagens mudam (produto já existe)
  onCancel: () => void
}

export default function ProductForm({ product, categories, onSaved, onImagesChanged, onCancel }: Props) {
  const [name, setName] = useState(product?.name ?? '')
  const [sku, setSku] = useState(product?.sku ?? '')
  const [categoryId, setCategoryId] = useState(product?.category_id ?? categories[0]?.id ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [material, setMaterial] = useState(product?.material ?? 'Prata 925')
  const [price, setPrice] = useState(product ? centsToInput(toCents(product.price)) : '')
  const [promo, setPromo] = useState(product?.promo_price != null ? centsToInput(toCents(product.promo_price)) : '')
  const [stock, setStock] = useState(String(product?.stock_quantity ?? 0))
  const [active, setActive] = useState(product?.is_active ?? true)
  const [pending, setPending] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [imgMsg, setImgMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files)
    const bad = list.map(validateImage).find(Boolean)
    if (bad) { setImgMsg(bad); return }
    setImgMsg(null)
    if (!product) { setPending(p => [...p, ...list]); return }
    setBusy(true)
    try {
      const base = product.product_images.length
      for (let i = 0; i < list.length; i++) await uploadImage(product.id, list[i], base + i)
      onImagesChanged()
    } catch (e) { setImgMsg((e as Error).message) }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const priceC = parseBRLInput(price)
    if (!name.trim()) return setError('Informe o nome do produto.')
    if (!categoryId) return setError('Escolha a categoria.')
    if (priceC === null || priceC <= 0) return setError('Informe um preço válido, por exemplo 89,90.')
    let promoC: number | null = null
    if (promo.trim()) {
      promoC = parseBRLInput(promo)
      if (promoC === null) return setError('O preço promocional é inválido.')
      if (promoC >= priceC) return setError('O preço promocional precisa ser menor que o preço normal.')
    }
    if (!/^\d+$/.test(stock.trim())) return setError('A quantidade deve ser um número inteiro, 0 ou mais.')

    const input: ProductInput = {
      sku: sku.trim() || null,
      name: name.trim(),
      category_id: categoryId,
      description: description.trim(),
      material: material.trim() || 'Prata 925',
      price: centsToDecimalString(priceC),
      promo_price: promoC === null ? null : centsToDecimalString(promoC),
      stock_quantity: parseInt(stock, 10),
      is_active: active,
    }

    setBusy(true)
    try {
      if (product) {
        await updateProduct(product.id, input)
        onSaved('Produto atualizado.')
      } else {
        const id = await createProduct(input)
        const failed: string[] = []
        for (let i = 0; i < pending.length; i++) {
          try { await uploadImage(id, pending[i], i) } catch (err) { failed.push((err as Error).message) }
        }
        onSaved(failed.length
          ? `Produto cadastrado, mas algumas imagens falharam. Abra o produto para reenviar. ${failed.join(' ')}`
          : 'Produto cadastrado.')
      }
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const removeImage = async (id: string, path: string) => {
    if (!window.confirm('Remover esta imagem?')) return
    setBusy(true)
    try { await deleteImage(id, path); onImagesChanged() } catch (e) { setImgMsg((e as Error).message) }
    setBusy(false)
  }
  const cover = async (id: string) => {
    if (!product) return
    setBusy(true)
    try { await makeCover(product.id, id); onImagesChanged() } catch (e) { setImgMsg((e as Error).message) }
    setBusy(false)
  }

  return (
    <form className="pform" onSubmit={submit} noValidate>
      <h2>{product ? 'Editar produto' : 'Cadastrar produto'}</h2>
      <label className="field">Nome do produto *
        <input value={name} onChange={e => setName(e.target.value)} maxLength={120} />
      </label>
      <div className="row2">
        <label className="field">Categoria *
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field">Código interno (SKU)
          <input value={sku} onChange={e => setSku(e.target.value)} maxLength={40} placeholder="Opcional" />
        </label>
      </div>
      <div className="row3">
        <label className="field">Preço normal (R$) *
          <input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="89,90" />
        </label>
        <label className="field">Preço promocional (R$)
          <input inputMode="decimal" value={promo} onChange={e => setPromo(e.target.value)} placeholder="Opcional" />
        </label>
        <label className="field">Quantidade disponível *
          <input disabled={Boolean(product)} inputMode="numeric" value={stock} onChange={e => setStock(e.target.value)} />
        </label>
      </div>
      {product && <p className="fine">Para alterar quantidades, feche este formulário e use “Movimentações” na lista de produtos.</p>}
      <label className="field">Material
        <input value={material} onChange={e => setMaterial(e.target.value)} maxLength={120} />
      </label>
      <label className="field">Descrição
        <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} />
      </label>
      <label className="check">
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
        Produto ativo (aparece no catálogo quando houver estoque)
      </label>

      <fieldset className="images">
        <legend>Fotografias</legend>
        <div className="img-grid">
          {product?.product_images.map((im, i) => (
            <figure key={im.id}>
              <ProductImage path={im.storage_path} alt={`Foto ${i + 1} de ${product.name}`} />
              <figcaption>
                {i === 0 ? <b>Principal</b> : <button type="button" className="link" disabled={busy} onClick={() => cover(im.id)}>Tornar principal</button>}
                <button type="button" className="link danger" disabled={busy} onClick={() => removeImage(im.id, im.storage_path)}>Remover</button>
              </figcaption>
            </figure>
          ))}
          {pending.map((f, i) => (
            <figure key={`${f.name}-${i}`}>
              <img src={URL.createObjectURL(f)} alt={f.name} />
              <figcaption>
                <span className="fine">Será enviada ao salvar</span>
                <button type="button" className="link danger" onClick={() => setPending(p => p.filter((_, j) => j !== i))}>Tirar</button>
              </figcaption>
            </figure>
          ))}
          {!product?.product_images.length && !pending.length && <p className="fine">Nenhuma foto ainda.</p>}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy}
          onChange={e => addFiles(e.target.files)} />
        <p className="fine">JPG, PNG ou WebP, até 5 MB cada. Para trocar uma foto, remova e envie a nova.</p>
        {imgMsg && <p className="form-error" role="alert">{imgMsg}</p>}
      </fieldset>

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Salvando…' : product ? 'Salvar alterações' : 'Cadastrar produto'}</button>
      </div>
    </form>
  )
}
