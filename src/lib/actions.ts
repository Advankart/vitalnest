import { api } from './api';
import type { Medicine } from './types';
import { doseFor, doseQty } from './health';

/** Mark a scheduled dose taken / un-taken, keeping the pill stock count in step. */
export async function toggleDose(med: Medicine, date: string, time: string, currentlyTaken: boolean) {
  const n = med.form === 'tablet' || med.form === 'capsule' ? doseQty(doseFor(med, time)) : 1;
  if (currentlyTaken) {
    await api().deleteMedLog(med.id, date, time);
    if (med.stock != null) await api().update<Medicine>('medicines', med.id, { stock: med.stock + n });
  } else {
    await api().upsertMedLog({ medicine_id: med.id, patient_id: med.patient_id, scheduled_date: date, scheduled_time: time, status: 'taken' });
    if (med.stock != null && med.stock > 0) await api().update<Medicine>('medicines', med.id, { stock: Math.max(0, med.stock - n) });
  }
}
