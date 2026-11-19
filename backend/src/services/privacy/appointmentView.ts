import { maskPhone, redactIdentifiers } from './redact.js';
export function appointmentView(app: any) {
  return { id: app.id, phoneNumber: maskPhone(app.phoneNumber), citizenName: app.citizenName ?? app.userName ?? '',
    subject: redactIdentifiers(app.subject ?? app.categoryName ?? ''), scheduledAt: app.scheduledAt,
    status: app.status.toUpperCase(), source: app.source, durationMin: app.durationMin, confirmedAt: app.confirmedAt ?? null, reminderSentAt: app.reminderQueuedAt ?? null };
}
