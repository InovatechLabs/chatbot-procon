import express from 'express';
import { AdminController } from '../../controllers/adminController.js';

const router = express.Router();

router.get('/analytics', AdminController.getAnalytics);
router.get('/fluxo/arvore', AdminController.getArvoreCompleta);
router.post('/fluxo/no', AdminController.criarNo);
router.put('/fluxo/no/:id', AdminController.atualizarNo);
router.delete('/fluxo/no/:id', AdminController.deletarNoEmCascata);

router.put('/fluxo/alternativa/:id', AdminController.atualizarAlternativa);
router.delete('/fluxo/alternativa/:id', AdminController.deletarAlternativa);

export default router;