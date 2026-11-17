import { cx, ui } from './ui/styles';
import React, { useCallback, useEffect, useState } from 'react';
import { adminService } from './services/api';

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

const nodeTones = { pergunta: 'bg-brand-light text-brand-dark', informativo: 'bg-slate-100 text-slate-600', final: 'bg-success-light text-success' };

export default function Flow() {
  const [nos, setNos] = useState<NoFluxo[]>([]);
  const [noSelecionado, setNoSelecionado] = useState<NoFluxo | null>(null);
  const [nosColapsados, setNosColapsados] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const carregarFluxo = useCallback(() => {
    return adminService.getArvoreCompleta().then(resArvore => {
      const listaNos: NoFluxo[] = Array.isArray(resArvore?.data) ? resArvore.data : [];
      setNos(listaNos);
      setNoSelecionado(current => current ?? listaNos[0] ?? null);
    }).catch(err => {
      console.error('Erro ao carregar árvore de decisão:', err);
    }).finally(() => {
      setLoading(false);
    });
  }, []);
  useEffect(() => { void carregarFluxo(); }, [carregarFluxo]);

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

  const handleCriarNoFilho = async () => {
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
      <ul data-ui="tree-list" className={cx(ui.treeList)}>
        {nosFilhos.map(no => {
          if (!no) return null;
          const isSelected = noSelecionado?.id === no.id;
          const isCollapsed = !!nosColapsados[no.id];
          const temFilhos = (nos || []).some(n => n && n.noPaiId === no.id);

          return (
            <li key={no.id} data-ui="tree-node" className={cx(ui.treeNode)}>
              <div
                data-selected={isSelected} data-ui="node-row" className={cx(ui.nodeRow)}
                onClick={() => setNoSelecionado(no)}
              >
                {temFilhos ? (
                  <button type="button" data-ui="node-toggle" className={cx(ui.nodeToggle)} aria-expanded={!isCollapsed} aria-label={`${isCollapsed ? 'Expandir' : 'Recolher'} ${no.titulo}`} onClick={(e) => toggleColapso(no.id, e)}>
                    {isCollapsed ? '▸' : '▾'}
                  </button>
                ) : (
                  <span data-ui="node-toggle-spacer" className={cx(ui.nodeToggleSpacer)}></span>
                )}
                <span className={cx(ui.nodeBadge, nodeTones[no.tipo])}>{no.tipo || 'pergunta'}</span>
                <button type="button" data-ui="node-title" className={cx(ui.nodeTitle)} aria-pressed={isSelected} onClick={() => setNoSelecionado(no)}>{no.titulo}</button>
                <button
                  data-ui="node-add" className={cx(ui.nodeAdd)}
                  type="button" title="Adicionar item" aria-label={`Adicionar item a ${no.titulo}`}
                  onClick={(e) => { e.stopPropagation(); void handleCriarNoFilho(); }}
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
    return <div data-ui="loading-screen" className={cx(ui.loadingScreen)}>Carregando Fluxo de Decisão...</div>;
  }

  return (
    <main data-ui="tab-content fluxo-view" className={cx(ui.tabContent, ui.fluxoView)}>
      <div data-ui="editor-layout" className={cx(ui.editorLayout)}>
        <div data-ui="tree-panel" className={cx(ui.treePanel)}>
          <div data-ui="panel-header" className={cx(ui.panelHeader)}>
            <div>
              <h3>Estrutura do menu</h3>
              <p data-ui="help-text" className={cx(ui.helpText)}>Selecione um item para editar as opções e a orientação.</p>
            </div>
          </div>
          <div data-ui="tree-container" className={cx(ui.treeContainer)}>
            {renderTree(null)}
          </div>
        </div>

        <div data-ui="details-panel" className={cx(ui.detailsPanel)}>
          {noSelecionado ? (
            <form onSubmit={handleSalvarNo} data-ui="form-editor" className={cx(ui.formEditor)}>
              <div data-ui="panel-header-actions" className={cx(ui.panelHeaderActions)}>
                <div>
                  <h3>Editar item</h3>
                  <p data-ui="node-path" className={cx(ui.nodePath)}>{noSelecionado.titulo}</p>
                </div>
                <button
                  type="button"
                  data-ui="btn-danger" className={cx(ui.btnDanger)}
                  onClick={() => handleDeletarNo(noSelecionado.id)}
                >
                  <IconTrash /> Excluir
                </button>
              </div>

              <div data-ui="form-group" className={cx(ui.formGroup)}>
                <label htmlFor="flow-title">Título do item</label>
                <input
                  id="flow-title"
                  type="text"
                  value={noSelecionado.titulo}
                  onChange={e => setNoSelecionado({ ...noSelecionado, titulo: e.target.value })}
                  required
                />
              </div>

              <div data-ui="form-row" className={cx(ui.formRow)}>
                <div data-ui="form-group" className={cx(ui.formGroup)}>
                  <label htmlFor="flow-type">Tipo de item</label>
                  <select
                    id="flow-type"
                    value={noSelecionado.tipo || 'pergunta'}
                    onChange={e => setNoSelecionado({ ...noSelecionado, tipo: e.target.value as NoFluxo['tipo'] })}
                  >
                    <option value="pergunta">Menu com opções</option>
                    <option value="informativo">Informativo</option>
                    <option value="final">Resposta ao consumidor</option>
                  </select>
                </div>
              </div>

              <div data-ui="form-group" className={cx(ui.formGroup)}>
                <label htmlFor="flow-message">Mensagem no WhatsApp</label>
                <textarea
                  id="flow-message"
                  rows={5}
                  value={noSelecionado.textoMensagem}
                  onChange={e => setNoSelecionado({ ...noSelecionado, textoMensagem: e.target.value })}
                  required
                />
              </div>

              <button type="submit" data-ui="btn-primary btn-full" className={cx(ui.btnPrimary, ui.btnFull)}>
                <IconSave /> Salvar alterações
              </button>

              <div data-ui="alt-header" className={cx(ui.altHeader)}>
                <div>
                  <h4>Opções de resposta</h4>
                  <p data-ui="help-text" className={cx(ui.helpText)}>Botões apresentados ao consumidor</p>
                </div>
                <button type="button" data-ui="btn-ghost" className={cx(ui.btnGhost)} onClick={handleAdicionarAlternativa}>
                  <IconPlus /> Adicionar
                </button>
              </div>

              <div data-ui="alternatives-list" className={cx(ui.alternativesList)}>
                {(noSelecionado.alternativas || []).map(alt => (
                  <div key={alt.id} data-ui="alt-item" className={cx(ui.altItem)}>
                    <input
                      type="text"
                      defaultValue={alt.texto}
                      placeholder="Rótulo da opção"
                      aria-label="Texto do botão"
                      onBlur={async (e) => {
                        if (e.target.value !== alt.texto) {
                          await adminService.atualizarAlternativa(alt.id, { text: e.target.value });
                          carregarFluxo();
                        }
                      }}
                    />
                    <select
                      aria-label={`Destino da opção ${alt.texto}`}
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
                      data-ui="btn-icon" className={cx(ui.btnIcon)}
                      aria-label={`Remover opção ${alt.texto}`}
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
                  <div data-ui="alt-empty" className={cx(ui.altEmpty)}>
                    <p>Nenhuma alternativa cadastrada.</p>
                    <button type="button" data-ui="btn-ghost" className={cx(ui.btnGhost)} onClick={handleAdicionarAlternativa}>
                      <IconPlus /> Adicionar primeira opção
                    </button>
                  </div>
                )}
              </div>
            </form>
          ) : (
            <div data-ui="empty-state" className={cx(ui.emptyState)}>
              <div data-ui="empty-icon" className={cx(ui.emptyIcon)}><IconTree /></div>
              <h4>Selecione um nó</h4>
              <p>Clique em um nó da árvore à esquerda para editar seus detalhes.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
