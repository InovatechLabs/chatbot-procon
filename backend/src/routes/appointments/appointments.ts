import { Router } from 'express';
import {
  getAvailability,
  listAppointments,
  createAppointment,
  getAppointmentHistory,
  updateAppointment,
  cancelAppointment,
} from '../../controllers/appointments/appointmentsController.js';

const appointmentsRouter = Router();

// /availability precisa vir antes de /:id
appointmentsRouter.get('/availability', getAvailability);
appointmentsRouter.get('/', listAppointments);
appointmentsRouter.post('/', createAppointment);
appointmentsRouter.get('/:id/history', getAppointmentHistory);
appointmentsRouter.patch('/:id', updateAppointment);
appointmentsRouter.delete('/:id', cancelAppointment);

export default appointmentsRouter;
