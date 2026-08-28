import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Rota de teste simples para isolar o problema
app.get('/analytics', (req, res) => {
  try {
    return res.status(200).json({ 
      success: true, 
      message: 'Analytics respondendo com sucesso!' 
    });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.get('/nodes', (req, res) => {
  try {
    return res.status(200).json({ 
      success: true, 
      data: [] 
    });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor de DEBUG rodando na porta ${PORT}`);
});