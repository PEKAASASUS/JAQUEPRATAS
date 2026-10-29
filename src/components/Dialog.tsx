import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  label: string
  className?: string
  children: ReactNode
}

/** Janela modal acessível baseada no <dialog> nativo (foco preso, Esc fecha). */
export default function Dialog({ open, onClose, label, className, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={label}
      onClose={onClose}
      onCancel={e => { e.preventDefault(); onClose() }}
      onClick={e => { if (e.target === ref.current) onClose() }}
    >
      {open ? children : null}
    </dialog>
  )
}
