import React, { useEffect, useState } from 'react';
import { adminService } from './services/api';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import './App.css';

// --- MOCK DATA PARA OS NOVOS GRÁFICOS (Agora em Português) ---
// Quando o backend estiver pronto, basta substituir essas variáveis pelos dados da API
const mockTimeData = [
  { date: '05 Out', retidas: 25, transbordadas: 2, engajadas: 15, semEngajamento: 20, resolvidas: 10, abandonadas: 5 },
  { date: '12 Out', retidas: 15, transbordadas: 1, engajadas: 10, semEngajamento: 15, resolvidas: 8, abandonadas: 3 },
  { date: '19 Out', retidas: 35, transbordadas: 4, engajadas: 20, semEngajamento: 30, resolvidas: 15, abandonadas: 8 },
  { date: '26 Out', retidas: 18, transbordadas: 1, engajadas: 12, semEngajamento: 10, resolvidas: 12, abandonadas: 2 },
];

const mockPieData = [
  { name: 'Sem Engajamento', value: 114, color: '#4C1D95' }, // Roxo
  { name: 'Resolvido', value: 38, color: '#D97706' },        // Laranja
  { name: 'Transferido', value: 41, color: '#2563EB' },      // Azul
  { name: 'Abandonado', value: 36, color: '#60A5FA' }        // Azul Claro
];

const mockOutcomeTable = [
  { outcome: 'Transferido', reason: 'Regra de Negócio', conv: 18, rate: '7.86%' },
  { outcome: 'Transferido', reason: 'Tentativas Máximas', conv: 18, rate: '7.86%' },
  { outcome: 'Transferido', reason: 'Solicitado pelo Usuário', conv: 5, rate: '2.18%' },
  { outcome: 'Resolvido', reason: 'Falhas de Integração', conv: 10, rate: '4.37%' },
  { outcome: 'Resolvido', reason: 'Dúvida Sanada', conv: 28, rate: '12.23%' },
  { outcome: 'Sem Engajamento', reason: 'Usuário não interagiu', conv: 114, rate: '49.78%' },
];

const mockBotTable = [
  { name: 'PROCON Assistente Principal', total: 11, esc: 3, escRate: '27.3%', def: 8, defRate: '72.7%' },
  { name: 'PROCON Guia de Direitos', total: 8, esc: 1, escRate: '12.5%', def: 7, defRate: '87.5%' },
  { name: 'PROCON Triagem Inicial', total: 2, esc: 0, escRate: '0.0%', def: 2, defRate: '100.0%' },
];
// -----------------------------------------------------------------

