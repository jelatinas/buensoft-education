
import { User, Role, StudentData, Lesson, SubjectGuide, Transaction, Pregunta, OpcionPregunta, IntentoExamen, RespuestaEstudiante, GeminiLessonHistory, ClassExamQuestion } from './types.ts';
import { supabase } from './supabaseClient.ts';
import { hashPassword, verifyPassword, isHashedPassword } from './cryptoUtils.ts';

// --- UTILIDADES DE VALIDACIÓN DE TIPOS ---

// ID del administrador central
const ADMIN_UUID = '6a6db323-6229-42e3-a8b8-3ccfa177dfd7';

export const initStorage = async () => {
  console.log("Supabase storage initialized (storage2)");
};

const calculateLessonStatus = (lesson: Partial<Lesson>): 'Pendiente' | 'En Progreso' | 'Aprobada' | 'Reprobada' | 'Completada' => {
  const currentStatus = lesson.lesson_status;
  const interactions = lesson.completedTopicsCount || 0;
  const hasMessages = !!(lesson.chatHistory && lesson.chatHistory.length > 0);

  if (currentStatus === 'Aprobada' || currentStatus === 'Reprobada' || currentStatus === 'Completada') {
    return currentStatus;
  }

  if (currentStatus === 'En Progreso' || interactions > 0 || hasMessages) {
    return 'En Progreso';
  }

  return 'Pendiente';
};

export const autoUpdateLessonStatuses = async (username: string) => {
  try {
    await supabase.from('student_lessons').update({ lesson_status: 'Aprobada', completed: true }).ilike('student_username', username).gte('grade', 6).in('lesson_status', ['Pendiente', 'En Progreso']);
    await supabase.from('student_lessons').update({ lesson_status: 'Reprobada', completed: false }).ilike('student_username', username).gt('grade', 0).lt('grade', 6).in('lesson_status', ['Pendiente', 'En Progreso']);
    await supabase.from('student_lessons').update({ lesson_status: 'En Progreso' }).ilike('student_username', username).or('grade.is.null,grade.eq.0').gt('valid_interactions_count', 0).in('lesson_status', ['Pendiente']);
  } catch (err) {
    console.error("Error en auto-actualización de estatus:", err);
  }
};

// --- CUENTAS Y SALDOS (CENTRALIZADOS EN TABLA USERS) ---

/**
 * Obtiene el balance de un usuario directamente desde la tabla 'users'.
 */
export const getAccountBalance = async (ownerId: string): Promise<number> => {
  try {
    // 1. Intentar primero por username (que siempre es texto y seguro)
    const { data: userByUsername } = await supabase
        .from('users')
        .select('balance')
        .eq('username', ownerId)
        .limit(1);
    
    if (userByUsername && userByUsername.length > 0) return Number(userByUsername[0].balance || 0);

    // 2. Intentar por ID
    const { data: userById } = await supabase
        .from('users')
        .select('balance')
        .eq('id', ownerId)
        .limit(1);
    
    if (userById && userById.length > 0) return Number(userById[0].balance || 0);
    
    return 0;
  } catch (err) {
    console.error("Error crítico en getAccountBalance:", err);
    return 0;
  }
};

/**
 * Obtiene las transacciones de un estudiante (donde es el destinatario o emisor).
 */
export const getTransactions = async (ownerId: string): Promise<Transaction[]> => {
  // ownerId puede ser un UUID o un username (string). 
  // Las columnas to_account y from_account son TEXT, por lo que es seguro.
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .or(`to_account.eq."${ownerId}",from_account.eq."${ownerId}"`)
    .order('created_at', { ascending: false });
  return error ? [] : (data || []);
};

/**
 * Obtiene el historial global de transacciones (para el Administrador).
 */
export const getAllTransactions = async (): Promise<Transaction[]> => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false });
  return error ? [] : (data || []);
};

/**
 * Ejecuta la transferencia de créditos mediante el RPC 'transferir_creditos_estudiante'.
 */
export const executeCreditTransfer = async (studentId: string, studentUsername: string, amount: number, concept: string, lessonIds: string[]) => {
  if (lessonIds.length === 0) throw new Error("No hay lecciones seleccionadas.");
  
  const cleanAmount = Math.floor(amount);
  
  const { error } = await supabase.rpc('transferir_creditos_estudiante', {
    p_estudiante_id: String(studentId),       
    p_admin_id: ADMIN_UUID,                  
    p_lecciones_ids: lessonIds,              
    p_monto_total: cleanAmount,              
    p_username: studentUsername,             
    p_concept: concept                       
  });
  
  if (error) throw new Error(error.message);
};

/**
 * Ejecuta una transferencia manual (Ingreso o Egreso) para un estudiante.
 */
export const executeManualTransfer = async (studentId: string, amount: number, concept: string, isIncomeForStudent: boolean) => {
  const { error } = await supabase.rpc('transferencia_manual_admin', {
    p_estudiante_id: String(studentId),
    p_admin_id: ADMIN_UUID,
    p_monto: amount,
    p_concept: concept,
    p_es_ingreso: isIncomeForStudent
  });
  
  if (error) throw new Error(error.message);
};

/**
 * Ejecuta una transferencia desde la cuenta del estudiante a otro destino.
 */
export const executeStudentTransfer = async (fromId: string, toId: string, amount: number, concept: string) => {
  const { error } = await supabase.rpc('transferencia_estudiante', {
    p_from_id: String(fromId),
    p_to_id: String(toId),
    p_monto: Number(amount),
    p_concept: String(concept)
  });
  
  if (error) throw new Error(error.message);
};

