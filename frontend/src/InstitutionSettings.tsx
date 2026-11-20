import { useEffect, useState } from 'react';
import axios from 'axios';
import { institutionApi, type InstitutionSettings, type InstitutionValue } from './services/institution';
import { cx, ui } from './ui/styles';

const contacts = [
  { key: 'name', label: 'Nome da unidade', max: 100 },
  { key: 'phone', label: 'Telefone / WhatsApp de contato', max: 36, type: 'tel' },
  { key: 'email', label: 'E-mail', max: 160, type: 'email' },
  { key: 'address', label: 'Endereço do atendimento presencial', max: 240 },
  { key: 'hours', label: 'Horário informado ao público', max: 200 },
] as const;

const messages = [
  { key: 'referralMessage', label: 'Encaminhamento para análise presencial', help: 'Enviada quando o bot precisa encaminhar o caso para análise da equipe.' },
  { key: 'appointmentMessage', label: 'Convite para agendar', help: 'Enviada quando o bot identifica um pedido de agendamento.' },
  { key: 'rescheduleMessage', label: 'Pedido de cancelamento ou remarcação', help: 'Orienta quem deseja alterar um agendamento presencial.' },
  { key: 'privacyMessage', label: 'Solicitação sobre dados pessoais', help: 'Orienta quem quer falar com a equipe sobre seus dados.' },
  { key: 'unavailableMessage', label: 'Consulta temporariamente indisponível', help: 'Enviada quando o bot não consegue concluir a consulta.' },
] as const;

function draftOf(settings: InstitutionSettings): InstitutionValue {
  return {
    name: settings.name, address: settings.address, phone: settings.phone,
    email: settings.email, hours: settings.hours,
    referralMessage: settings.referralMessage, appointmentMessage: settings.appointmentMessage,
    queueMessage: settings.queueMessage, rescheduleMessage: settings.rescheduleMessage,
    privacyMessage: settings.privacyMessage, unavailableMessage: settings.unavailableMessage,
  };
}

const failureMessage = (failure: unknown) => axios.isAxiosError(failure)
  ? failure.response?.data?.error || 'Não foi possível acessar as configurações. Confira a conexão.'
  : 'Não foi possível concluir a operação.';

export default function InstitutionSettingsPage() {
  const [settings, setSettings] = useState<InstitutionSettings | null>(null);
  const [draft, setDraft] = useState<InstitutionValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    void institutionApi.get()
      .then(data => { if (active) { setSettings(data); setDraft(draftOf(data)); } })
      .catch(failure => { if (active) setError(failureMessage(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const dirty = !!settings && !!draft && Object.keys(draft).some(key => draft[key as keyof InstitutionValue] !== settings[key as keyof InstitutionValue]);
  const change = (key: keyof InstitutionValue, value: string) => {
    setDraft(previous => previous && { ...previous, [key]: value });
    setNotice('');
  };
  const save = async () => {
    if (!settings || !draft || !dirty || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = await institutionApi.save(settings.version, draft);
      setSettings(updated);
      setDraft(draftOf(updated));
      setNotice('Configurações salvas. As próximas respostas do chatbot já usam estes dados.');
    } catch (failure) {
      setError(failureMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  return <main className="mx-auto max-w-5xl" aria-busy={loading || saving}>
    {loading && <p role="status">Carregando configurações...</p>}
    {error && <p role="alert" className="mb-4 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mb-4 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!loading && draft && <form id="institution-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={saving} className="grid gap-6">
        <section aria-labelledby="institution-contacts" className="border border-slate-200 bg-white p-6 sm:p-8">
          <h2 id="institution-contacts" className="text-xl font-semibold text-brand-dark">Dados da unidade</h2>
          <p className="mt-2 text-sm text-slate-600">A disponibilidade e as vagas são definidas na página Disponibilidade.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {contacts.map(field => <div key={field.key} className={cx(ui.formGroup)}>
              <label htmlFor={field.key}>{field.label}</label>
              <input id={field.key} required maxLength={field.max} type={'type' in field ? field.type : 'text'} value={draft[field.key]} onChange={event => change(field.key, event.target.value)} />
            </div>)}
          </div>
        </section>
        <section aria-labelledby="institution-messages" className="border border-slate-200 bg-white p-6 sm:p-8">
          <h2 id="institution-messages" className="text-xl font-semibold text-brand-dark">Mensagens de encaminhamento</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Para usar os dados da unidade em uma mensagem, insira <code>{'{{nome}}'}</code>, <code>{'{{endereco}}'}</code>, <code>{'{{telefone}}'}</code>, <code>{'{{email}}'}</code> ou <code>{'{{horario}}'}</code>. O texto final pode ter até 700 caracteres.</p>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {messages.map(({ key, label, help }) => <div key={key} className={cx(ui.formGroup)}>
              <label htmlFor={key}>{label}</label>
              <p id={`${key}-help`} className="text-xs leading-5 text-slate-600">{help}</p>
              <textarea id={key} required rows={4} maxLength={600} aria-describedby={`${key}-help`} value={draft[key]} onChange={event => change(key, event.target.value)} />
            </div>)}
          </div>
        </section>
      </fieldset>
    </form>}
    {!loading && <div className="mt-5 flex flex-wrap gap-3">
      {draft && <button form="institution-form" type="submit" className={cx(ui.btnPrimary)} disabled={!dirty || saving}>{saving ? 'Salvando...' : 'Salvar configurações'}</button>}
      {(!draft || error) && <button type="button" className={cx(ui.btnGhost)} disabled={saving} onClick={() => {
        if (dirty && !window.confirm('Descartar as alterações locais e recarregar as configurações?')) return;
        setError(''); setNotice(''); setLoading(true); setReload(value => value + 1);
      }}>Recarregar</button>}
    </div>}
  </main>;
}
