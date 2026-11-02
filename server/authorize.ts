import crypto from 'crypto';
import { hashPassword, isHashedPassword } from '../cryptoUtils.ts';
import type { SessionUser } from './session.ts';
import { getAdmin } from './supabaseAdmin.ts';
import type { TableQuery } from './executeQuery.ts';

const CATALOG_READ = new Set([
  'courses', 'classes', 'topics', 'preguntas', 'opciones_pregunta',
  'class_exam_questions', 'settings', 'cached_evaluations',
]);

const STUDENT_INSERT = new Set([
  'courses', 'classes', 'topics', 'preguntas', 'opciones_pregunta',
  'class_exam_questions', 'cached_evaluations',
]);

const OWN_ROWS = new Set([
  'class_chat_history', 'intentos_examen', 'student_class_exams', 'student_class_progress',
]);

const RPC_ALLOW = new Set([
  'transferir_creditos_estudiante',
  'transferencia_manual_admin',
  'transferencia_estudiante',
]);

function isAdmin(session: SessionUser) {
  return session.role === 'ADMIN';
}

function identities(session: SessionUser) {
  return [session.id, session.username, session.email]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

function matches(value: unknown, session: SessionUser) {
  if (value == null) return false;
  return identities(session).includes(String(value).trim().toLowerCase());
}

function rowsOf(values: unknown): any[] {
  if (values == null) return [];
  return Array.isArray(values) ? values : [values];
}

function ownerFilter(query: TableQuery, column: string) {
  return (query.filters || []).find((filter) =>
    filter.column === column && (filter.op === 'eq' || filter.op === 'ilike')
  );
}

function filterMatchesSelf(query: TableQuery, session: SessionUser) {
  return (query.filters || []).some((filter) =>
    (filter.op === 'eq' || filter.op === 'ilike') &&
    (filter.column === 'username' || filter.column === 'id' || filter.column === 'email') &&
    matches(filter.value, session)
  );
}

async function idsBelongTo(table: string, column: string, ids: unknown[], session: SessionUser) {
  const clean = ids.map((id) => String(id)).filter(Boolean);
  if (clean.length === 0) return false;
  const { data, error } = await getAdmin().from(table).select(column).in('id', clean);
  if (error || !data || data.length !== clean.length) return false;
  return data.every((row: any) => matches(row[column], session));
}

async function lessonIdsBelongTo(ids: unknown[], session: SessionUser) {
  const clean = ids.map((id) => String(id)).filter(Boolean);
  if (clean.length === 0) return false;
  const { data, error } = await getAdmin()
    .from('student_lessons')
    .select('id, student_username')
    .in('id', clean);
  if (error || !data || data.length !== clean.length) return false;
  return data.every((row: any) => matches(row.student_username, session));
}

async function intentoBelongsTo(intentoId: unknown, session: SessionUser) {
  const { data, error } = await getAdmin()
    .from('intentos_examen')
    .select('estudiante_id')
    .eq('id', String(intentoId))
    .maybeSingle();
  if (error || !data) return false;
  return matches(data.estudiante_id, session);
}

function deny(message: string): never {
  const error = new Error(message);
  (error as any).status = 403;
  throw error;
}

export function stripSecrets(table: string, result: any) {
  const clean = (row: any) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    if (table === 'users' && 'password' in row) {
      const copy = { ...row };
      delete copy.password;
      return copy;
    }
    return row;
  };
  if (Array.isArray(result?.data)) result.data = result.data.map(clean);
  else if (result?.data) result.data = clean(result.data);
  return result;
}