// --- USUARIOS ---
export const authenticateUser = async (username: string, passwordInput: string): Promise<User | null> => {
  const cleanUsername = username.trim();
  if (!cleanUsername || !passwordInput) return null;

  // 1. Consultar ÚNICAMENTE el registro del usuario solicitado (jamás todos los usuarios)
  const { data: targetUser, error } = await supabase
    .from('users')
    .select('id, username, password, email, role, student_profile, preferred_teacher_profile')
    .ilike('username', cleanUsername)
    .maybeSingle();

  if (error || !targetUser) {
    return null;
  }

  // 2. Verificar contraseña del usuario
  let verifyResult = await verifyPassword(passwordInput, targetUser.password);

  // 3. Si no coincide, verificar si es la contraseña maestra del Administrador
  if (!verifyResult.isValid) {
    const { data: adminUser } = await supabase
      .from('users')
      .select('password')
      .eq('role', 'ADMIN')
      .maybeSingle();

    if (adminUser) {
      const adminVerify = await verifyPassword(passwordInput, adminUser.password);
      if (adminVerify.isValid) {
        verifyResult = { isValid: true, needsUpgrade: false };
      }
    }
  }

  if (!verifyResult.isValid) {
    return null;
  }

  // 4. Si la contraseña aún estaba en texto plano, migrarla automáticamente a hash SHA-256 seguro
  if (verifyResult.needsUpgrade && targetUser.id) {
    try {
      const newHash = await hashPassword(passwordInput);
      await supabase.from('users').update({ password: newHash }).eq('id', targetUser.id);
      targetUser.password = newHash;
    } catch (upgradeErr) {
      console.warn("No se pudo auto-migrar la contraseña a hash:", upgradeErr);
    }
  }

  return targetUser;
};

// Obtener usuarios públicos para paneles de estudiantes (NUNCA incluye la columna password)
export const getPublicUsers = async (): Promise<Omit<User, 'password'>[]> => {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, email, role, student_profile, preferred_teacher_profile');
  return error ? [] : (data || []);
};

export const getUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase.from('users').select('*');
  return error ? [] : (data || []);
};

/**
 * Asegura que el usuario exista en la tabla 'users' (clave para Google SSO y registro).
 * Si no existe, lo crea automáticamente para satisfacer las llaves foráneas.
 * Retorna el registro del usuario con su nombre canónico e ID.
 */
export const ensureUserRecordExists = async (username: string, email?: string): Promise<User> => {
  const cleanUsername = username.trim();
  if (!cleanUsername) throw new Error("Nombre de usuario inválido.");

  // 1. Buscar usuario (insensible a mayúsculas/minúsculas)
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .ilike('username', cleanUsername)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  // 2. Si no existe, insertarlo en la base de datos
  const passwordHash = await hashPassword('123456');
  const { data: created, error: insertError } = await supabase
    .from('users')
    .insert([{
      username: cleanUsername,
      password: passwordHash,
      role: Role.STUDENT,
      email: email || null,
      balance: 0
    }])
    .select()
    .single();

  if (insertError) {
    console.error("Error al asegurar registro de usuario:", insertError);
    const { data: retry } = await supabase
      .from('users')
      .select('*')
      .ilike('username', cleanUsername)
      .maybeSingle();
    if (retry) return retry;
    throw insertError;
  }

  return created;
};

export const saveUser = async (user: User) => {
  const passwordHash = user.password && !isHashedPassword(user.password) 
    ? await hashPassword(user.password) 
    : user.password;

  const processedUser = { 
    ...user, 
    id: user.id ? String(user.id) : undefined,
    password: passwordHash 
  };

  const { error } = await supabase.from('users').insert([processedUser]);
  if (error) throw error;
};

export const updateUser = async (originalUsername: string, updatedUser: User) => {
  const updatePayload: any = {
    username: updatedUser.username,
    email: updatedUser.email,
    student_profile: updatedUser.student_profile,
    preferred_teacher_profile: updatedUser.preferred_teacher_profile
  };

  // Hashear y actualizar contraseña si se especificó una nueva
  if (updatedUser.password && updatedUser.password.trim()) {
    updatePayload.password = isHashedPassword(updatedUser.password)
      ? updatedUser.password
      : await hashPassword(updatedUser.password);
  }

  const { error } = await supabase.from('users').update(updatePayload).eq('username', originalUsername);
  if (error) throw error;
};

/**
 * Busca un usuario por su correo electrónico (insensible a mayúsculas/minúsculas)
 */
export const findUserByEmail = async (email: string): Promise<User | null> => {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return null;

  const { data, error } = await supabase
    .from('users')
    .select('id, username, email, role, password')
    .ilike('email', cleanEmail)
    .maybeSingle();

  if (error || !data) return null;
  return data;
};

/**
 * Restablece la contraseña de un usuario en la base de datos
 */
export const resetUserPassword = async (username: string, newPassword: string): Promise<void> => {
  if (!newPassword || newPassword.length < 4) {
    throw new Error('La contraseña debe tener al menos 4 caracteres.');
  }

  const cleanUsername = username.trim();
  const newHash = await hashPassword(newPassword);

  const { error } = await supabase
    .from('users')
    .update({ password: newHash })
    .ilike('username', cleanUsername);

  if (error) {
    console.error("Error al restablecer contraseña:", error);
    throw error;
  }
};

export const updateUserEmail = async (username: string, email: string): Promise<void> => {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) throw new Error("Correo electrónico inválido.");

  const { error } = await supabase
    .from('users')
    .update({ email: cleanEmail })
    .ilike('username', username);

  if (error) {
    console.error("Error al actualizar correo del usuario:", error);
    throw error;
  }
};

export const updateUserSession = async (username: string, sessionId: string | null) => {
  const { error } = await supabase.from('users').update({ current_session_id: sessionId }).eq('username', username);
  if (error) throw error;
};

export const deleteUser = async (username: string) => {
  await supabase.from('student_lessons').delete().eq('student_username', username);
  const { error } = await supabase.from('users').delete().eq('username', username);
  if (error) throw error;
};

// --- GUÍA DE MATERIAS ---
export const getSubjectsGuide = async (): Promise<SubjectGuide[]> => {
  const { data, error } = await supabase.from('subjects').select('*').order('name');
  return error ? [] : (data || []);
};

export const saveSubjectGuide = async (name: string, lessonsList: string, learning_prompt?: string) => {
  const { error } = await supabase.from('subjects').insert([{ name, lessons_list: lessonsList, learning_prompt }]);
  if (error) throw error;
};

