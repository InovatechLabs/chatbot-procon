import api from './api';

export interface InstitutionValue {
  name: string;
  address: string;
  phone: string;
  email: string;
  hours: string;
  referralMessage: string;
  appointmentMessage: string;
  unavailableMessage: string;
  rescheduleMessage: string;
  privacyMessage: string;
  queueMessage: string;
}

export type InstitutionSettings = InstitutionValue & { version: number; updatedAt: string | null };

export const institutionApi = {
  get: async (): Promise<InstitutionSettings> => (await api.get('/institution')).data,
  save: async (version: number, value: InstitutionValue): Promise<InstitutionSettings> =>
    (await api.put('/institution', { version, value })).data,
};
