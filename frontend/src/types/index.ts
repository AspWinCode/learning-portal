export interface User {
  id: number;
  email: string;
  full_name: string;
  role: 'admin' | 'owner' | 'trainer' | 'parent' | 'guest';
  is_active: boolean;
  created_at: string;
}

export interface Student {
  id: number;
  full_name: string;
  parent_id?: number | null;
  abonement_id?: number | null;
  status: 'active' | 'archived';
  created_at: string;
  parent?: User;
  abonement?: Abonement;
  programs?: ProgramSummary[];
}

export interface Abonement {
  id: number;
  name: string;
  price: number;
  discount_type: 'none' | 'amount' | 'percent';
  discount_value: number;
  status: 'active' | 'archived';
  created_at: string;
}

export interface Group {
  id: number;
  name: string;
  trainer_id: number;
  status: 'active' | 'archived';
  created_at: string;
  trainer?: User;
  students?: Student[];
  programs?: ProgramSummary[];
}

export interface Topic {
  id: number;
  name: string;
  description?: string;
  final_result?: string;
  order: number;
  status: string;
  created_at: string;
}

export interface Module {
  id: number;
  name: string;
  order: number;
  status: string;
  topics: Topic[];
  created_at: string;
}

export interface Program {
  id: number;
  name: string;
  version: number;
  parent_program_id?: number | null;
  status: string;
  created_at: string;
  modules: Module[];
}

export interface ProgramSummary {
  id: number;
  name: string;
  version: number;
  status: string;
}

export interface Grade {
  id: number;
  student_id: number;
  topic_id: number;
  trainer_id: number;
  grade: number;
  comment?: string;
  date: string;
  created_at: string;
  student?: Student;
  topic?: Topic;
  trainer?: User;
}

export interface Characteristic {
  id: number;
  student_id: number;
  trainer_id: number;
  month: number;
  year: number;
  data: Record<string, any>;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  admin_comment?: string;
  created_at: string;
  published_at?: string;
  student?: Student;
  trainer?: User;
}

export interface CharacteristicField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | string;
  required?: boolean;
  options?: string[];
}

export interface CharacteristicTemplate {
  id: number;
  name: string;
  fields: CharacteristicField[];
  is_active: boolean;
}

