import { Router } from 'express';
import {
  getAvailability,
  listAppointments,
  createAppointment,
  getAppointmentHistory,
  updateAppointment,
  cancelAppointment,
} from '../../controllers/appointments/appointmentsController.js';

const router = Router();

// /availability precisa vir antes de /:id
router.get('/availability', getAvailability);
router.get('/', listAppointments);
router.post('/', createAppointment);
router.get('/:id/history', getAppointmentHistory);
router.patch('/:id', updateAppointment);
router.delete('/:id', cancelAppointment);

export default router;