export async function authorizeTable(session: SessionUser, query: TableQuery) {
  const table = query.table;
  const action = query.action;

  if (table === 'users') {
    if (String(query.returning || '').includes('password')) {
      deny('La contraseña no sale del servidor.');
    }
    if (action === 'delete') {
      if (!isAdmin(session)) deny('Solo un administrador puede eliminar usuarios.');
      return;
    }
    if (action === 'insert') {
      for (const row of rowsOf(query.values)) {
        if (!isAdmin(session)) {
          if (!matches(row.username, session)) deny('No puedes crear otra cuenta.');
          row.role = 'STUDENT';
        }
        if (row.role === 'ADMIN' && !isAdmin(session)) row.role = 'STUDENT';
        row.balance = isAdmin(session) ? Number(row.balance || 0) : 0;
        if (!row.password) {
          row.password = await hashPassword(crypto.randomBytes(24).toString('hex'));
        } else if (!isHashedPassword(String(row.password))) {
          row.password = await hashPassword(String(row.password));
        }
      }
      return;
    }
    if (action === 'update' || action === 'upsert') {
      if (!isAdmin(session) && !filterMatchesSelf(query, session)) {
        deny('No puedes modificar otra cuenta.');
      }
      for (const row of rowsOf(query.values)) {
        delete row.balance;
        if (!isAdmin(session)) delete row.role;
        if (row.password && !isHashedPassword(String(row.password))) {
          row.password = await hashPassword(String(row.password));
        }
      }
      return;
    }
    if (isAdmin(session)) return;
    const cols = String(query.returning || '*');
    const publicRead = cols !== '*' && !cols.includes('email') && !cols.includes('password') && !cols.includes('current_session_id');
    if (publicRead) return;
    if (!filterMatchesSelf(query, session)) deny('No puedes leer esa cuenta.');
    return;
  }

  if (table === 'transactions') {
    if (action !== 'select') deny('Los movimientos solo se registran por las transferencias.');
    if (!isAdmin(session)) {
      const me = [session.id, session.username].filter(Boolean).map((value) => `to_account.eq."${value}",from_account.eq."${value}"`);
      query.filters = [{ op: 'or', value: me.join(',') }];
    }
    return;
  }

  if (table === 'student_lessons') {
    if ((action === 'update' || action === 'upsert') && !isAdmin(session)) {
      for (const row of rowsOf(query.values)) {
        if (row.bonus_credits == null) continue;
        const bonus = Math.floor(Number(row.bonus_credits));
        const grade = Number(row.grade);
        const approved = row.completed === true || row.lesson_status === 'Aprobada' || row.lesson_status === 'Completada' || grade >= 6;
        if (!approved || !Number.isFinite(bonus) || bonus <= 0) delete row.bonus_credits;
        else row.bonus_credits = Math.min(10, bonus);
      }
    }
    if (action === 'select' && query.returning === 'questions') return;
    if (isAdmin(session)) return;
    const owner = ownerFilter(query, 'student_username');
    if (owner) {
      if (!matches(owner.value, session)) deny('No puedes ver las lecciones de otro estudiante.');
      return;
    }
    if (action === 'insert') {
      const rows = rowsOf(query.values);
      if (rows.length === 0 || rows.some((row) => !matches(row.student_username, session))) {
        deny('No puedes asignar lecciones a otra cuenta.');
      }
      return;
    }
    const idFilter = (query.filters || []).find((filter) => filter.column === 'id' && (filter.op === 'eq' || filter.op === 'in'));
    const ids = idFilter ? (idFilter.op === 'in' ? idFilter.value : [idFilter.value]) : [];
    if (!(await lessonIdsBelongTo(ids, session))) deny('Esa lección no es tuya.');
    return;
  }

  if (OWN_ROWS.has(table)) {
    if (isAdmin(session)) return;
    const ownerFilters = (query.filters || []).filter((filter) => filter.column === 'estudiante_id');
    if (ownerFilters.length > 0) {
      const allowed = ownerFilters.every((filter) => {
        if (filter.op === 'eq' || filter.op === 'ilike') return matches(filter.value, session);
        if (filter.op === 'in' && Array.isArray(filter.value)) return filter.value.every((value) => matches(value, session));
        return false;
      });
      if (!allowed) deny('No puedes acceder a datos de otro estudiante.');
      return;
    }
    if (action === 'insert' || action === 'upsert') {
      const rows = rowsOf(query.values);
      if (rows.length === 0 || rows.some((row) => !matches(row.estudiante_id, session))) {
        deny('No puedes escribir datos de otro estudiante.');
      }
      return;
    }
    const idFilter = (query.filters || []).find((filter) => filter.column === 'id' && filter.op === 'eq');
    if (idFilter) {
      const { data } = await getAdmin().from(table).select('estudiante_id').eq('id', String(idFilter.value)).maybeSingle();
      if (data && matches((data as any).estudiante_id, session)) return;
    }
    deny('Falta el filtro del estudiante.');
  }

  if (table === 'respuestas_estudiante') {
    if (isAdmin(session)) return;
    if (action === 'insert') {
      const rows = rowsOf(query.values);
      for (const row of rows) {
        if (!(await intentoBelongsTo(row.intento_id, session))) deny('Ese examen no es tuyo.');
      }
      return;
    }
    const intentoFilter = (query.filters || []).find((filter) => filter.column === 'intento_id');
    if (intentoFilter?.op === 'eq' && await intentoBelongsTo(intentoFilter.value, session)) return;
    if (intentoFilter?.op === 'in' && Array.isArray(intentoFilter.value)) {
      for (const id of intentoFilter.value) {
        if (!(await intentoBelongsTo(id, session))) deny('Ese examen no es tuyo.');
      }
      return;
    }
    const idFilter = (query.filters || []).find((filter) => filter.column === 'id' && filter.op === 'eq');
    if (idFilter && action !== 'select') {
      const { data } = await getAdmin().from('respuestas_estudiante').select('intento_id').eq('id', String(idFilter.value)).maybeSingle();
      if (data && await intentoBelongsTo(data.intento_id, session)) return;
    }
    deny('No puedes ver respuestas de otro estudiante.');
  }

  if (table === 'subjects') {
    if (!isAdmin(session)) deny('Solo un administrador puede usar la guía de materias.');
    return;
  }

  if (CATALOG_READ.has(table)) {
    if (action === 'select') return;
    if (STUDENT_INSERT.has(table) && (action === 'insert' || action === 'upsert')) return;
    if (!isAdmin(session)) deny('Solo un administrador puede modificar el catálogo.');
    return;
  }

  deny('Tabla no disponible.');
}

