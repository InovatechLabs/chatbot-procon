import express from 'express';
import cors from 'cors';
import ApiRouter from './routes/index.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Monta as rotas na raiz da API
app.use('/', ApiRouter);

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});