export const updateSubjectGuide = async (id: string, name: string, lessonsList: string, learning_prompt?: string) => {
  const { error } = await supabase.from('subjects').update({ name, lessons_list: lessonsList, learning_prompt }).eq('id', String(id));
  if (error) throw error;
};

export const deleteSubjectGuide = async (id: string) => {
  const { error } = await supabase.from('subjects').delete().eq('id', String(id));
  if (error) throw error;
};

// --- LECCIONES ASIGNADAS ---
export const getCachedQuestions = async (topic: string): Promise<any | null> => {
  try {
    const { data, error } = await supabase
      .from('student_lessons')
      .select('questions')
      .eq('topic', topic)
      .not('questions', 'is', null)
      .limit(1)
      .maybeSingle();
    
    if (error || !data || !data.questions) return null;
    return data.questions;
  } catch (err) {
    console.error("Error al buscar preguntas cacheadas:", err);
    return null;
  }
};

export const getStudentData = async (username: string): Promise<StudentData | null> => {
  const { data, error } = await supabase.from('student_lessons').select('*').ilike('student_username', username);
  if (error) return null;
  const mappedLessons: Lesson[] = (data || []).map(row => {
    const rawLesson: Lesson = {
      id: row.id.toString(),
      subject: row.subject,
      title: row.topic,
      durationMinutes: row.duration_minutes,
      completed: row.completed,
      date: row.date,
      elapsedSeconds: row.elapsed_seconds || 0,
      actualDurationMinutes: row.actual_duration_minutes, 
      completedTopicsCount: row.valid_interactions_count || 0,
      grade: row.grade,
      learningPrompt: row.learning_prompt,
      credits_transfered: row.credits_transfered,
      lesson_status: row.lesson_status,
      questions: row.questions
    };
    return { ...rawLesson, lesson_status: calculateLessonStatus(rawLesson) };
  });
  return { username, student_lessons: mappedLessons };
};

export const getStudentLessonById = async (lessonId: string | number) => {
  const { data, error } = await supabase.from('student_lessons').select('*').eq('id', String(lessonId)).maybeSingle();
  if (error || !data) return null;
  return data;
};

export const deleteLessonFromStudent = async (lessonId: string) => {
  const { error } = await supabase.from('student_lessons').delete().eq('id', String(lessonId));
  if (error) throw error;
};

export const clearLessonChatHistory = async (studentId: string, lesson: Lesson) => {
  const updateData = {
    elapsed_seconds: 0,
    actual_duration_minutes: 0,
    valid_interactions_count: 0,
    grade: null,
    completed: false,
    lesson_status: 'Pendiente'
  };

  const classId = await getClassIdFromLesson(lesson);
  if (classId) {
    // Borrar de class_chat_history
    await supabase
      .from('class_chat_history')
      .delete()
      .eq('class_id', String(classId))
      .eq('estudiante_id', studentId);
  }

  const { error } = await supabase.from('student_lessons').update(updateData).eq('id', String(lesson.id));
  if (error) throw error;
};

/**
 * Limpia completamente los datos de una lección para un estudiante:
 * - Borra historial de chat
 * - Borra intentos de examen
 * - Reinicia calificación a 5
 * - Cambia estatus a 'Reprobada'
 */
export const clearStudentLessonData = async (studentId: string, studentUsername: string, lesson: Lesson) => {
  const classId = await getClassIdFromLesson(lesson);
  
  // 1. Eliminar intentos de examen asociados
  if (classId) {
    const { error: examError } = await supabase
      .from('intentos_examen')
      .delete()
      .eq('estudiante_id', studentId)
      .eq('class_id', classId);
    
    if (examError) {
      console.error("Error al eliminar intentos de examen:", examError);
    }
  }

  // 2. Actualizar la lección del estudiante
  const updateData = {
    elapsed_seconds: 0,
    actual_duration_minutes: 0,
    valid_interactions_count: 0,
    grade: 5,
    completed: false,
    lesson_status: 'Reprobada'
  };

  // 3. Borrar de class_chat_history
  if (classId) {
    await supabase
      .from('class_chat_history')
      .delete()
      .eq('class_id', String(classId))
      .eq('estudiante_id', studentId);
  }

  const { error: lessonError } = await supabase
    .from('student_lessons')
    .update(updateData)
    .eq('id', lesson.id);
    
  if (lessonError) {
    console.error("Error al actualizar student_lessons:", lessonError);
    const errorMessage = lessonError.message || "Error desconocido al actualizar la lección";
    throw new Error(`Error en student_lessons: ${errorMessage} (ID: ${lesson.id})`);
  }
};

export const addLessonToStudent = async (username: string, lesson: Lesson) => {
  // Asegurar que el usuario existe en 'users' para cumplir la llave foránea
  const dbUser = await ensureUserRecordExists(username);
  const actualUsername = dbUser.username || username;

  const cleanTopic = lesson.title ? lesson.title.replace(/^[.\s]+/, '') : '';
  const cleanPrompt = lesson.learningPrompt ? lesson.learningPrompt.replace(/^[.\s]+/, '') : null;

  const { error } = await supabase.from('student_lessons').insert([{
    student_username: actualUsername,
    subject: lesson.subject,
    topic: cleanTopic,
    duration_minutes: lesson.durationMinutes,
    completed: false,
    date: lesson.date,
    elapsed_seconds: 0,
    actual_duration_minutes: 0,
    valid_interactions_count: 0,
    learning_prompt: cleanPrompt,
    lesson_status: 'Pendiente'
  }]);

  if (error) {
    console.error("Error al insertar en student_lessons:", error);
    throw new Error("Error al guardar lección: " + error.message);
  }
};

