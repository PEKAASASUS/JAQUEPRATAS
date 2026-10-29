import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Dialog from '../components/Dialog'
import { executeManagement, inspectDeletion, type DeletionInfo, type RecordKind } from './services'

export interface RecordActionTarget { kind: RecordKind; id: string; name: string; archived: boolean; intent: 'delete' | 'archive' }
interface Props { target: RecordActionTarget | null; onClose: () => void; onDone: (message: string) => void | Promise<void> }
export default function RecordActionDialog({ target, onClose, onDone }: Props) {
 const [busy, setBusy] = useState(false)
 return <Dialog open={target !== null} onClose={() => { if (!busy) onClose() }} label={target?.intent === 'delete' ? `Excluir ${target.kind === 'customer' ? 'cliente' : 'peça'}` : `${target?.archived ? 'Reativar' : 'Arquivar'} cadastro`} className="modal">
  {target && <RecordActionForm key={`${target.kind}:${target.id}:${target.intent}`} target={target} onClose={onClose} onDone={onDone} onBusyChange={setBusy} />}
 </Dialog>
}
function RecordActionForm({ target, onClose, onDone, onBusyChange }: { target: RecordActionTarget; onClose: () => void; onDone: Props['onDone']; onBusyChange: (busy: boolean) => void }) {
 const [info, setInfo] = useState<DeletionInfo | null>(null)
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')
 const [busy, setBusy] = useState(false)
 const [confirmed, setConfirmed] = useState(false)
 const running = useRef(false)
 const attempt = useRef<{ signature: string; key: string } | null>(null)
 const mounted = useRef(true)
 const noun = target.kind === 'customer' ? 'cliente' : 'peça'
 const inspect = useCallback(async () => {
  setLoading(true)
  try { const result = await inspectDeletion(target.kind, target.id); if (mounted.current) { setInfo(result); setConfirmed(false) } }
  catch (e) { if (mounted.current) setError((e as Error).message) }
  finally { if (mounted.current) setLoading(false) }
 }, [target.id, target.kind])
 useEffect(() => { mounted.current = true; void inspect(); return () => { mounted.current = false } }, [inspect])
 async function submit(e: FormEvent, archiveInstead = false) {
  e.preventDefault()
  if (running.current || !info || loading) return
  const deleting = target.intent === 'delete' && !archiveInstead
  if (deleting && (!info.allowed || !confirmed)) return
  const action = `${target.kind}_${deleting ? 'delete' : 'archive'}`
  const payload = deleting ? { id: target.id, confirm_name: info.name } : { id: target.id, archived: archiveInstead ? true : !info.archived }
  const signature = JSON.stringify([action, payload])
  if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() }
  running.current = true; setBusy(true); onBusyChange(true); setError('')
  try {
   await executeManagement(attempt.current.key, action, payload)
   attempt.current = null
   const message = deleting ? `${noun === 'cliente' ? 'Cliente excluído' : 'Peça excluída'} definitivamente. Auditoria e históricos preservados.`
    : `${noun === 'cliente' ? 'Cliente' : 'Peça'} ${archiveInstead || !info.archived ? (noun === 'cliente' ? 'arquivado' : 'arquivada') : (noun === 'cliente' ? 'reativado' : 'reativada')}.${target.kind === 'product' && info.archived && !archiveInstead ? ' O cadastro permanece inativo; use Ativar para publicá-lo.' : ' Histórico preservado.'}`
   await onDone(message)
  } catch (e) {
   if (mounted.current) { setError((e as Error).message); await inspect() }
  } finally { running.current = false; onBusyChange(false); if (mounted.current) setBusy(false) }
 }
 return <form className="pform" onSubmit={e => void submit(e)}>
  <h2>{target.intent === 'delete' ? `Excluir ${noun}` : `${info?.archived ? 'Reativar' : 'Arquivar'} ${noun}`}: “{info?.name ?? target.name}”</h2>
  {loading && <p role="status">Conferindo vínculos no banco…</p>}
  {error && <p className="form-error" role="alert">{error}</p>}
  {target.intent === 'delete' && info && <>
   {info.allowed ? <><p>O banco não encontrou vínculos que impeçam excluir “{info.name}”. A exclusão definitiva do cadastro não poderá ser desfeita.</p>
    <label className="check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} required /> Entendo que o cadastro de “{info.name}” será excluído definitivamente.</label></>
    : <div className="notice-box"><p><b>Exclusão definitiva bloqueada.</b> O cadastro possui referências que precisam ser preservadas:</p><ul>{info.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul><p>{info.archived ? 'O cadastro já está arquivado e seu histórico continua acessível.' : 'Você pode arquivar o cadastro para impedir novas operações, mantendo os registros existentes.'}</p></div>}
   {target.kind === 'product' && <p className="fine">Esta ação não remove imagens do Supabase Storage. Fotos ainda vinculadas bloqueiam a exclusão; arquivos compartilhados ou referenciados serão preservados.</p>}
  </>}
  {target.intent === 'archive' && info && <p>{info.archived ? `Reativar o cadastro de “${info.name}”?` : `Arquivar “${info.name}”? O cadastro sairá das opções de novas operações, mantendo seu histórico.`}{target.kind === 'product' && info.archived && ' A peça continuará inativa até você escolher Ativar.'}</p>}
  {info && (target.intent === 'archive' || info.allowed) && <button className="btn btn-primary" disabled={busy || loading || (target.intent === 'delete' && !confirmed)}>{busy ? 'Confirmando…' : target.intent === 'delete' ? 'Excluir definitivamente' : info.archived ? 'Reativar cadastro' : 'Arquivar cadastro'}</button>}
  {target.intent === 'delete' && info && !info.allowed && !info.archived && <button type="button" className="btn btn-primary" disabled={busy || loading} onClick={e => void submit(e, true)}>{busy ? 'Arquivando…' : `Arquivar ${noun}`}</button>}
  {!info && !loading && <button type="button" className="btn btn-ghost" onClick={() => { setError(''); void inspect() }}>Tentar verificar novamente</button>}
  <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>Cancelar</button>
 </form>
}
