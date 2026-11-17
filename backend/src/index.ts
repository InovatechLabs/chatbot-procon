import dotenv from 'dotenv';
import { createApp } from './app.js';
import { privacyKeys } from './services/privacy/crypto.js';
import { startMessageWorkers } from './services/whatsapp/messageWorkers.js';
import { rootPrisma } from './database/index.js';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

privacyKeys();
const app = createApp();
const PORT: number = Number(process.env.PORT) || 3000;

const stopWorkers = startMessageWorkers();
const server = app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
let stopping = false;
const shutdown = () => {
  if (stopping) return; stopping = true;
  const closed = new Promise<void>(resolve => server.close(() => resolve()));
  const deadline = setTimeout(() => process.exit(1), 20_000); deadline.unref();
  void Promise.allSettled([closed, stopWorkers()]).then(() => rootPrisma.$disconnect()).then(() => { clearTimeout(deadline); process.exit(0); });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
