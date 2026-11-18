import { rootPrisma } from '../../database/index.js';
import { createRetentionSettingsService } from './retentionSettings.js';

// Loop independente de IA/Meta; não sobrepõe execuções e aguarda a atual ao sair.
export function startRetentionWorker(work = () => createRetentionSettingsService(rootPrisma).runDue(), intervalMs = 60_000) {
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: Promise<void>;
  const tick = async () => {
    try {
      const result = await work();
      if (result) console.info('Retenção concluída:', { version: result.version, sessions: result.sessions, appointments: result.appointments, receipts: result.receipts, outgoing: result.outgoing });
    } catch (error) {
      // Não registrar texto de exceções SQL que possa conter dados pessoais.
      console.error('Falha na retenção automática; nova tentativa na próxima verificação:', error instanceof Error ? error.name : 'UnknownError');
    } finally {
      if (!stopping) { timer = setTimeout(() => { current = tick(); }, intervalMs); timer.unref(); }
    }
  };
  current = tick();
  return async () => { stopping = true; if (timer) clearTimeout(timer); await current; };
}