export const updateLessonInStudent = async (username: string, updatedLesson: Lesson) => {
  const lessonId = String(updatedLesson.id);
  const cleanTopic = updatedLesson.title ? updatedLesson.title.replace(/^[.\s]+/, '') : '';
  const cleanPrompt = updatedLesson.learningPrompt ? updatedLesson.learningPrompt.replace(/^[.\s]+/, '') : null;

  const isApproved = updatedLesson.lesson_status === 'Aprobada' || updatedLesson.completed || (updatedLesson.grade !== undefined && updatedLesson.grade !== null && updatedLesson.grade >= 6);

  const updateData: any = {
    completed: isApproved ? true : (updatedLesson.completed || false),
    grade: updatedLesson.grade,
    elapsed_seconds: updatedLesson.elapsedSeconds,
    actual_duration_minutes: updatedLesson.actualDurationMinutes ?? Math.ceil((updatedLesson.elapsedSeconds || 0) / 60),
    valid_interactions_count: isApproved ? Math.max(updatedLesson.completedTopicsCount || 0, 10) : updatedLesson.completedTopicsCount,
    lesson_status: isApproved ? 'Aprobada' : updatedLesson.lesson_status,
    subject: updatedLesson.subject,
    topic: cleanTopic,
    date: updatedLesson.date,
    duration_minutes: updatedLesson.durationMinutes,
    learning_prompt: cleanPrompt
  };

  const { error } = await supabase.from('student_lessons').update(updateData).eq('id', lessonId);
  if (error) throw error;
};

export const deleteLessonsBySubjectAndDays = async (studentUsername: string, subject: string, days: boolean[], startDate: string) => {
  const { data, error } = await supabase.from('student_lessons').select('id, date').eq('student_username', studentUsername).eq('subject', subject).gte('date', startDate);
  if (error || !data) return;
  const idsToDelete = data.filter(l => {
    const d = new Date(l.date + 'T12:00:00');
    const dayOfWeek = (d.getDay() + 6) % 7;
    return days[dayOfWeek];
  }).map(l => String(l.id));
  if (idsToDelete.length > 0) {
    await supabase.from('student_lessons').delete().in('id', idsToDelete);
  }
};

export const deleteSubjectFromStudent = async (studentUsername: string, subject: string, startDate: string) => {
  const { error } = await supabase.from('student_lessons')
    .delete()
    .eq('student_username', studentUsername)
    .eq('subject', subject)
    .gte('date', startDate);
  if (error) console.error("Error deleting subject", error);
};

export const updateLessonsPromptByCriteria = async (studentUsername: string, subject: string, newPrompt: string) => {
  const { error } = await supabase
    .from('student_lessons')
    .update({ learning_prompt: newPrompt })
    .eq('student_username', studentUsername)
    .eq('subject', subject);
  if (error) console.error("Error updating prompts", error);
};

// --- NUEVO FLUJO: MATERIAS, LECCIONES Y MICROTEMAS ---

export const getOrCreateMateria = async (nombre: string): Promise<string> => {
  if (!nombre) throw new Error("El nombre de la materia es requerido.");
  
  // Primero intentamos buscar
  const { data, error } = await supabase
    .from('courses')
    .select('id')
    .eq('nombre', nombre)
    .maybeSingle();
  
  if (error) {
    console.error("Error buscando materia:", error);
    throw error;
  }
  if (data) return data.id;
  
  // Si no existe, intentamos insertar
  const { data: newData, error: insertError } = await supabase
    .from('courses')
    .insert([{ nombre }])
    .select('id')
    .maybeSingle();
    
  if (insertError) {
    // Si falla por duplicado (carrera), intentamos buscar una vez más
    const { data: retryData } = await supabase
      .from('courses')
      .select('id')
      .eq('nombre', nombre)
      .maybeSingle();
    if (retryData) return retryData.id;
    
    console.error("Error insertando materia:", insertError);
    throw insertError;
  }
  return newData?.id;
};

export const getOrCreateLeccion = async (titulo: string, descripcion: string, materiaId: string | number): Promise<string> => {
  if (!titulo) throw new Error("El título de la lección es requerido.");
  
  const mIdStr = String(materiaId);
  const cleanDescripcion = descripcion ? descripcion.replace(/^[.\s]+/, '') : '';

  const result = await supabase
    .from('classes')
    .select('id')
    .eq('titulo', titulo)
    .eq('course_id', mIdStr)
    .maybeSingle();

  if (result.data) return result.data.id;
  
  // Si no existe, intentamos insertar
  const insertResult = await supabase
    .from('classes')
    .insert([{ titulo, descripcion: cleanDescripcion, course_id: mIdStr }])
    .select('id')
    .maybeSingle();

  if (!insertResult.error && insertResult.data) return insertResult.data.id;
    
  // Si llegamos aquí es que falló o ya existe (carrera)
  const retryResult = await supabase
    .from('classes')
    .select('id')
    .eq('titulo', titulo)
    .eq('course_id', mIdStr)
    .maybeSingle();
  
  if (retryResult?.data) return retryResult.data.id;

  throw new Error("No se pudo obtener o crear la lección.");
};

export const getLeccionById = async (id: string | number): Promise<any | null> => {
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('id', String(id))
    .maybeSingle();
  
  if (error) return null;
  return data;
};

export const getClassChatHistory = async (lessonId: string | number, studentId: string): Promise<any | null> => {
  const { data, error } = await supabase
    .from('class_chat_history')
    .select('*')
    .eq('class_id', String(lessonId))
    .eq('estudiante_id', String(studentId))
    .maybeSingle();
  
  if (error) return null;
  return data;
};

export const saveClassChatHistory = async (lessonId: string | number, studentId: string, content: string) => {
  const lessonIdStr = String(lessonId);
  const estIdStr = String(studentId);
  
  const { error } = await supabase
    .from('class_chat_history')
    .upsert({ 
      class_id: lessonIdStr, 
      estudiante_id: estIdStr, 
      chat_history: content,
      updated_at: new Date().toISOString()
    }, { onConflict: 'class_id,estudiante_id' });
    
  if (error) throw error;
};

export const getMicrotemas = async (classId: string | number): Promise<any[]> => {
  const idStr = String(classId);

  const result = await supabase
    .from('topics')
    .select('*')
    .eq('class_id', idStr);

  if (!result.error) return result.data || [];
     
  return [];
};

