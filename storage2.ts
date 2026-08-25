
import { User, Role, StudentData, Lesson, SubjectGuide, Transaction, Pregunta, OpcionPregunta, IntentoExamen, RespuestaEstudiante, GeminiLessonHistory } from './types.ts';
import { supabase } from './supabaseClient.ts';

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
    await supabase.from('student_lessons').update({ lesson_status: 'Aprobada', completed: true }).eq('student_username', username).gte('grade', 6);
    await supabase.from('student_lessons').update({ lesson_status: 'Reprobada', completed: false }).eq('student_username', username).gt('grade', 0).lt('grade', 6);
    await supabase.from('student_lessons').update({ lesson_status: 'En Progreso' }).eq('student_username', username).or('grade.is.null,grade.eq.0').gt('valid_interactions_count', 0);
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
export const getUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase.from('users').select('*');
  return error ? [] : (data || []);
};

export const saveUser = async (user: User) => {
  const processedUser = { ...user, id: user.id ? String(user.id) : undefined };

  const { error } = await supabase.from('users').insert([processedUser]);
  
  if (error) {
    throw error;
  }
};

export const updateUser = async (originalUsername: string, updatedUser: User) => {
  const { error } = await supabase.from('users').update({
    username: updatedUser.username,
    email: updatedUser.email,
    password: updatedUser.password
  }).eq('username', originalUsername);
  if (error) throw error;
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
  const { data, error } = await supabase.from('student_lessons').select('*').eq('student_username', username);
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
  const cleanTopic = lesson.title ? lesson.title.replace(/^[.\s]+/, '') : '';
  const cleanPrompt = lesson.learningPrompt ? lesson.learningPrompt.replace(/^[.\s]+/, '') : null;

  await supabase.from('student_lessons').insert([{
    student_username: username,
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
};

export const updateLessonInStudent = async (username: string, updatedLesson: Lesson) => {
  const lessonId = String(updatedLesson.id);
  const cleanTopic = updatedLesson.title ? updatedLesson.title.replace(/^[.\s]+/, '') : '';
  const cleanPrompt = updatedLesson.learningPrompt ? updatedLesson.learningPrompt.replace(/^[.\s]+/, '') : null;

  const updateData = {
    completed: updatedLesson.completed,
    grade: updatedLesson.grade,
    elapsed_seconds: updatedLesson.elapsedSeconds,
    actual_duration_minutes: updatedLesson.actualDurationMinutes,
    valid_interactions_count: updatedLesson.completedTopicsCount,
    lesson_status: updatedLesson.lesson_status,
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

export const updateLessonsPromptByCriteria = async (studentUsername: string, subject: string, days: boolean[], startDate: string, newPrompt: string) => {
  const { data, error } = await supabase.from('student_lessons').select('id, date').eq('student_username', studentUsername).eq('subject', subject).gte('date', startDate);
  if (error || !data) return;
  const idsToUpdate = data.filter(l => {
    const d = new Date(l.date + 'T12:00:00');
    const dayOfWeek = (d.getDay() + 6) % 7;
    return days[dayOfWeek];
  }).map(l => String(l.id));
  if (idsToUpdate.length > 0) {
    await supabase.from('student_lessons').update({ learning_prompt: newPrompt }).in('id', idsToUpdate);
  }
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
  const { score, ...rest } = respuesta;
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
    const { score, ...rest } = r;
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
  const status = grade >= 6 ? 'Aprobada' : 'Reprobada';
  const completed = grade >= 6;
  
  const { error } = await supabase.from('student_lessons').update({ 
    grade, 
    lesson_status: status,
    completed,
    credits_transfered: false
  }).eq('id', lessonId);
  
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
  const { data, error } = await supabase
    .from('respuestas_estudiante')
    .select(`
      id,
      respuesta,
      es_correcta,
      score,
      preguntas (
        pregunta,
        respuesta_correcta,
        explicacion
      )
    `)
    .eq('intento_id', String(intentoId));
  
  if (error) {
    console.error("Error fetching intento details:", error);
    return [];
  }
  return data || [];
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
      .eq('nombre', subject)
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
      .eq('titulo', lessonNumber)
      .eq('course_id', materiaId)
      .limit(1);

    if (!classData || classData.length === 0) {
       // Insert leccion
       const { data: newClass, error: lecErr } = await supabase
         .from('classes')
         .insert([{ titulo: lessonNumber, course_id: materiaId, admin_id: ADMIN_UUID }])
         .select('id')
         .single();
       if (lecErr || !newClass) return null;
       classId = newClass.id;
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

    // 2. Fetch all class_chat_history for these IDs and student
    const { data: geminiLessons } = await supabase
      .from('class_chat_history')
      .select('lesson_id')
      .in('lesson_id', validClassIds)
      .eq('student_username', studentUsername);

    // 3. Fetch all intentos_examen for these IDs and student
    const { data: intentos } = await supabase
      .from('intentos_examen')
      .select('class_id')
      .in('class_id', validClassIds)
      .eq('estudiante_id', studentId);

    const geminiSet = new Set(geminiLessons?.map(gl => String(gl.lesson_id)) || []);
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
        statuses[String(lesson.id)] = { hasGeminiLesson: false, hasExamAttempts: false };
      }
    });

    return statuses;
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

