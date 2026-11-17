import { cx, ui } from './ui/styles';
import { useEffect, useState } from 'react';
import { adminService } from './services/api';
import type { AnalyticsData } from './services/analytics';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

const percent = (value: number | null) => value === null ? '—' : `${value.toLocaleString('pt-BR')}%`;
const dayLabel = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const stageLabels: Record<string, string> = { READY: 'Aguardando nova interação', MENU: 'Menu', FREE_CHAT: 'Conversa livre', POST_ANSWER: 'Após orientação', SCHEDULE_OFFER: 'Oferta de agendamento', SCHEDULE_CATEGORY: 'Assunto do agendamento', SCHEDULE_NAME: 'Nome', SCHEDULE_NAME_CONFIRM: 'Confirmação de nome', SCHEDULE_CPF: 'CPF', SCHEDULE_DATE: 'Escolha de data', SCHEDULE_SLOT: 'Escolha de horário', DOCUMENT_CATEGORY: 'Documentos', RATING: 'Avaliação', FEEDBACK_COMMENT: 'Comentário' };
const answerLabels: Record<string, string> = { MENU: 'Resposta do menu', orientacao_final: 'Orientação com IA', clarificacao: 'Pergunta de esclarecimento', redirecionamento: 'Encaminhamento', fixa: 'Resposta fixa' };
function CountTable({ title, rows, firstColumn }: { title: string; rows: { label: string; count: number }[]; firstColumn: string }) {
  return <section data-ui="table-card" className={cx(ui.tableCard)}><div data-ui="table-header" className={cx(ui.tableHeader)}><h3>{title}</h3></div>{rows.length ? <div data-ui="table-wrap" className={cx(ui.tableWrap)}><table data-ui="data-table" className={cx(ui.dataTable)}><thead><tr><th>{firstColumn}</th><th data-ui="text-right" className={cx(ui.textRight)}>Quantidade</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.label}-${index}`}><td>{row.label}</td><td data-ui="text-right" className={cx(ui.textRight)}>{row.count}</td></tr>)}</tbody></table></div> : <p>Nenhum evento registrado neste período.</p>}</section>;
}

export default function Analytics() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    adminService.getAnalytics(days).then(response => {
      if (active) { setData(response.data as AnalyticsData); setError(''); }
    }).catch(() => { if (active) { setData(null); setError('Não foi possível carregar as métricas. Tente novamente.'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, refresh]);
  const m = data?.metrics;
  return <main data-ui="tab-content analytics-view" className={cx(ui.tabContent, ui.analyticsView)}>
    <div data-ui="filters-bar" className={cx(ui.filtersBar)}><div data-ui="filter-group" className={cx(ui.filterGroup)}><label htmlFor="analytics-period">Período, incluindo hoje</label><select id="analytics-period" value={days} onChange={event => { setLoading(true); setDays(Number(event.target.value) as 7 | 30 | 90); }}><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option></select></div><button data-ui="btn-ghost" className={cx(ui.btnGhost)} disabled={loading} onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>Atualizar</button></div>
    {loading ? <p role="status">Consultando métricas...</p> : error ? <p role="alert" data-ui="login-error" className={cx(ui.loginError)}>{error}</p> : data && m && <>
      <p>Horário de Brasília. {data.trackingSince ? `Eventos registrados desde ${new Date(data.trackingSince).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.` : 'Ainda não há eventos registrados.'} O histórico anterior à coleta não foi reconstruído.</p>
      <div data-ui="kpi-grid-8" className={cx(ui.kpiGrid8)}>{[
        { label: 'Sessões com eventos', value: m.sessions, help: 'Sessões distintas com eventos do WhatsApp no período.' },
        { label: 'Novas sessões', value: m.started, help: 'Sessões iniciadas no período.' },
        { label: 'Turnos recebidos', value: m.turns, help: 'Textos agrupados contam como um turno.' },
        { label: 'Respostas preparadas', value: m.answers, help: 'Inclui orientações, respostas fixas, perguntas e encaminhamentos. Não comprova entrega ou resolução.' },
        { label: 'Pedidos de atendente', value: m.humanRequests, help: 'Sessões com pedido explícito de pessoa. Não significa transferência realizada.' },
        { label: 'Agendamentos criados', value: m.appointments, help: 'Reservas criadas pelo WhatsApp ou painel no período, mesmo se canceladas depois.' },
        { label: 'Orientação ajudou', value: percent(m.resolutionRate), help: `${m.positive} confirmações / ${m.positive + m.negative} respostas aos botões Ajudou/Não ajudou. Não significa solução do caso de consumo.` },
        { label: 'Satisfação: Ajudou', value: percent(m.csat), help: `${m.satisfied} avaliações Ajudou / ${m.ratings} avaliações. Mais ou menos não é contado como satisfeito.` },
      ].map(card => <div data-ui="kpi-card" className={cx(ui.kpiCard)} key={card.label} title={card.help}><div data-ui="kpi-info" className={cx(ui.kpiInfo)}><div data-ui="kpi-label" className={cx(ui.kpiLabel)}>{card.label}</div><div data-ui="kpi-value" className={cx(ui.kpiValue)}>{card.value}</div></div></div>)}</div>
      <p>Agendamento pelo bot após oferta no período: <strong>{percent(m.schedulingRate)}</strong> ({m.scheduled} de {m.offers} sessões com oferta). Média de avaliação: <strong>{m.averageRating === null ? '—' : m.averageRating.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/5</strong> ({m.ratings} respostas). Perguntas de esclarecimento: {m.clarifications}. Sessões expiradas enquanto aguardavam interação: {m.expired}.</p>
      <div data-ui="middle-row-2" className={cx(ui.middleRow2)}><section data-ui="chart-card" className={cx(ui.chartCard)}><div data-ui="chart-header" className={cx(ui.chartHeader)}><h3>Sessões e respostas por dia</h3></div><div className={cx("h-[260px]", "w-full")}><ResponsiveContainer><LineChart data={data.daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={dayLabel} /><YAxis allowDecimals={false} /><Tooltip labelFormatter={value => dayLabel(String(value))} /><Legend /><Line dataKey="sessions" name="Sessões com eventos" stroke="#0067ad" dot={false} /><Line dataKey="answers" name="Respostas preparadas" stroke="#60788e" dot={false} /></LineChart></ResponsiveContainer></div></section>
      <section data-ui="chart-card" className={cx(ui.chartCard)}><div data-ui="chart-header" className={cx(ui.chartHeader)}><h3>Agendamentos e expirações por dia</h3></div><div className={cx("h-[260px]", "w-full")}><ResponsiveContainer><BarChart data={data.daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={dayLabel} /><YAxis allowDecimals={false} /><Tooltip labelFormatter={value => dayLabel(String(value))} /><Legend /><Bar dataKey="appointments" name="Agendamentos criados" fill="#0067ad" /><Bar dataKey="expired" name="Expiradas aguardando interação" fill="#96600c" /></BarChart></ResponsiveContainer></div></section></div>
      <div data-ui="middle-row-2" className={cx(ui.middleRow2)}><CountTable title="Menus mais acessados" firstColumn="Menu" rows={data.topMenus} /><CountTable title="Perguntas mais selecionadas" firstColumn="Pergunta" rows={data.topQuestions} /></div>
      <div data-ui="middle-row-2" className={cx(ui.middleRow2)}><CountTable title="Expiração por etapa" firstColumn="Etapa" rows={data.expiredByStage.map(row => ({ label: stageLabels[row.stage ?? ''] ?? 'Etapa não identificada', count: row.count }))} /><CountTable title="Tipos de resposta preparados" firstColumn="Tipo" rows={data.answerTypes.map(row => ({ label: answerLabels[row.kind ?? ''] ?? 'Tipo não identificado', count: row.count }))} /></div>
      <p>Expiração indica falta de interação por 30 minutos, ou 24 horas durante a coleta de agendamento. Não comprova desistência ou insatisfação. “—” indica ausência de respostas para calcular a taxa.</p>
    </>}
  </main>;
}