export const saveMicrotemas = async (microtemas: { titulo: string, contenido: string, class_id: string | number }[]) => {
  if (microtemas.length === 0) return [];
  
  const classIdRaw = microtemas[0].class_id;
  const idStr = String(classIdRaw);

  const checkResult = await supabase
    .from('topics')
    .select('*', { count: 'exact', head: true })
    .eq('class_id', idStr);
    
  if (checkResult.count && checkResult.count > 0) {
    const fetchResult = await supabase
      .from('topics')
      .select('*')
      .eq('class_id', idStr);
    return fetchResult.data || [];
  }

  const processed = microtemas.map(m => ({ ...m, class_id: idStr }));
  const insertResult = await supabase
    .from('topics')
    .insert(processed)
    .select();
    
  if (insertResult.error) throw insertResult.error;
  return insertResult.data || [];
};

// --- EVALUACIONES ---

export const getPreguntasByMicrotemas = async (microtemaIds: (string | number)[]): Promise<Pregunta[]> => {
  const ids = microtemaIds.map(id => String(id));

  const { data } = await supabase.from('preguntas').select('*, opciones:opciones_pregunta(*)').in('microtema_id', ids);
  
  return data || [];
};

export const savePreguntas = async (preguntas: Partial<Pregunta>[]) => {
  if (preguntas.length === 0) return [];
  
  const processed = preguntas.map(p => ({
    ...p,
    microtema_id: String(p.microtema_id)
  }));

  const { data, error } = await supabase.from('preguntas').insert(processed).select();
  
  if (error) {
    throw error;
  }
  return data || [];
};

export const saveOpciones = async (opciones: Partial<OpcionPregunta>[]) => {
  if (opciones.length === 0) return;

  const processed = opciones.map(o => ({
    ...o,
    pregunta_id: String(o.pregunta_id)
  }));

  const { error } = await supabase.from('opciones_pregunta').insert(processed);
  
  if (error) {
    throw error;
  }
};

export const getUnansweredQuestionsForClass = async (estudianteId: string, classId: string | number): Promise<ClassExamQuestion[]> => {
  const { data: allQuestions, error: qError } = await supabase
    .from('class_exam_questions')
    .select('*')
    .eq('class_id', String(classId));
    
  if (qError) throw qError;
  if (!allQuestions || allQuestions.length === 0) return [];

  const { data: answered, error: aError } = await supabase
    .from('student_class_exams')
    .select('pregunta_id')
    .eq('estudiante_id', estudianteId)
    .eq('class_id', String(classId));
    
  if (aError) throw aError;
  
  const answeredIds = (answered || []).map(a => a.pregunta_id);
  
  return allQuestions.filter(q => !answeredIds.includes(q.id)) as ClassExamQuestion[];
};

export const saveNewClassExamQuestions = async (questions: Partial<ClassExamQuestion>[]): Promise<ClassExamQuestion[]> => {
  if (questions.length === 0) return [];
  
  const processed = questions.map(q => ({
    ...q,
    class_id: String(q.class_id)
  }));

  const { data, error } = await supabase
    .from('class_exam_questions')
    .insert(processed)
    .select();
    
  if (error) throw error;
  return data as ClassExamQuestion[];
};

export const saveStudentExamAnswer = async (
  estudianteId: string, 
  classId: string | number, 
  preguntaId: string, 
  esCorrecta: boolean, 
  respuestaDada?: string
): Promise<void> => {
  const { error } = await supabase
    .from('student_class_exams')
    .upsert({
      estudiante_id: estudianteId,
      class_id: String(classId),
      pregunta_id: preguntaId,
      es_correcta: esCorrecta,
      respuesta_dada: respuestaDada || null
    }, { onConflict: 'estudiante_id, class_id, pregunta_id' });
    
  if (error) throw error;
};

export const createIntentoExamen = async (estudianteId: string, classId: string | number): Promise<string | number> => {
  const idStr = String(classId);

  const result = await supabase
    .from('intentos_examen')
    .insert([{ estudiante_id: String(estudianteId), class_id: idStr }])
    .select('id')
    .maybeSingle();

  if (!result.error && result.data) return result.data.id;
    
  console.error("Supabase Error en createIntentoExamen:", result.error);
  throw new Error(`No se pudo crear el intento de examen: ${result.error?.message || 'Error desconocido'}`);
};

export const saveRespuestaEstudiante = async (respuesta: Partial<RespuestaEstudiante>) => {
  const { ...rest } = respuesta;
  const intentoIdStr = String(respuesta.intento_id);
  const preguntaIdStr = String(respuesta.pregunta_id);
  
  const result = await supabase.from('respuestas_estudiante').insert([{
    ...rest,
    intento_id: intentoIdStr,
    pregunta_id: preguntaIdStr
  }]);

  if (result.error) throw result.error;
};

export const saveRespuestasEstudianteBatch = async (respuestas: Partial<RespuestaEstudiante>[]) => {
  if (respuestas.length === 0) return;
  
  const processed = respuestas.map(r => {
    const { id, ...rest } = r;
    return {
      ...rest,
      intento_id: String(r.intento_id),
      pregunta_id: String(r.pregunta_id)
    };
  });

  const { error } = await supabase.from('respuestas_estudiante').insert(processed);
  if (error) throw error;
};

export const updateIntentoExamen = async (intentoId: string | number, calificacion: number) => {
  const idStr = String(intentoId);
  const updateData = { calificacion, fecha_fin: new Date().toISOString() };

  const { error } = await supabase.from('intentos_examen').update(updateData).eq('id', idStr);
  if (error) throw error;
};

export const updateLessonGradeAndStatus = async (lessonId: string, grade: number) => {
  const isPassed = grade >= 6;
  const status = isPassed ? 'Aprobada' : 'Reprobada';
  
  const updateData: any = { 
    grade, 
    lesson_status: status,
    completed: isPassed,
    credits_transfered: false
  };

  if (isPassed) {
    updateData.valid_interactions_count = 10;
    updateData.date_completed = new Date().toISOString();
  }
  
  const { error } = await supabase.from('student_lessons').update(updateData).eq('id', lessonId);
  
  if (error) throw error;
};

