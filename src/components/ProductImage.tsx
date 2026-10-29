import { useState } from 'react'
import { imageUrl } from '../lib/supabase'

interface Props { path?: string; alt: string; className?: string }

/** Foto do produto ou, se não houver/ falhar, o monograma JP da marca. */
export default function ProductImage({ path, alt, className }: Props) {
  const [failed, setFailed] = useState(false)
  if (!path || failed) {
    return <div className={`img-fallback ${className ?? ''}`} role="img" aria-label={alt}>JP</div>
  }
  return <img className={className} src={imageUrl(path)} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
}
