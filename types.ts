export enum Role {
  ADMIN = 'ADMIN',
  STUDENT = 'STUDENT'
}

export interface UserContextType {
  user: {
    username: string;
    role: string;
  } | null;
  login: (username: string, role: string) => void;
  logout: () => void;
}

export interface ClassExamQuestion {
  id: string;
  class_id: string | number;
  tipo: 'multiple_choice' | 'true_false' | 'open';
  pregunta: string;
  respuesta_correcta: string;
  explicacion?: string;
  opciones?: string[];
}

export interface StudentClassExam {
  id: string;
  estudiante_id: string;
  class_id: string | number;
  pregunta_id: string;
  respuesta_dada?: string;
  es_correcta: boolean;
}

export interface User {
  id?: string;
  username: string;
  role: Role;
  email?: string;
  password?: string;
  current_session_id?: string | null;
}

export interface SubjectGuide {
  id: string;
  name: string;
  lessons_list: string;
  learning_prompt?: string;
}

export interface Lesson {
  id: string | number;
  subject: string;
  title: string;
  durationMinutes: number;
  completed: boolean;
  date: string;
  actualDurationMinutes?: number;
  elapsedSeconds?: number;
  completedTopicsCount?: number;
  grade?: number;
  examResults?: any[];
  learningPrompt?: string;
  chatHistory?: ChatMessage[];
  credits_transfered?: boolean;
  lesson_status?: 'Pendiente' | 'En Progreso' | 'Aprobada' | 'Reprobada' | 'Completada';
  questions?: any;
  microtemas?: Microtema[];
}

export interface Account {
  owner_id: string;
  balance: number;
}

export interface Transaction {
  id: string;
  from_account: string;
  to_account: string;
  amount: number;
  concept: string;
  created_at: string;
}

export interface StudentData {
  username: string;
  student_lessons: Lesson[];
}

export interface ArrayParts {
  text: string;
}

export interface Course {
  id: string | number;
  nombre: string;
}

export interface Class {
  id: string | number;
  titulo: string;
  descripcion: string;
  course_id: string | number;
  assigned_time_minutes: number;
}

export interface Topic {
  id: string | number;
  titulo: string;
  contenido: string;
  class_id: string | number;
  order_index: number;
}

export interface StudentClassProgress {
  id: string | number;
  estudiante_id: string;
  class_id: string | number;
  current_topic_id: string | number | null;
  time_remaining_seconds: number;
  is_in_penalty: boolean;
  penalty_time_remaining_seconds: number;
}

export interface Pregunta {
  id: string | number;
  topic_id: string | number;
  tipo: 'multiple_choice' | 'true_false' | 'open';
  pregunta: string;
  respuesta_correcta: string;
  explicacion?: string;
  opciones?: OpcionPregunta[];
}

export interface OpcionPregunta {
  id: string | number;
  pregunta_id: string | number;
  opcion: string;
  es_correcta: boolean;
}

export interface IntentoExamen {
  id: string | number;
  estudiante_id: string;
  class_id: string | number;
  fecha_inicio: string;
  fecha_fin?: string;
  calificacion?: number;
  topics_covered?: number[];
}

export interface RespuestaEstudiante {
  id: string | number;
  intento_id: string | number;
  pregunta_id: string | number;
  respuesta: string;
  es_correcta?: boolean;
  score?: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: ArrayParts[];
  timestamp?: string;
  is_correct?: boolean;
  selectedOption?: string; 
  isSilent?: boolean; 
  studentResponse?: string;
  validationStatus?: 'correct' | 'incorrect' | 'irrelevant' | 'neutral';
  is_unlocked?: boolean;
  isError?: boolean;
  isStreaming?: boolean; // true while text is still streaming in
}