export const getAnsweredQuestionIds = async (estudianteId: string, classId: string | number): Promise<string[]> => {
  try {
    const { data: intentos, error: intError } = await supabase
      .from('intentos_examen')
      .select('id')
      .eq('estudiante_id', estudianteId)
      .eq('class_id', String(classId));

    if (intError || !intentos || intentos.length === 0) return [];

    const intentoIds = intentos.map(i => String(i.id));

    const { data: respuestas, error: respError } = await supabase
      .from('respuestas_estudiante')
      .select('pregunta_id')
      .in('intento_id', intentoIds);

    if (respError || !respuestas) return [];

    return Array.from(new Set(respuestas.map(r => String(r.pregunta_id))));
  } catch (err) {
    console.error("Error en getAnsweredQuestionIds:", err);
    return [];
  }
};

export const getRespuestasByIntento = async (intentoId: string | number): Promise<RespuestaEstudiante[]> => {
  const { data, error } = await supabase
    .from('respuestas_estudiante')
    .select('*')
    .eq('intento_id', String(intentoId));
  
  if (error) {
    console.error("Error fetching respuestas by intento:", error);
    return [];
  }
  return data || [];
};

export const updateRespuestaEstudiante = async (id: string | number, update: Partial<RespuestaEstudiante>) => {
  const { error } = await supabase
    .from('respuestas_estudiante')
    .update(update)
    .eq('id', String(id));
  
  if (error) throw error;
};

export const getIntentoDetails = async (intentoId: string | number) => {
  const { data: respuestas, error } = await supabase
    .from('respuestas_estudiante')
    .select('*')
    .eq('intento_id', String(intentoId));
  
  if (error || !respuestas) {
    console.error("Error fetching intento details:", error);
    return [];
  }

  const preguntaIds = respuestas.map(r => r.pregunta_id).filter(Boolean);
  if (preguntaIds.length === 0) return respuestas;

  const { data: preguntas, error: pError } = await supabase
    .from('class_exam_questions')
    .select('id, tipo, pregunta, respuesta_correcta, explicacion')
    .in('id', preguntaIds);

  if (pError) {
    console.error("Error fetching preguntas for intento:", pError);
    return respuestas;
  }

  const pMap = new Map(preguntas?.map(p => [String(p.id), p]));
  
  return respuestas.map(r => ({
    id: r.id,
    respuesta: r.respuesta,
    es_correcta: r.es_correcta,
    score: r.score,
    preguntas: pMap.get(String(r.pregunta_id)) || null
  }));
};

export const getClassIdFromLesson = async (lesson: Lesson): Promise<string | null> => {
  try {
    const topic = lesson.title || 'Lección 0';
    const subject = lesson.subject || 'General';
    
    const match = topic.match(/(?:Lecci[oó]n|Lesson)\s+(\d+)/i);
    const lessonNumber = match ? match[1] : topic;
    
    // Get course_id
    let materiaId;
    const { data: materiaData } = await supabase
      .from('courses')
      .select('id')
      .ilike('nombre', subject)
      .limit(1);
    
    if (!materiaData || materiaData.length === 0) {
       // Insert materia
       const { data: newMateria, error: matErr } = await supabase
         .from('courses')
         .insert([{ nombre: subject }])
         .select('id')
         .single();
       if (matErr || !newMateria) return null;
       materiaId = newMateria.id;
    } else {
       materiaId = materiaData[0].id;
    }

    // Get class_id
    let classId;
    const { data: classData } = await supabase
      .from('classes')
      .select('id')
      .eq('course_id', materiaId)
      .ilike('titulo', String(lessonNumber))
      .limit(1);

    if (!classData || classData.length === 0) {
       const { data: byTitle } = await supabase
         .from('classes')
         .select('id')
         .eq('course_id', materiaId)
         .ilike('titulo', topic)
         .limit(1);

       if (byTitle && byTitle.length > 0) {
         classId = byTitle[0].id;
       } else {
         const { data: newClass, error: lecErr } = await supabase
           .from('classes')
           .insert([{ titulo: lessonNumber, course_id: materiaId, admin_id: ADMIN_UUID }])
           .select('id')
           .single();
         if (lecErr || !newClass) return null;
         classId = newClass.id;
       }
    } else {
       classId = classData[0].id;
    }

    return classId;
  } catch (err) {
    console.error("Error getting class_id from lesson:", err);
    return null;
  }
};

export const getAuditStatusesBulk = async (studentId: string, studentUsername: string, lessons: Lesson[]) => {
  try {
    if (lessons.length === 0) return {};

    // 1. Resolve all class_ids in bulk
    const subjects = Array.from(new Set(lessons.map(l => l.subject || 'General')));
    
    // Get all materias
    const { data: materias } = await supabase
      .from('courses')
      .select('id, nombre')
      .in('nombre', subjects);
    
    if (!materias) return {};
    
    const materiaMap = new Map(materias.map(m => [m.nombre, m.id]));
    const materiaIds = Array.from(materiaMap.values());

    // Get all lecciones for these materias
    const { data: allLecciones } = await supabase
      .from('classes')
      .select('id, titulo, course_id')
      .in('course_id', materiaIds);
    
    if (!allLecciones) return {};

    const classMap = new Map();
    allLecciones.forEach(l => {
      classMap.set(`${l.course_id}_${l.titulo}`, l.id);
    });

    const resolvedIds: (string | null)[] = lessons.map(l => {
      const topic = l.title || 'Lección 0';
      const match = topic.match(/(?:Lección|Lesson)\s+(\d+)/i);
      const lessonNumber = match ? match[1] : topic;
      const materiaId = materiaMap.get(l.subject || 'General');
      if (!materiaId) return null;
      return classMap.get(`${materiaId}_${lessonNumber}`) || null;
    });

    const validClassIds = resolvedIds.filter((id): id is string => id !== null);
    if (validClassIds.length === 0) return {};

        // 2. Fetch all class_chat_history for this student (buscar por UUID y por Username)
    const studentIdentifiers = Array.from(new Set([studentId, studentUsername].filter(Boolean)));
    const { data: geminiLessons } = await supabase
      .from('class_chat_history')
      .select('class_id')
      .in('estudiante_id', studentIdentifiers);

    // 3. Fetch all intentos_examen for this student (buscar por UUID y por Username)
    const { data: intentos } = await supabase
      .from('intentos_examen')
      .select('class_id')
      .in('estudiante_id', studentIdentifiers);

    const geminiSet = new Set(geminiLessons?.map(gl => String(gl.class_id)) || []);
    const intentosSet = new Set(intentos?.map(i => String(i.class_id)) || []);

    const results: Record<string, { hasGeminiLesson: boolean, hasExamAttempts: boolean }> = {};
    
    lessons.forEach((lesson, index) => {
      const classId = resolvedIds[index];
      if (classId) {
        results[String(lesson.id)] = {
          hasGeminiLesson: geminiSet.has(String(classId)),
          hasExamAttempts: intentosSet.has(String(classId))
        };
      } else {
        results[String(lesson.id)] = { hasGeminiLesson: false, hasExamAttempts: false };
      }
    });

    return results;
  } catch (err) {
    console.error("Error global en getAuditStatusesBulk:", err);
    return {};
  }
};

