import React, { useEffect, useState } from 'react';
import { adminService } from './services/api';
import './App.css';

interface Alternativa {
  id: string;
  texto: string;
  proximoNoId: string;
}

interface NoFluxo {
  id: string;
  titulo: string;
  textoMensagem: string;
  tipo: 'pergunta' | 'final' | 'informativo';
  noPaiId: string | null;
  alternativas: Alternativa[];
}

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);
const IconSave = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
  </svg>
);
const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IconTree = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m4.22-10.22l4.24-4.24M6.34 17.66l-4.24 4.24M23 12h-6m-6 0H1m20.24 4.24l-4.24-4.24M6.34 6.34L2.1 2.1"/>
  </svg>
);

export default function Flow() {
  const [nos, setNos] = useState<NoFluxo[]>([]);
  const [noSelecionado, setNoSelecionado] = useState<NoFluxo | null>(null);
  const [nosColapsados, setNosColapsados] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarFluxo();
  }, []);

  const carregarFluxo = async () => {
    setLoading(true);
    try {
      const resArvore = await adminService.getArvoreCompleta();
      const listaNos: NoFluxo[] = Array.isArray(resArvore?.data) ? resArvore.data : [];
      setNos(listaNos);
      if (listaNos.length > 0 && !noSelecionado) {
        setNoSelecionado(listaNos[0]);
      }
    } catch (err) {
      console.error('Erro ao carregar árvore de decisão:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleColapso = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNosColapsados(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSalvarNo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noSelecionado) return;
    try {
      await adminService.atualizarNo(noSelecionado.id, {
        titulo: noSelecionado.titulo,
        textoMensagem: noSelecionado.textoMensagem,
      });
      alert('Nó atualizado com sucesso!');
      carregarFluxo();
    } catch {
      alert('Erro ao atualizar nó.');
    }
  };

  const handleCriarNoFilho = async (_noPai: NoFluxo) => {
    const titulo = prompt('Título do Novo Nó Filho:');
    if (!titulo) return;
    try {
      await adminService.criarNo({
        titulo,
        textoMensagem: 'Nova mensagem de orientação...',
      });
      carregarFluxo();
    } catch {
      alert('Erro ao criar nó filho.');
    }
  };

  const handleDeletarNo = async (id: string) => {
    if (!confirm('Tem certeza? Isso excluirá este nó E TODOS os seus descendentes em cascata!')) return;
    try {
      await adminService.deletarNo(id);
      setNoSelecionado(null);
      carregarFluxo();
    } catch {
      alert('Erro ao deletar nó.');
    }
  };

  const handleAdicionarAlternativa = async () => {
    if (!noSelecionado) return;
    const texto = prompt('Rótulo da Opção/Botão:');
    if (!texto) return;
    try {
      await adminService.criarAlternativa({
        stepId: noSelecionado.id,
        nextStepId: noSelecionado.id,
        text: texto
      });
      carregarFluxo();
    } catch {
      alert('Erro ao criar alternativa.');
    }
  };

  const renderTree = (parentId: string | null = null) => {
    const nosFilhos = (nos || []).filter(n => n && n.noPaiId === parentId);
    if (nosFilhos.length === 0) return null;

    return (
      <ul className="tree-list">
        {nosFilhos.map(no => {
          if (!no) return null;
          const isSelected = noSelecionado?.id === no.id;
          const isCollapsed = !!nosColapsados[no.id];
          const temFilhos = (nos || []).some(n => n && n.noPaiId === no.id);

          return (
            <li key={no.id} className="tree-node">
              <div
                className={`node-row ${isSelected ? 'selected' : ''}`}
                onClick={() => setNoSelecionado(no)}
              >
                {temFilhos ? (
                  <span className="node-toggle" onClick={(e) => toggleColapso(no.id, e)}>
                    {isCollapsed ? '▸' : '▾'}
                  </span>
                ) : (
                  <span className="node-toggle-spacer"></span>
                )}
                <span className={`node-badge badge-${no.tipo}`}>{no.tipo || 'pergunta'}</span>
                <span className="node-title">{no.titulo}</span>
                <button
                  className="node-add"
                  title="Criar Nó Filho"
                  onClick={(e) => { e.stopPropagation(); handleCriarNoFilho(no); }}
                >
                  <IconPlus />
                </button>
              </div>
              {!isCollapsed && renderTree(no.id)}
            </li>
          );
        })}
      </ul>
    );
  };

  if (loading) {
    return <div className="loading-screen">Carregando Fluxo de Decisão...</div>;
  }

  return (
    <main className="tab-content fluxo-view">
      <div className="editor-layout">
        <div className="tree-panel">
          <div className="panel-header">
            <div>
              <h3>Árvore de decisão</h3>
              <p className="help-text">Clique num nó para editá-lo ou adicione filhos.</p>
            </div>
          </div>
          <div className="tree-container">
            {renderTree(null)}
          </div>
        </div>

        <div className="details-panel">
          {noSelecionado ? (
            <form onSubmit={handleSalvarNo} className="form-editor">
              <div className="panel-header-actions">
                <div>
                  <h3>Editar nó</h3>
                  <p className="node-path">{noSelecionado.titulo}</p>
                </div>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => handleDeletarNo(noSelecionado.id)}
                >
                  <IconTrash /> Excluir
                </button>
              </div>

              <div className="form-group">
                <label>Título do nó</label>
                <input
                  type="text"
                  value={noSelecionado.titulo}
                  onChange={e => setNoSelecionado({ ...noSelecionado, titulo: e.target.value })}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Tipo de nó</label>
                  <select
                    value={noSelecionado.tipo || 'pergunta'}
                    onChange={e => setNoSelecionado({ ...noSelecionado, tipo: e.target.value as any })}
                  >
                    <option value="pergunta">Pergunta / Menu</option>
                    <option value="informativo">Informativo</option>
                    <option value="final">Final (Gera Resumo LLM)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Texto da mensagem (WhatsApp)</label>
                <textarea
                  rows={5}
                  value={noSelecionado.textoMensagem}
                  onChange={e => setNoSelecionado({ ...noSelecionado, textoMensagem: e.target.value })}
                  required
                />
              </div>

              <button type="submit" className="btn-primary btn-full">
                <IconSave /> Salvar alterações
              </button>

              <div className="alt-header">
                <div>
                  <h4>Opções de resposta</h4>
                  <p className="help-text">Botões exibidos neste nó</p>
                </div>
                <button type="button" className="btn-ghost" onClick={handleAdicionarAlternativa}>
                  <IconPlus /> Adicionar
                </button>
              </div>

              <div className="alternatives-list">
                {(noSelecionado.alternativas || []).map(alt => (
                  <div key={alt.id} className="alt-item">
                    <input
                      type="text"
                      defaultValue={alt.texto}
                      placeholder="Rótulo da opção"
                      onBlur={async (e) => {
                        if (e.target.value !== alt.texto) {
                          await adminService.atualizarAlternativa(alt.id, { text: e.target.value });
                          carregarFluxo();
                        }
                      }}
                    />
                    <select
                      defaultValue={alt.proximoNoId}
                      onChange={async (e) => {
                        await adminService.atualizarAlternativa(alt.id, { nextStepId: e.target.value });
                        carregarFluxo();
                      }}
                    >
                      {(nos || []).map(n => (
                        <option key={n.id} value={n.id}>{n.titulo}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={async () => {
                        await adminService.deletarAlternativa(alt.id);
                        carregarFluxo();
                      }}
                    >
                      <IconX />
                    </button>
                  </div>
                ))}
                {(!noSelecionado.alternativas || noSelecionado.alternativas.length === 0) && (
                  <div className="alt-empty">
                    <p>Nenhuma alternativa cadastrada.</p>
                    <button type="button" className="btn-ghost" onClick={handleAdicionarAlternativa}>
                      <IconPlus /> Adicionar primeira opção
                    </button>
                  </div>
                )}
              </div>
            </form>
          ) : (
            <div className="empty-state">
              <div className="empty-icon"><IconTree /></div>
              <h4>Selecione um nó</h4>
              <p>Clique em um nó da árvore à esquerda para editar seus detalhes.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}