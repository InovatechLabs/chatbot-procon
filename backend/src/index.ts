import express from 'express';
import type { Request, Response, Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import webhookRouter from './routes/webhook.js';

dotenv.config();

const app: Application = express();
const PORT: number = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'API está funcionando corretamente!' });
});

app.use('/webhook', webhookRouter);

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});