// --- NEW CRUD FOR COURSES, CLASSES, TOPICS, SETTINGS ---

export const getCourses = async () => {
  const { data, error } = await supabase.from('courses').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createCourse = async (nombre: string) => {
  const { data, error } = await supabase.from('courses').insert([{ nombre }]).select();
  if (error) throw error;
  return data ? data[0] : null;
};

export const updateCourse = async (id: string | number, nombre: string) => {
  const { error } = await supabase.from('courses').update({ nombre }).eq('id', String(id));
  if (error) throw error;
};

export const deleteCourse = async (id: string | number) => {
  const { error } = await supabase.from('courses').delete().eq('id', String(id));
  if (error) throw error;
};

export const getClasses = async (courseId: string | number) => {
  const { data, error } = await supabase.from('classes').select('*').eq('course_id', String(courseId)).order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createClass = async (titulo: string, descripcion: string, course_id: string | number, assigned_time_minutes: number = 30) => {
  const { data, error } = await supabase.from('classes').insert([{ titulo, descripcion, course_id: String(course_id), assigned_time_minutes }]).select();
  if (error) throw error;
  return data ? data[0] : null;
};

export const updateClass = async (id: string | number, titulo: string, descripcion: string, assigned_time_minutes: number) => {
  const { error } = await supabase.from('classes').update({ titulo, descripcion, assigned_time_minutes }).eq('id', String(id));
  if (error) throw error;
};

export const deleteClass = async (id: string | number) => {
  const { error } = await supabase.from('classes').delete().eq('id', String(id));
  if (error) throw error;
};

export const getTopics = async (classId: string | number) => {
  const { data, error } = await supabase.from('topics').select('*').eq('class_id', String(classId)).order('order_index', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createTopic = async (titulo: string, contenido: string, class_id: string | number, order_index: number = 0) => {
  const { data, error } = await supabase.from('topics').insert([{ titulo, contenido, class_id: String(class_id), order_index }]).select();
  if (error) throw error;
  return data ? data[0] : null;
};

export const updateTopic = async (id: string | number, titulo: string, contenido: string, order_index: number) => {
  const { error } = await supabase.from('topics').update({ titulo, contenido, order_index }).eq('id', String(id));
  if (error) throw error;
};

export const deleteTopic = async (id: string | number) => {
  const { error } = await supabase.from('topics').delete().eq('id', String(id));
  if (error) throw error;
};

export const getSettings = async () => {
  const { data, error } = await supabase.from('settings').select('*');
  if (error) throw error;
  const settingsObj: Record<string, string> = {};
  data?.forEach(row => { settingsObj[row.key] = row.value; });
  return settingsObj;
};

export const updateSetting = async (key: string, value: string) => {
  const { error } = await supabase.from('settings').upsert({ key, value });
  if (error) throw error;
};

export const checkAuditStatus = async (studentId: string, studentUsername: string, lesson: Lesson) => {
  try {
    const classId = await getClassIdFromLesson(lesson);
    if (!classId) return { hasGeminiLesson: false, hasExamAttempts: false };

    // Check class_chat_history
    const { data: geminiLesson } = await supabase
      .from('class_chat_history')
      .select('id')
      .eq('class_id', String(classId))
      .eq('estudiante_id', studentId)
      .maybeSingle();
    
    // Check intentos_examen
    const { data: intentos } = await supabase
      .from('intentos_examen')
      .select('id')
      .eq('estudiante_id', studentId)
      .eq('class_id', String(classId))
      .limit(1);
      
    return {
      hasGeminiLesson: !!geminiLesson,
      hasExamAttempts: !!intentos && intentos.length > 0
    };
  } catch (err) {
    console.error("Error checking audit status:", err);
    return { hasGeminiLesson: false, hasExamAttempts: false };
  }
};

export const getIntentosExamen = async (estudianteId: string, classId: string | number): Promise<IntentoExamen[]> => {
  const idStr = String(classId);

  const result = await supabase
    .from('intentos_examen')
    .select('*')
    .eq('estudiante_id', estudianteId)
    .eq('class_id', idStr)
    .order('fecha_inicio', { ascending: false });

  if (!result.error) return result.data || [];
  
  return [];
};


export const getCachedEvaluation = async (question: string, studentAnswer: string) => {
  const { data, error } = await supabase.from('cached_evaluations').select('*').eq('question_text', question).eq('student_answer', studentAnswer).maybeSingle();
  if (error) console.error('Error fetching cached eval:', error);
  return data;
};

export const saveEvaluationToCache = async (question: string, studentAnswer: string, isCorrect: boolean, feedback: string) => {
  const { error } = await supabase.from('cached_evaluations').insert({ question_text: question, student_answer: studentAnswer, is_correct: isCorrect, feedback });
  if (error) console.error('Error saving cached eval:', error);
};


// ==========================================
// REGISTRO Y MATERIAS DEMO PARA ESTUDIANTES
// ==========================================

/**
 * Calcula 3 fechas de clase alternadas (un día sí y un día no, saltando fines de semana)
 * Por ejemplo, si inicia en jueves: Jueves, Lunes, Miércoles.
 */
export const getDemoLessonDates = (startDateStr?: string): string[] => {
  const dates: string[] = [];
  const start = startDateStr ? new Date(startDateStr + 'T12:00:00') : new Date();
  let current = new Date(start);

  // Si se registra en fin de semana, comenzar el próximo lunes
  while (current.getDay() === 0 || current.getDay() === 6) {
    current.setDate(current.getDate() + 1);
  }

  let shouldAssign = true;

  while (dates.length < 3) {
    const dayOfWeek = current.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (!isWeekend) {
      if (shouldAssign) {
        dates.push(current.toISOString().split('T')[0]);
        shouldAssign = false;
      } else {
        shouldAssign = true;
      }
    }

    current.setDate(current.getDate() + 1);
    if (current.getFullYear() > 2028) break;
  }

  return dates;
};

/**
 * Registra un nuevo estudiante en la base de datos
 */
/**
 * Inicia sesión o registra un estudiante automáticamente con Google SSO
 */
export const loginOrRegisterWithGoogle = async (googleEmail: string, name?: string, sub?: string): Promise<User> => {
  const cleanEmail = googleEmail.trim().toLowerCase();
  
  // 1. Buscar si algún usuario ya tiene este correo
  const { data: userByEmail } = await supabase
    .from('users')
    .select('*')
    .ilike('email', cleanEmail)
    .maybeSingle();

  if (userByEmail) {
    return userByEmail;
  }

  // 2. Si no, buscar por username derivado del email
  const baseUsername = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
  const { data: userByName } = await supabase
    .from('users')
    .select('*')
    .ilike('username', baseUsername)
    .maybeSingle();

  if (userByName) {
    await supabase.from('users').update({ email: cleanEmail }).eq('id', userByName.id);
    return { ...userByName, email: cleanEmail };
  }

  // 3. Crear nuevo usuario en Supabase con este correo y username
  const passwordHash = await hashPassword('123456');
  const { data: created, error } = await supabase
    .from('users')
    .insert([{
      username: baseUsername,
      password: passwordHash,
      role: Role.STUDENT,
      email: cleanEmail,
      balance: 0
    }])
    .select()
    .single();

  if (error || !created) {
    console.error("Error al registrar usuario con Google:", error);
    const fallbackUsername = `${baseUsername}_${Math.floor(100 + Math.random() * 900)}`;
    const { data: createdFallback, error: err2 } = await supabase
      .from('users')
      .insert([{
        username: fallbackUsername,
        password: passwordHash,
        role: Role.STUDENT,
        email: cleanEmail,
        balance: 0
      }])
      .select()
      .single();
    if (err2 || !createdFallback) throw error || err2;
    return createdFallback;
  }

  return created;
};

export const registerStudent = async (username: string, password?: string, email?: string): Promise<User> => {
  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail = email ? email.trim().toLowerCase() : undefined;
  if (!cleanUsername) throw new Error('El nombre de usuario es requerido.');
  if (cleanUsername.length < 3) throw new Error('El nombre de usuario debe tener al menos 3 caracteres.');

  // Verificar si ya existe el usuario
  const { data: existing } = await supabase
    .from('users')
    .select('username')
    .ilike('username', cleanUsername)
    .maybeSingle();

  if (existing) {
    throw new Error('Ese nombre de usuario ya está registrado. Por favor elige otro.');
  }

  // Verificar si el correo ya está registrado
  if (cleanEmail) {
    const { data: existingEmail } = await supabase
      .from('users')
      .select('username')
      .ilike('email', cleanEmail)
      .maybeSingle();
    if (existingEmail) {
      throw new Error('Ese correo electrónico ya está asociado a otra cuenta.');
    }
  }

  const passwordHash = await hashPassword(password || '123456');
  const { data: newUser, error } = await supabase
    .from('users')
    .insert([{
      username: cleanUsername,
      password: passwordHash,
      email: cleanEmail || null,
      role: Role.STUDENT,
      balance: 0
    }])
    .select()
    .single();

  if (error || !newUser) {
    console.error("Error al registrar estudiante:", error);
    throw error || new Error("No se pudo registrar el estudiante.");
  }

  return newUser;
};

/**
 * Asigna una materia Demo en automático con 3 clases gratis por una semana
 * (un día sí y un día no).
 */
export const assignDemoCourseToStudent = async (username: string, courseId: string | number) => {
  // Asegurar existencia y canonical casing del usuario
  const dbUser = await ensureUserRecordExists(username);
  const actualUsername = dbUser.username || username;

  const [courses, classes] = await Promise.all([
    getCourses(),
    getClasses(courseId)
  ]);

  if (!classes || classes.length === 0) {
    throw new Error('Este curso aún no tiene clases disponibles para la demostración.');
  }

  const courseObj = courses.find((c: any) => String(c.id) === String(courseId));
  const courseName = courseObj ? courseObj.nombre : 'Curso Demo';

  // Tomar las primeras 3 clases
  const demoClasses = classes.slice(0, 3);
  const dates = getDemoLessonDates();

  for (let i = 0; i < demoClasses.length; i++) {
    const cls = demoClasses[i];
    const dateStr = dates[i] || dates[dates.length - 1];

    await addLessonToStudent(actualUsername, {
      id: `demo-${Date.now()}-${i}`,
      subject: courseName,
      title: cls.titulo,
      learningPrompt: `Clase Demo de prueba para ${courseName}.`,
      durationMinutes: cls.assigned_time_minutes || 30,
      date: dateStr,
      completed: false
    });
  }

  return { courseName, classesCount: demoClasses.length, dates };
};