const IconTrendUp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
);
const IconTrendDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
);

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary');
  
  // States da API original
  const [kpis, setKpis] = useState<any>(null);

  useEffect(() => {
    carregarAnalytics();
  }, []);

  const carregarAnalytics = async () => {
    setLoading(true);
    try {
      // Mantém a chamada real da sua API para preencher o que já existe
      const resAnalytics = await adminService.getAnalytics();
      const data = resAnalytics?.data || {};
      setKpis(data.metricas || null);
    } catch (err) {
      console.error('Erro ao carregar analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading-screen">Carregando Dashboard Avançado...</div>;
  }

  return (
    <main className="tab-content analytics-view">
      
      {/* 1. BARRA DE FILTROS */}
      <div className="filters-bar">
        <div className="filter-group">
          <label>Duração</label>
          <select><option>Últimos 30 Dias</option><option>Últimos 7 Dias</option></select>
        </div>
        <div className="filter-group">
          <label>Canal</label>
          <select><option>Todos</option><option>WhatsApp</option><option>Web</option></select>
        </div>
        <div className="filter-group">
          <label>Fila de Atendimento</label>
          <select><option>Todas</option><option>Triagem</option><option>Especialista</option></select>
        </div>
        <div className="filter-group">
          <label>Nome do Robô</label>
          <select><option>Todos</option><option>PROCON Assistente</option></select>
        </div>
        <div className="filter-group">
          <label>Status da Conversa</label>
          <select><option>Todos</option><option>Resolvido</option><option>Transbordado</option></select>
        </div>
      </div>

      {/* 2. GRID DE KPIs (8 CARDS) */}
      <div className="kpi-grid-8">
        {[
          { label: 'Total de conversas do bot', val: kpis?.totalInteracoes || 229, delta: '-58.7%', up: false },
          { label: 'Taxa de transbordo (Humano)', val: '1.7%', delta: '38.5%', up: true },
          { label: 'Taxa de retenção (Deflection)', val: '98.3%', delta: '-0.5%', up: false },
          { label: 'Total de sessões do bot', val: '231', delta: '-58.6%', up: false },
          { label: 'Taxa de engajamento', val: '50.6%', delta: '20.3%', up: true },
          { label: 'Taxa de resolução', val: kpis?.taxaConclusao || '16.5%', delta: '22.4%', up: true },
          { label: 'Taxa de abandono', val: '15.6%', delta: '-4.4%', up: false },
          { label: 'CSAT (Satisfação)', val: 'N/A', delta: '0.0%', up: false },
        ].map((k, i) => (
          <div key={i} className="kpi-card">
            <div className="kpi-info">
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{k.val}</div>
              <div className={`kpi-delta ${k.up ? 'up' : 'down'}`}>
                {k.up ? <IconTrendUp /> : <IconTrendDown />} {k.delta}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 3. PRIMEIRA LINHA DE GRÁFICOS (3 COLUNAS) */}
      <div className="charts-row-3">
        <section className="chart-card">
          <div className="chart-header">
            <h3>Total de conversas ao longo do tempo</h3>
          </div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={mockTimeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <RechartsTooltip cursor={{ fill: 'transparent' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="retidas" name="Conversas retidas" stackId="a" fill="#0D9488" radius={[0,0,4,4]} />
                <Bar dataKey="transbordadas" name="Conversas transbordadas" stackId="a" fill="#312E81" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="chart-card">
          <div className="chart-header">
            <h3>Engajamento das sessões ao longo do tempo</h3>
          </div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={mockTimeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <RechartsTooltip cursor={{ fill: 'transparent' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="engajadas" name="Sessões engajadas" stackId="a" fill="#D97706" radius={[0,0,4,4]} />
                <Bar dataKey="semEngajamento" name="Sem engajamento" stackId="a" fill="#7C3AED" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="chart-card">
          <div className="chart-header">
            <h3>Resultados das sessões ao longo do tempo</h3>
          </div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={mockTimeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <RechartsTooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="resolvidas" name="Resolvidas" stroke="#10B981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="abandonadas" name="Abandonadas" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="transbordadas" name="Transbordadas" stroke="#EF4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* 4. SEGUNDA LINHA (PIE CHART + TABELA DE OUTCOMES) */}
      <div className="middle-row-2">
        <section className="chart-card">
          <div className="chart-header">
            <h3>% de Resultado de Engajamento</h3>
          </div>
          <div style={{ width: '100%', height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={mockPieData} cx="50%" cy="50%" innerRadius={0} outerRadius={90} dataKey="value" stroke="none">
                  {mockPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="table-card">
          <div className="table-header">
            <h3>Métricas por Resultado da Última Sessão</h3>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Resultado da Última Sessão</th>
                  <th>Grupo de Motivo</th>
                  <th className="text-right">Conversas</th>
                  <th className="text-right">Taxa de Resultado</th>
                </tr>
              </thead>
              <tbody>
                {mockOutcomeTable.map((row, i) => (
                  <tr key={i}>
                    <td><span className="table-strong">{row.outcome}</span></td>
                    <td className="table-muted">{row.reason}</td>
                    <td className="text-right">{row.conv}</td>
                    <td className="text-right">{row.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* 5. TABELA INFERIOR (METRICS BY BOT) */}
      <section className="table-card" style={{ marginBottom: 40 }}>
        <div className="table-header" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <h3 style={{ marginBottom: 16 }}>Métricas por Robô</h3>
          <div className="table-tabs">
            <button 
              className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
              onClick={() => setActiveTab('summary')}
            >
              Resumo
            </button>
            <button 
              className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              Detalhes
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome do Robô</th>
                <th className="text-right">Total de conversas</th>
                <th className="text-right">Conv. transbordadas</th>
                <th className="text-right">Taxa de transbordo</th>
                <th className="text-right">Conv. retidas</th>
                <th className="text-right">Taxa de retenção</th>
              </tr>
            </thead>
            <tbody>
              {mockBotTable.map((bot, i) => (
                <tr key={i}>
                  <td><span className="table-strong">{bot.name}</span></td>
                  <td className="text-right">{bot.total}</td>
                  <td className="text-right">{bot.esc}</td>
                  <td className="text-right">{bot.escRate}</td>
                  <td className="text-right">{bot.def}</td>
                  <td className="text-right">{bot.defRate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </main>
  );
}