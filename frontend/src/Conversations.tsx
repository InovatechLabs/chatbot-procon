import { useEffect, useRef, useState, type FormEvent } from 'react';
import axios from 'axios';
import { useAuth } from './auth/context';
import { useConversationEvents } from './services/conversationEvents';
import { conversationsApi, type ConversationView, type History, type Message, type QueuePage, type Ticket } from './services/conversations';
import { ui } from './ui/styles';

const tabs = [{ id: 'waiting', label: 'Aguardando' }, { id: 'active', label: 'Em atendimento' }, { id: 'bot', label: 'Com o bot' }, { id: 'history', label: 'Histórico' }] as const;
const labels = { WAITING: 'Aguardando', ACTIVE: 'Em atendimento', CLOSED: 'Encerrado', BOT: 'Devolvido ao bot', BOT_LIVE: 'Com o bot' };
const dateLabel = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
const protocol = (id: string) => id.slice(0, 8).toUpperCase();
const status = (error: unknown) => axios.isAxiosError(error) ? error.response?.status : undefined;
const errorMessage = (error: unknown) => axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
  ? error.response.data.error : 'Não foi possível concluir. Confira a conexão e tente novamente.';
const card = 'rounded-md border border-slate-200 bg-white';

function ConversationAudio({ ticketId, messageId }: { ticketId: string; messageId: string }) {
  const [source, setSource] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = useRef<{ controller?: AbortController; url?: string }>({});
  useEffect(() => {
    const resource = current.current;
    return () => {
      resource.controller?.abort();
      if (resource.url) URL.revokeObjectURL(resource.url);
    };
  }, []);
  const load = async () => {
    const controller = new AbortController();
    current.current.controller = controller;
    setBusy(true); setError('');
    try {
      const data = await conversationsApi.audio(ticketId, messageId, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(data);
      if (current.current.url) URL.revokeObjectURL(current.current.url);
      current.current.url = url;
      setSource(url);
    } catch (failure) {
      if (!controller.signal.aborted) setError(status(failure) === 404 ? 'O áudio não está mais disponível.' : 'Não foi possível carregar o áudio. Tente novamente.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <div className="mt-2 grid gap-2">
    {source && !error ? <audio controls autoPlay src={source} className="max-w-full" aria-label="Áudio do consumidor" onError={() => setError('O navegador não conseguiu reproduzir este áudio.')} />
      : <button type="button" className={ui.btnGhost} disabled={busy} onClick={() => void load()}>{busy ? 'Carregando áudio…' : 'Ouvir áudio'}</button>}
    {error && <p role="status" className="text-xs text-slate-600">{error}</p>}
  </div>;
}

function deliveryLabel(message: Message) {
  const delivery = message.delivery;
  if (!delivery) return '';
  if (delivery.lastError === 'WindowExpired') return 'Janela expirada antes do envio';
  if (delivery.deliveryStatus === 'failed' || delivery.state === 'DEAD') return 'Falha na entrega';
  if (delivery.deliveryStatus === 'read') return 'Lida';
  if (delivery.deliveryStatus === 'delivered') return 'Entregue';
  if (delivery.state === 'SENT') return 'Aceita pela Meta';
  if (delivery.state === 'UNKNOWN') return 'Envio incerto';
  if (delivery.state === 'SKIPPED') return 'Descartada';
  return delivery.state === 'SENDING' ? 'Enviando' : 'Na fila';
}

function ConversationDetail({ selected }: { selected: Ticket }) {
  const { user } = useAuth();
  const { revision, refresh } = useConversationEvents();
  const [history, setHistory] = useState<History | null>(null);
  const [older, setOlder] = useState<Message[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [now, setNow] = useState(Date.now);
  const attempt = useRef<{ text: string; requestId: string } | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const stickToEnd = useRef(true);
  const bot = selected.status === 'BOT_LIVE';

  useEffect(() => {
    const controller = new AbortController();
    let retry: number | undefined;
    const load = (remaining: number) => {
      void conversationsApi.history(selected.id, bot, undefined, controller.signal).then(setHistory).catch(failure => {
        if (controller.signal.aborted) return;
        if (status(failure) === 409 && remaining > 0) { retry = window.setTimeout(() => load(remaining - 1), 600); return; }
        if (status(failure) === 403 || status(failure) === 404) { setHistory(null); setOlder([]); setOlderCursor(undefined); }
        setError(errorMessage(failure));
      });
    };
    load(2);
    return () => { controller.abort(); window.clearTimeout(retry); };
  }, [selected.id, bot, revision]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const container = transcript.current;
    if (container && stickToEnd.current) container.scrollTop = container.scrollHeight;
  }, [history]);

  const ticket = history?.ticket ?? selected;
  const mine = ticket.status === 'ACTIVE' && ticket.assigneeId === user?.id;
  const mayFinish = mine || (user?.role === 'ADMIN' && ['WAITING', 'ACTIVE'].includes(ticket.status));
  const openWindow = history?.windowUntil && new Date(history.windowUntil).getTime() > now;
  const length = draft.trim().length;
  const limit = history?.replyLimit ?? 4096;
  const cursor = olderCursor === undefined ? history?.nextCursor : olderCursor;
  const items = [...new Map([...older, ...(history?.items ?? [])].map(item => [item.id, item])).values()]
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

  const change = async (action: 'claim' | 'close' | 'return') => {
    if (!history || busy) return;
    if (action === 'close' && !window.confirm('Encerrar este atendimento?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await conversationsApi.change(selected.id, action, history.ticket.version);
      setHistory(current => current ? { ...current, ticket: updated } : current);
      const outcome = action === 'claim' ? 'Você assumiu a conversa.' : action === 'return' ? 'Conversa devolvida ao bot.' : 'Atendimento encerrado.';
      setNotice(action === 'close' ? outcome : `${outcome} ${updated.noticeQueued ? 'Aviso na fila de envio.' : 'Aviso indisponível. A janela do WhatsApp precisa estar aberta.'}`);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); refresh(); }
  };
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!history || !mine || !openWindow || !length || length > limit || busy) return;
    const text = draft.trim();
    if (!attempt.current || attempt.current.text !== text) attempt.current = { text, requestId: crypto.randomUUID() };
    setBusy(true); setError(''); setNotice('');
    try {
      await conversationsApi.send(selected.id, { version: history.ticket.version, ...attempt.current });
      attempt.current = null;
      setDraft(''); setNotice('Mensagem adicionada à fila de envio.');
      stickToEnd.current = true;
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); refresh(); }
  };
  const loadOlder = async () => {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await conversationsApi.history(selected.id, bot, cursor);
      stickToEnd.current = false;
      setOlder(current => [...current, ...page.items]);
      setOlderCursor(page.nextCursor);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setLoadingOlder(false); }
  };

  return <section className={`${card} flex min-w-0 flex-col`} aria-label="Conversa selecionada">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div><h2 className="font-semibold text-brand-dark">Conversa {protocol(selected.id)}</h2><p className="text-sm text-slate-600">{labels[ticket.status]}</p></div>
      <div className="flex flex-wrap gap-2">
        {ticket.status === 'WAITING' && <button className={ui.btnPrimary} disabled={!history || busy} onClick={() => void change('claim')}>Assumir</button>}
        {mayFinish && <><button className={ui.btnGhost} disabled={!history || busy} onClick={() => void change('return')}>Devolver ao bot</button><button className={ui.btnGhost} disabled={!history || busy} onClick={() => void change('close')}>Encerrar</button></>}
      </div>
    </header>
    {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="px-5 pt-3 text-sm text-emerald-800">{notice}</p>}
    <div ref={transcript} onScroll={event => { const el = event.currentTarget; stickToEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }} className="h-[min(50vh,32rem)] min-h-56 overflow-y-auto bg-slate-50 p-5" aria-label="Histórico de mensagens">
      {cursor && <button className={`${ui.btnGhost} mb-4`} disabled={loadingOlder} onClick={() => void loadOlder()}>Carregar mensagens anteriores</button>}
      {!history && !error && <p role="status" className="text-sm text-slate-500">Carregando conversa…</p>}
      {history && !items.length && <p className="text-sm text-slate-500">Ainda não há mensagens no histórico.</p>}
      <ol className="grid gap-3">{items.map(item => <li key={item.id} className={`w-fit max-w-[min(90%,44rem)] rounded-md border border-slate-200 px-4 py-2.5 ${item.author === 'CITIZEN' ? 'bg-white' : 'ml-auto bg-brand-light'}`}>
        <div className="flex flex-wrap gap-x-3 text-xs text-slate-600"><strong>{item.author === 'CITIZEN' ? 'Consumidor' : item.author === 'BOT' ? 'Assistente virtual' : item.authorName ?? 'Atendente'}</strong><time dateTime={item.at}>{dateLabel(item.at)}</time></div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{item.text}</p>
        {!bot && item.hasAudio && <ConversationAudio ticketId={selected.id} messageId={item.id} />}
        {deliveryLabel(item) && <p className="mt-1 text-right text-xs text-slate-500">{deliveryLabel(item)}</p>}
      </li>)}</ol>
    </div>
    {mine && history && <form onSubmit={event => void send(event)} className="grid gap-2 border-t border-slate-200 p-4">
      <label className="text-sm font-semibold text-brand-dark" htmlFor="conversation-reply">Responder pelo WhatsApp</label>
      {!openWindow && <p className="text-sm text-amber-900">Janela de atendimento fechada. Aguarde uma nova mensagem do consumidor.</p>}
      <textarea id="conversation-reply" rows={3} maxLength={limit} disabled={!openWindow || busy} value={draft} onChange={event => setDraft(event.target.value)} className="resize-y rounded-md border border-slate-300 bg-white p-3 text-sm disabled:bg-slate-100" />
      <div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-600">{length}/{limit}</span><button className={ui.btnPrimary} disabled={!openWindow || busy || !length || length > limit}>Enviar</button></div>
    </form>}
  </section>;
}

