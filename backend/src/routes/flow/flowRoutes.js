import { Router } from "express";
import { FlowController } from "../../controllers/flow/flowController.js";
const flowRouter = Router();
// Rotas para gerenciar o fluxo de etapas
flowRouter.post("/steps", FlowController.create); // Criar uma nova etapa
flowRouter.get("/steps", FlowController.list); // Listar todas as etapas
flowRouter.get("/steps/:id", FlowController.getById); // Buscar uma etapa específica pelo ID
flowRouter.put("/steps/:id", FlowController.update); // Atualizar uma etapa existente
flowRouter.delete("/steps/:id", FlowController.delete); // Excluir uma etapa existente
export default flowRouter;
//# sourceMappingURL=flowRoutes.js.map