export type Role = 'admin' | 'caregiver' | 'viewer';
export type Condition = 'type1' | 'type2' | 'type2_cardiac' | 'prediabetes' | 'none';
export type VitalKind = 'glucose' | 'bp' | 'heart_rate' | 'weight' | 'spo2' | 'temperature' | 'hba1c';

export interface Family { id: string; name: string; invite_code: string; created_by?: string | null; created_at?: string }
export interface Membership { family: Family; role: Role }
export interface Person { user_id: string; username: string; display_name: string | null; role: Role; joined_at: string }
export interface AppUser { id: string; username: string; display_name?: string | null }

export interface Patient {
  id: string;
  family_id: string;
  linked_user_id?: string | null;
  full_name: string;
  relation?: string | null;
  dob?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  phone?: string | null;
  condition: Condition;
  diagnosed_year?: number | null;
  heart_conditions?: string | null;
  other_conditions?: string | null;
  allergies?: string | null;
  doctor_name?: string | null;
  doctor_phone?: string | null;
  hospital?: string | null;
  emergency_name?: string | null;
  emergency_phone?: string | null;
  insulin_regimen?: string | null;
  target_fasting_min: number;
  target_fasting_max: number;
  target_pp_max: number;
  target_sys_max: number;
  target_dia_max: number;
  target_hr_min: number;
  target_hr_max: number;
  daily_kcal_goal: number;
  daily_water_goal_ml: number;
  color: string;
  notes?: string | null;
  created_at?: string;
}

export interface Vital {
  id: string;
  patient_id: string;
  kind: VitalKind;
  value1: number;
  value2?: number | null;
  value3?: number | null;
  context?: string | null;
  notes?: string | null;
  measured_at: string;
  created_by?: string | null;
}

export interface FoodItem { name: string; qty: number; unit: string; kcal: number; carbs: number; protein: number }
export interface Meal {
  id: string;
  patient_id: string;
  meal_type: string;
  items: FoodItem[];
  total_kcal: number;
  total_carbs: number;
  total_protein: number;
  notes?: string | null;
  eaten_at: string;
}

export interface WaterLog { id: string; patient_id: string; ml: number; logged_at: string }

export interface Medicine {
  id: string;
  patient_id: string;
  name: string;
  strength?: string | null;
  form: string;
  dose?: string | null;
  food_relation?: string | null;
  times: string[];
  days: number[];
  start_date?: string | null;
  end_date?: string | null;
  stock?: number | null;
  purpose?: string | null;
  notes?: string | null;
  active: boolean;
}

export interface MedicineLog {
  id: string;
  medicine_id: string;
  patient_id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: 'taken' | 'skipped';
  logged_at: string;
}

export interface Reminder {
  id: string;
  patient_id: string;
  kind: string;
  label: string;
  time: string;
  days: number[];
  enabled: boolean;
}

export interface Report {
  id: string;
  patient_id: string;
  title: string;
  category?: string | null;
  report_date?: string | null;
  file_path: string;
  file_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  notes?: string | null;
  created_at?: string;
}

export interface CustomFood { id: string; family_id: string; name: string; unit: string; kcal: number; carbs: number; protein: number }

export type PatientTable = 'vitals' | 'meals' | 'water_logs' | 'medicines' | 'medicine_logs' | 'reminders' | 'reports';
