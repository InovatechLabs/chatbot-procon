import 'dotenv/config';
import { prisma } from '../src/database/index.js';
import { retentionPlan } from '../src/services/privacy/retention.js';
try {
  const policy = { ...(process.env.RETENTION_SESSION_DAYS ? { sessionsDays: Number(process.env.RETENTION_SESSION_DAYS) } : {}), ...(process.env.RETENTION_APPOINTMENT_DAYS ? { appointmentsDays: Number(process.env.RETENTION_APPOINTMENT_DAYS) } : {}) };
  if (process.argv.includes('--apply') && process.env.RETENTION_APPROVED !== 'true') throw new Error('Defina RETENTION_APPROVED=true somente após aprovação institucional dos prazos.');
  console.log(await retentionPlan(prisma, policy, process.argv.includes('--apply')));
} catch (error) { console.error(error instanceof Error ? error.message : 'Falha na retenção.'); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
