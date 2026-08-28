import { Router } from 'express';
import { getNodes, createNode, updateNode, deleteNode, createOption, updateOption, deleteOption } from '../../controllers/nodes/nodesController.js';
const router = Router();
// Rotas de Nós (Steps)
router.get('/', getNodes);
router.post('/', createNode);
router.put('/:id', updateNode);
router.delete('/:id', deleteNode);
// Rotas de Alternativas (Options)
router.post('/options', createOption);
router.put('/options/:id', updateOption);
router.delete('/options/:id', deleteOption);
export default router;
//# sourceMappingURL=nodes.js.map