import { useCallback, useEffect, useState } from 'react'
import ReviewList from './ReviewList'
import { fetchCatalog } from '../lib/catalog'
import { toCatalogEntries } from '../lib/catalogFilter'
import { whatsappNumber } from '../lib/config'
import { useSelection } from '../lib/SelectionContext'
import { buildReviewLines, describeChange, linesTotalCents, type CatalogEntry } from '../lib/selection'
import { buildRequestMessage, buildWhatsAppUrl, sanitizeCustomerName } from '../lib/whatsapp'

interface Props { onBack: () => void; onClose: () => void }

/**
 * Etapa de revisão antes do WhatsApp. Os valores vêm do catálogo ATUAL (revalidado ao entrar e de novo
 * ao enviar). Nada é gravado no banco: não há venda, reserva nem baixa de estoque.
 */
export default function ConditionalReview({ onBack, onClose }: Props) {
  const { selection, notices, syncWithCatalog, dismissNotices } = useSelection()
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [status, setStatus] = useState<'checking' | 'ready' | 'error'>('checking')
  const [name, setName] = useState('')
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [opened, setOpened] = useState(false)

  const check = useCallback(async () => {
    setStatus('checking')
    try {
      const entries = toCatalogEntries(await fetchCatalog())
      setCatalog(entries)
      syncWithCatalog(entries)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [syncWithCatalog])

  useEffect(() => { void check() }, [check])

  const lines = buildReviewLines(selection, catalog)
  const total = linesTotalCents(lines)
  const blocked = notices.length > 0
  const canSend = status === 'ready' && lines.length > 0 && !blocked && !sending && whatsappNumber !== null

  async function send() {
    if (!whatsappNumber) return
    setSending(true)
    setProblem(null)
    setOpened(false)
    try {
      // Revalida de novo: preço/estoque podem ter mudado desde que a revisão abriu.
      const entries = toCatalogEntries(await fetchCatalog())
      setCatalog(entries)
      const changes = syncWithCatalog(entries)
      if (changes.length > 0) return // avisos aparecem na tela; a cliente confirma antes de tentar de novo
      const fresh = buildReviewLines(selection, entries)
      if (fresh.length === 0) return
      const message = buildRequestMessage(fresh.map(l => ({ name: l.name, quantity: l.quantity, unitCents: l.unitCents })), name)
      const url = buildWhatsAppUrl(whatsappNumber, message)
      const w = window.open(url, '_blank')
      if (w) w.opener = null
      else window.location.assign(url) // pop-up bloqueado (comum no celular): abre na mesma aba
      setOpened(true)
    } catch {
      setProblem('Não conseguimos conferir os valores agora, então nada foi aberto. Verifique sua conexão e tente de novo.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="dr-head">
        <h2>Revisar solicitação</h2>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Fechar</button>
      </div>
      <div className="dr-body">
        {status === 'checking' && <p className="state" role="status">Conferindo preços e disponibilidade…</p>}
        {status === 'error' && (
          <div className="state" role="alert">
            <p>Não conseguimos conferir os valores agora. Verifique sua conexão e tente de novo.</p>
            <button className="btn btn-ghost" onClick={() => void check()}>Tentar de novo</button>
          </div>
        )}

        {notices.length > 0 && (
          <div className="notice-box" role="alert">
            <p><b>Atualizamos a sua seleção.</b> Confira antes de continuar:</p>
            <ul>{notices.map((c, i) => <li key={i}>{describeChange(c)}</li>)}</ul>
            <button className="btn btn-primary btn-sm" onClick={dismissNotices}>Entendi, ver valores atualizados</button>
          </div>
        )}

        {status === 'ready' && lines.length === 0 && (
          <div className="empty-dr">
            <p>Sua seleção está vazia.</p>
            <button className="btn btn-primary" onClick={onBack}>Voltar às joias</button>
          </div>
        )}

        {status === 'ready' && lines.length > 0 && (
          <>
            <ReviewList lines={lines} totalCents={total} />
            <label className="field">Seu nome (opcional)
              <input type="text" value={name} maxLength={80} autoComplete="name"
                onChange={e => setName(e.target.value)} placeholder="Como podemos te chamar?" />
            </label>
            {name.trim() !== sanitizeCustomerName(name) && <p className="fine">Espaços extras serão ajustados na mensagem.</p>}
          </>
        )}
      </div>

      {status === 'ready' && lines.length > 0 && (
        <div className="dr-foot">
          <p className="fine">
            Valores estimados. Pedir um condicional não é uma compra e não reserva as peças: a JAQUE PRATAS confirma
            a disponibilidade com você pelo WhatsApp.
          </p>
          {whatsappNumber === null && (
            <p className="fine notice" role="alert">
              O envio pelo WhatsApp ainda não está disponível: a loja ainda não configurou o número de atendimento.
              Tente novamente mais tarde.
            </p>
          )}
          {problem && <p className="fine notice" role="alert">{problem}</p>}
          {blocked && <p className="fine notice">Confirme os avisos acima para continuar. Nada foi enviado.</p>}
          {opened && (
            <p className="fine ok-note" role="status">
              Abrimos o WhatsApp com a sua mensagem. Ela só chega à JAQUE PRATAS quando você tocar em enviar por lá.
              Nenhuma peça foi reservada.
            </p>
          )}
          <button className="btn btn-primary" disabled={!canSend} onClick={() => void send()}>
            {sending ? 'Conferindo…' : 'Abrir WhatsApp com a solicitação'}
          </button>
          <button className="link" style={{ alignSelf: 'center' }} onClick={onBack}>Voltar à seleção</button>
        </div>
      )}
    </>
  )
}