export async function authorizeRpc(session: SessionUser, fn: string, args: Record<string, any>) {
  if (!RPC_ALLOW.has(fn)) deny('Esa función no está disponible.');

  const amount = Number(args.p_monto ?? args.p_monto_total);
  if (!Number.isFinite(amount) || amount <= 0) deny('El monto de la transferencia no es válido.');

  if (fn === 'transferencia_manual_admin') {
    if (!isAdmin(session)) deny('Solo un administrador puede hacer ese movimiento.');
    return;
  }

  if (fn === 'transferencia_estudiante') {
    if (!isAdmin(session) && !matches(args.p_from_id, session)) {
      deny('Solo puedes transferir desde tu cuenta.');
    }
    return;
  }

  if (!isAdmin(session) && !matches(args.p_estudiante_id, session) && !matches(args.p_username, session)) {
    deny('Solo puedes transferir tus propios créditos.');
  }

  const lessonIds = Array.isArray(args.p_lecciones_ids) ? args.p_lecciones_ids : [];
  if (lessonIds.length === 0) deny('No hay lecciones seleccionadas.');
  const { data, error } = await getAdmin()
    .from('student_lessons')
    .select('id, student_username, lesson_status, grade, credits_transfered')
    .in('id', lessonIds.map((id: unknown) => String(id)));
  if (error) deny(error.message);
  if (!data || data.length !== lessonIds.length) deny('Hay lecciones que no existen.');
  for (const row of data) {
    if (!isAdmin(session) && !matches(row.student_username, session)) {
      deny('No puedes transferir lecciones de otra cuenta.');
    }
    const approved = row.lesson_status === 'Aprobada' || row.lesson_status === 'Completada' || Number(row.grade) >= 6;
    if (!approved || row.credits_transfered) deny('Esas lecciones no están listas para transferir.');
  }
}