export default function Conversations() {
  const { connected, waiting, revision, focus, refresh } = useConversationEvents();
  const [view, setView] = useState<ConversationView>('waiting');
  const [page, setPage] = useState<QueuePage | null>(null);
  const [cursors, setCursors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [error, setError] = useState('');
  const cursor = cursors.at(-1);
  useEffect(() => {
    const controller = new AbortController();
    void conversationsApi.list(view, cursor, controller.signal).then(data => { setPage(data); setError(''); }).catch(failure => {
      if (controller.signal.aborted) return;
      if (status(failure) === 400 && cursor) setCursors([]);
      else setError(errorMessage(failure));
    });
    return () => controller.abort();
  }, [view, cursor, revision]);
  useEffect(() => { focus(selected?.id ?? null, selected?.status === 'BOT_LIVE', view === 'bot'); return () => focus(null); }, [focus, selected?.id, selected?.status, view]);
  useEffect(() => {
    if (connected || !page) return;
    const timer = window.setTimeout(refresh, 10_000);
    return () => window.clearTimeout(timer);
  }, [connected, page, refresh]);

  return <main className="mx-auto grid max-w-7xl items-start gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
    <aside className={`${card} min-w-0`} aria-label="Fila de atendimento">
      <div className="flex items-center justify-between gap-2 p-4"><h2 className="font-semibold text-brand-dark">Fila de atendimento</h2><span className="text-xs text-slate-600">{connected ? 'Ao vivo' : 'Reconectando'}</span></div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200 px-3 pb-3">{tabs.map(tab => <button key={tab.id} type="button" aria-pressed={view === tab.id}
        className={`rounded px-2 py-2 text-xs font-semibold ${view === tab.id ? 'bg-brand-dark text-white' : 'text-brand-dark hover:bg-slate-100'}`}
        onClick={() => { if (view !== tab.id) { setPage(null); setView(tab.id); setCursors([]); } }}>{tab.label}{tab.id === 'waiting' && waiting > 0 ? ` (${waiting})` : ''}</button>)}</div>
      {error && <p role="alert" className="p-4 text-sm text-red-800">{error}</p>}
      {!page && !error && <p role="status" className="p-4 text-sm text-slate-600">Carregando atendimentos…</p>}
      {page && !page.items.length && !error && <p className="p-4 text-sm text-slate-600">Nenhuma conversa nesta lista.</p>}
      <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto">{page?.items.map(item => <li key={item.id}>
        <button type="button" onClick={() => setSelected(item)} aria-pressed={selected?.id === item.id} className="w-full border-l-4 border-transparent px-4 py-3 text-left hover:bg-slate-50 aria-pressed:border-brand aria-pressed:bg-brand-light">
          <strong className="block text-sm text-brand-dark">Conversa {protocol(item.id)}</strong><span className="text-xs text-slate-600">{labels[item.status]} · {dateLabel(item.requestedAt)}</span>
        </button>
      </li>)}</ul>
      {(cursors.length > 0 || page?.nextCursor) && <div className="flex justify-between gap-2 border-t border-slate-200 p-3">
        <button className={ui.btnGhost} disabled={!cursors.length} onClick={() => { setPage(null); setCursors(current => current.slice(0, -1)); }}>Anterior</button>
        <button className={ui.btnGhost} disabled={!page?.nextCursor} onClick={() => { if (page?.nextCursor) { const next = page.nextCursor; setPage(null); setCursors(current => [...current, next]); } }}>Próxima</button>
      </div>}
    </aside>
    {selected ? <ConversationDetail key={selected.id} selected={selected} /> : <section className={`${card} grid min-h-72 place-content-center p-6 text-center`}>
      <h2 className="text-lg font-semibold text-brand-dark">Selecione uma conversa</h2><p className="mt-1 text-sm text-slate-600">Escolha um atendimento na fila para ler o histórico ou responder.</p>
    </section>}
  </main>;
}
