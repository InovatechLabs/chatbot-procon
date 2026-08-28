import { Router } from 'express';
import {
  getAnalytics,
  createAnalytics,
  updateAnalytics,
  deleteAnalytics
} from '../../controllers/analytics/graphs/analyticsController.js';

const router = Router();

router.get('/', getAnalytics);
router.post('/', createAnalytics);
router.put('/:id', updateAnalytics);
router.delete('/:id', deleteAnalytics);

export default router;