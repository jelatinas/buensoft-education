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

function catalogClassId(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return /^[0-9]+$/.test(text) ? text : null;
}

function quoteOrValue(value: unknown): string {
  const text = String(value ?? '');
  if (/[,.():"]/.test(text)) return `"${text.replace(/"/g, '')}"`;
  return text;
}

function historyHasContent(value: unknown): boolean {
  if (value == null) return false;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const trimmed = text.trim();
  return trimmed !== '' && trimmed !== '[]' && trimmed !== 'null';
}

function parseChatMessages(value: unknown): any[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[]' || trimmed === 'null') return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isTruthyCompleted(value: unknown): boolean {
  return value === true || value === 1 || String(value ?? '').trim().toLowerCase() === 'true';
}

function isApprovalStatus(value: unknown): boolean {
  const status = String(value ?? '').trim().toLowerCase();
  return status === 'aprobada' || status === 'completada';
}

function countUserTurns(value: unknown): number {
  const messages = parseChatMessages(value);
  if (messages.length === 0) return 0;
  return messages.filter((msg) => {
    if (!msg || typeof msg !== 'object') return false;
    const role = String(msg.role || '').toLowerCase();
    if (role !== 'user') return false;
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    const text = parts.map((p: any) => String(p?.text || '')).join(' ').trim();
    return text.length > 0;
  }).length;
}

function historyHasCompletedTopics(value: unknown, requiredTopics: number): boolean {
  return countUserTurns(value) >= requiredTopics;
}

async function resolveCatalogClassIdsForLesson(lesson: { topic?: string; subject?: string }): Promise<{ candidates: string[]; error?: string }> {
  const topic = lesson.topic || 'Lección 0';
  const match = topic.match(/(?:Lecci[oó]n|Lesson)\s+(\d+)/i);
  const lessonNumber = match ? match[1] : topic;
  // class_chat_history.class_id es bigint. El id de student_lessons es UUID
  // y meterlo en el filtro invalida toda la consulta.
  const candidates: string[] = [];

  if (lesson.subject) {
    const { data: courses, error: courseError } = await getAdmin()
      .from('courses')
      .select('id')
      .ilike('nombre', lesson.subject)
      .limit(1);
    if (courseError) {
      return { candidates: [], error: `No se pudo ubicar el curso de la lección "${topic}": ${courseError.message}` };
    }
    const courseId = courses?.[0]?.id;
    if (courseId) {
      const { data: classes, error: classError } = await getAdmin()
        .from('classes')
        .select('id')
        .eq('course_id', courseId)
        .ilike('titulo', String(lessonNumber))
        .limit(1);
      if (classError) {
        return { candidates: [], error: `No se pudo ubicar la clase "${topic}": ${classError.message}` };
      }
      const classId = catalogClassId(classes?.[0]?.id);
      if (classId) {
        candidates.push(classId);
      } else if (lessonNumber !== topic) {
        const { data: byTitle, error: titleError } = await getAdmin()
          .from('classes')
          .select('id')
          .eq('course_id', courseId)
          .ilike('titulo', topic)
          .limit(1);
        if (titleError) {
          return { candidates: [], error: `No se pudo ubicar la clase "${topic}": ${titleError.message}` };
        }
        const titleId = catalogClassId(byTitle?.[0]?.id);
        if (titleId) candidates.push(titleId);
      }
    }
  }

  return { candidates };
}

async function getMaxChatUserTurnsForLessons(lessonIds: unknown[], session: SessionUser): Promise<number> {
  const clean = (lessonIds || []).map((id) => String(id)).filter(Boolean);
  if (clean.length === 0) return 0;

  const { data: lessons, error } = await getAdmin()
    .from('student_lessons')
    .select('id, student_username, topic, subject')
    .in('id', clean);
  if (error || !lessons || lessons.length === 0) return 0;

  const studentIdents = Array.from(new Set([
    ...identities(session),
    session.id, session.username, session.email
  ].filter(Boolean).map((v) => String(v))));

  let minTurnsAcrossLessons = Infinity;
  for (const l of lessons) {
    const resolved = await resolveCatalogClassIdsForLesson(l);
    if (resolved.error || resolved.candidates.length === 0) {
      minTurnsAcrossLessons = 0;
      continue;
    }
    const allStudentIdents = Array.from(new Set([
      ...studentIdents,
      l.student_username ? String(l.student_username) : null
    ].filter(Boolean) as string[]));
    const orStudentFilter = allStudentIdents.map((id) => `estudiante_id.ilike.${quoteOrValue(id)}`).join(',');
    const { data: chats, error: chatError } = await getAdmin()
      .from('class_chat_history')
      .select('chat_history')
      .or(orStudentFilter)
      .in('class_id', resolved.candidates)
      .limit(5);
    if (chatError || !Array.isArray(chats) || chats.length === 0) {
      minTurnsAcrossLessons = 0;
      continue;
    }
    const bestTurns = Math.max(0, ...chats.map((row: any) => countUserTurns(row.chat_history)));
    minTurnsAcrossLessons = Math.min(minTurnsAcrossLessons, bestTurns);
  }
  return Number.isFinite(minTurnsAcrossLessons) ? minTurnsAcrossLessons : 0;
}

async function verifyLessonsHaveAuditProof(lessonIds: unknown[], session: SessionUser): Promise<{ valid: boolean; reason?: string; maxGradesByLessonId?: Map<string, number> }> {
  const clean = (lessonIds || []).map((id) => String(id)).filter(Boolean);
  if (clean.length === 0) return { valid: false, reason: 'No hay lecciones seleccionadas.' };

  const { data: lessons, error } = await getAdmin()
    .from('student_lessons')
    .select('id, student_username, topic, subject, valid_interactions_count')
    .in('id', clean);

  if (error || !lessons || lessons.length !== clean.length) {
    return { valid: false, reason: 'No se pudieron verificar las lecciones solicitadas.' };
  }

  const studentIdents = Array.from(new Set([
    ...identities(session),
    session.id, session.username, session.email
  ].filter(Boolean).map((v) => String(v))));

  const maxGradesByLessonId = new Map<string, number>();

  for (const l of lessons) {
    const topic = l.topic || 'Lección 0';
    const resolved = await resolveCatalogClassIdsForLesson(l);
    if (resolved.error) {
      return { valid: false, reason: resolved.error };
    }
    const candidates = resolved.candidates;

    const allStudentIdents = Array.from(new Set([
      ...studentIdents,
      l.student_username ? String(l.student_username) : null
    ].filter(Boolean) as string[]));

    if (candidates.length === 0) {
      return { valid: false, reason: `La lección "${topic}" no está ligada a una clase del catálogo.` };
    }

    const { count: topicCount, error: topicError } = await getAdmin()
      .from('topics')
      .select('id', { count: 'exact', head: true })
      .in('class_id', candidates);

    if (topicError) {
      return { valid: false, reason: `No se pudieron verificar los temas de la clase "${topic}": ${topicError.message}` };
    }

    const requiredTopics = topicCount != null && topicCount > 0 ? topicCount : 10;
    const completedTopics = Number(l.valid_interactions_count || 0);
    if (completedTopics < requiredTopics) {
      return { valid: false, reason: `La lección "${topic}" solo tiene ${completedTopics} de ${requiredTopics} temas completados.` };
    }

    const orStudentFilter = allStudentIdents.map((id) => `estudiante_id.ilike.${quoteOrValue(id)}`).join(',');
    const { data: chats, error: chatError } = await getAdmin()
      .from('class_chat_history')
      .select('id, chat_history')
      .or(orStudentFilter)
      .in('class_id', candidates)
      .limit(5);

    if (chatError) {
      return { valid: false, reason: `No se pudo leer el historial de la clase "${topic}": ${chatError.message}` };
    }

    const hasChat = Array.isArray(chats) && chats.some((row: any) =>
      historyHasContent(row.chat_history) && historyHasCompletedTopics(row.chat_history, requiredTopics)
    );
    if (!hasChat) {
      return { valid: false, reason: `La lección "${l.topic || 'Lección'}" no tiene historial de clase con los ${requiredTopics} temas completados en el aula virtual.` };
    }

    const { data: intentos, error: intentoError } = await getAdmin()
      .from('intentos_examen')
      .select('id, calificacion')
      .or(orStudentFilter)
      .in('class_id', candidates)
      .gte('calificacion', 6)
      .order('calificacion', { ascending: false })
      .limit(10);

    if (intentoError) {
      return { valid: false, reason: `No se pudo leer el examen de la lección "${topic}": ${intentoError.message}` };
    }

    if (!intentos || intentos.length === 0) {
      return { valid: false, reason: `La lección "${l.topic || 'Lección'}" no tiene un examen aprobado registrado.` };
    }

    let bestVerifiedGrade = 0;
    for (const intento of intentos) {
      const { count: respCount, error: respError } = await getAdmin()
        .from('respuestas_estudiante')
        .select('id', { count: 'exact', head: true })
        .eq('intento_id', String(intento.id));
      if (respError) {
        return { valid: false, reason: `No se pudieron leer las respuestas del examen: ${respError.message}` };
      }
      if (respCount != null && respCount >= 4) {
        bestVerifiedGrade = Math.max(bestVerifiedGrade, Number(intento.calificacion || 0));
      }
    }

    if (bestVerifiedGrade < 6) {
      return { valid: false, reason: `El examen de la lección "${l.topic || 'Lección'}" no tiene preguntas ni respuestas suficientes registradas.` };
    }

    maxGradesByLessonId.set(String(l.id), bestVerifiedGrade);
  }

  return { valid: true, maxGradesByLessonId };
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
        delete row.credits_transfered;
        if (row.bonus_credits == null) continue;
        const bonus = Math.floor(Number(row.bonus_credits));
        const grade = Number(row.grade);
        const approved = isTruthyCompleted(row.completed) || isApprovalStatus(row.lesson_status) || grade >= 6;
        if (!approved || !Number.isFinite(bonus) || bonus <= 0) delete row.bonus_credits;
        else row.bonus_credits = Math.min(10, bonus);
      }
    }
    if (action === 'select' && query.returning === 'questions') return;
    if (isAdmin(session)) return;

    if (action === 'delete') {
      deny('Solo un administrador puede eliminar lecciones.');
    }

    if (action === 'insert') {
      const rows = rowsOf(query.values);
      if (rows.length === 0 || rows.some((row) => !matches(row.student_username, session))) {
        deny('No puedes asignar lecciones a otra cuenta.');
      }
      for (const row of rows) {
        row.completed = false;
        row.lesson_status = 'Pendiente';
        row.grade = null;
        row.bonus_credits = 0;
        row.valid_interactions_count = 0;
        row.credits_transfered = false;
        delete row.date_completed;
      }
      return;
    }

    const owner = ownerFilter(query, 'student_username');
    const idFilter = (query.filters || []).find((filter) => filter.column === 'id' && (filter.op === 'eq' || filter.op === 'in'));
    const ids = idFilter ? (idFilter.op === 'in' ? idFilter.value : [idFilter.value]) : [];

    if (action === 'select') {
      if (owner) {
        if (!matches(owner.value, session)) deny('No puedes ver las lecciones de otro estudiante.');
        return;
      }
      if (!(await lessonIdsBelongTo(ids, session))) deny('Esa lección no es tuya.');
      return;
    }

    if (action === 'update' || action === 'upsert') {
      const rows = rowsOf(query.values);
      const isAttemptingApproval = rows.some((row) =>
        isTruthyCompleted(row.completed) ||
        isApprovalStatus(row.lesson_status) ||
        (row.grade != null && Number(row.grade) >= 6) ||
        (row.bonus_credits != null && Number(row.bonus_credits) > 0)
      );

      if (isAttemptingApproval) {
        if (ids.length === 0 || !(await lessonIdsBelongTo(ids, session))) {
          deny('No se puede aprobar la lección sin identificarla correctamente.');
        }
        const auditCheck = await verifyLessonsHaveAuditProof(ids, session);
        if (!auditCheck.valid) {
          deny(auditCheck.reason || 'No se puede aprobar la lección sin historial de clase con los 10 temas completados y examen verificado.');
        }
        const verifiedGrades = Array.from(auditCheck.maxGradesByLessonId?.values() || []);
        const maxAllowedGrade = verifiedGrades.length > 0 ? Math.min(...verifiedGrades) : 0;
        for (const row of rows) {
          if (row.grade != null && Number(row.grade) > maxAllowedGrade) {
            deny('La calificación solicitada excede la calificación verificada en el examen.');
          }
        }
        return;
      }

      const wantsTopicsProgress = rows.some((row) =>
        row.valid_interactions_count != null && Number(row.valid_interactions_count) > 0
      );
      if (wantsTopicsProgress) {
        if (ids.length === 0 || !(await lessonIdsBelongTo(ids, session))) {
          deny('No se puede registrar avance de temas sin identificar tu lección.');
        }
        const maxVerifiedTurns = await getMaxChatUserTurnsForLessons(ids, session);
        for (const row of rows) {
          if (row.valid_interactions_count != null) {
            const requested = Math.max(0, Math.floor(Number(row.valid_interactions_count) || 0));
            row.valid_interactions_count = Math.min(requested, maxVerifiedTurns);
          }
        }
        return;
      }

      if (owner) {
        if (!matches(owner.value, session)) deny('No puedes modificar las lecciones de otro estudiante.');
        return;
      }
      if (!(await lessonIdsBelongTo(ids, session))) deny('Esa lección no es tuya.');
      return;
    }

    deny('Acción no permitida en lecciones.');
  }

  if (OWN_ROWS.has(table)) {
    if (isAdmin(session)) return;
    if (action === 'delete') deny('Solo un administrador puede eliminar historial o exámenes.');
    if (table === 'class_chat_history' && (action === 'update' || action === 'upsert')) {
      for (const row of rowsOf(query.values)) {
        if ('chat_history' in row && !historyHasContent(row.chat_history)) {
          deny('No puedes borrar el historial de la clase.');
        }
      }
    }
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
    if (action === 'delete') deny('Solo un administrador puede eliminar respuestas de examen.');
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
    .select('id, student_username, lesson_status, grade, bonus_credits, credits_transfered')
    .in('id', lessonIds.map((id: unknown) => String(id)));
  if (error) deny(error.message);
  if (!data || data.length !== lessonIds.length) deny('Hay lecciones que no existen.');
  let maxAllowedAmount = 0;
  for (const row of data) {
    if (!isAdmin(session) && !matches(row.student_username, session)) {
      deny('No puedes transferir lecciones de otra cuenta.');
    }
    const approved = isApprovalStatus(row.lesson_status) || Number(row.grade) >= 6;
    if (!approved || row.credits_transfered) deny('Esas lecciones no están listas para transferir.');
    maxAllowedAmount += Math.max(0, Number(row.grade || 0)) + Math.max(0, Math.min(10, Number(row.bonus_credits || 0)));
  }

  if (!isAdmin(session)) {
    if (amount > maxAllowedAmount) {
      deny('El monto excede los créditos acreditados de las lecciones seleccionadas.');
    }
    const auditCheck = await verifyLessonsHaveAuditProof(lessonIds, session);
    if (!auditCheck.valid) {
      deny(auditCheck.reason || 'No se pueden transferir créditos de lecciones sin historial de clase o examen verificado.');
    }
  }
}
