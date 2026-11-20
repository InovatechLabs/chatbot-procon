import { useEffect, useState } from 'react';
import axios from 'axios';
import api from './services/api';
import { ui } from './ui/styles';

interface GenerationValue { model: string; thinkingEnabled: boolean }
interface GenerationSettings extends GenerationValue { version: number }

const failureMessage = (failure: unknown) => axios.isAxiosError(failure)
  ? failure.response?.data?.error || 'Não foi possível concluir. Confira a conexão com o painel.'
  : 'Não foi possível concluir a operação.';

export default function AiSettingsPage() {
  const [settings, setSettings] = useState<GenerationSettings | null>(null);
  const [model, setModel] = useState('');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    let active = true;
    void api.get<GenerationSettings>('/ai-settings').then(({ data }) => {
      if (active) {
        setSettings(data);
        setModel(data.model);
        setThinkingEnabled(data.thinkingEnabled);
        setConflict(false);
      }
    }).catch(failure => { if (active) setError(failureMessage(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const dirty = !!settings && (model.trim() !== settings.model || thinkingEnabled !== settings.thinkingEnabled);
  const save = async () => {
    if (!settings || !model.trim() || saving || conflict || (!dirty && settings.version !== 0)) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const value: GenerationValue = { model: model.trim(), thinkingEnabled };
      const { data } = await api.put<GenerationSettings>('/ai-settings', { version: settings.version, value }, { timeout: 70_000 });
      setSettings(data);
      setModel(data.model);
      setThinkingEnabled(data.thinkingEnabled);
      setNotice('Configuração salva. O chatbot já usa estas opções nos próximos pedidos.');
    } catch (failure) {
      setError(failureMessage(failure));
      setConflict(axios.isAxiosError(failure) && failure.response?.status === 409);
    } finally {
      setSaving(false);
    }
  };

  return <main className="mx-auto max-w-4xl border border-slate-200 bg-white p-6 sm:p-8" aria-busy={loading || saving}>
    <h2 className="text-xl font-semibold text-brand-dark">Modelo de geração</h2>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Essa configuração é usada na classificação das mensagens, nas orientações e na reescrita do menu.</p>
    {loading && <p className="mt-5" role="status">Carregando configurações...</p>}
    {error && <p role="alert" className="mt-5 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mt-5 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!loading && settings && <form className="mt-6" onSubmit={event => { event.preventDefault(); void save(); }}>
      <p className="mb-5 text-sm text-slate-700">{settings.model ? <>Em uso: <strong>{settings.model}</strong> · Thinking {settings.thinkingEnabled ? 'ativado' : 'desativado'}</> : 'Nenhum modelo de geração configurado.'} {settings.version === 0 && settings.model && 'Configuração inicial do servidor.'}</p>
      <fieldset disabled={saving || conflict} className="min-w-0">
        <div className={ui.formGroup}>
          <label htmlFor="generation-model">Modelo instalado no Ollama</label>
          <input id="generation-model" type="text" required maxLength={200} spellCheck={false} autoCapitalize="none" value={model} placeholder="gemma3:12b" aria-describedby="generation-model-help" onChange={event => { setModel(event.target.value); setNotice(''); }} />
          <p id="generation-model-help" className="mt-2 text-xs text-slate-600">Use o nome e a versão do modelo no servidor, como gemma3:12b.</p>
        </div>
        <label className="flex items-start gap-3 text-sm font-semibold text-slate-800">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={thinkingEnabled} onChange={event => { setThinkingEnabled(event.target.checked); setNotice(''); }} />
          Habilitar thinking mode
        </label>
        <p className="ml-7 mt-1 text-xs leading-5 text-slate-600">A opção depende do modelo e pode aumentar o tempo das respostas.</p>
        <p className="mt-5 text-sm leading-6 text-slate-600">O Ollama precisa estar acessível. Antes de salvar, o painel faz uma consulta de teste ao modelo, que pode levar até um minuto.</p>
        <button type="submit" className={`${ui.btnPrimary} mt-4`} disabled={!model.trim() || (!dirty && settings.version !== 0)}>{saving ? 'Testando no Ollama...' : 'Testar e salvar'}</button>
      </fieldset>
    </form>}
    {!loading && (!settings || conflict) && <button type="button" className={`${ui.btnGhost} mt-4`} onClick={() => {
      setError(''); setLoading(true); setReload(value => value + 1);
    }}>Recarregar configuração</button>}
  </main>;
}
