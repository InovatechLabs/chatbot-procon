import { Router } from 'express';
import { getAnalytics } from '../../controllers/analytics/graphs/analyticsController.js';
const router = Router();
router.get('/', getAnalytics);
export default router;
//# sourceMappingURL=analytics.js.map