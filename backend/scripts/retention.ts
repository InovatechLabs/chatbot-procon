import 'dotenv/config';
import { prisma } from '../src/database/index.js';
import { createRetentionSettingsService } from '../src/services/privacy/retentionSettings.js';
try {
  if (process.argv.includes('--apply')) console.log(await createRetentionSettingsService(prisma).run());
  else console.log('A retenção é automática conforme a política ativa no painel. Para antecipar uma execução real, use --apply.');
} catch (error) { console.error(error instanceof Error ? error.message : 'Falha na retenção.'); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
