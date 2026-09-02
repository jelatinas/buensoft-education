import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ChatMessage, Lesson, Microtema, Pregunta, OpcionPregunta, IntentoExamen, RespuestaEstudiante } from "./types";
import { getCachedEvaluation, saveEvaluationToCache } from "./storage2";

export const getAiProvider = () => typeof window !== 'undefined' ? (sessionStorage.getItem('selected_ai_provider') || 'openrouter') : 'openrouter';
export const setAiProvider = (provider: string) => typeof window !== 'undefined' && sessionStorage.setItem('selected_ai_provider', provider);


export function shuffleOptions<T>(array: T[]): T[] {
  if (!Array.isArray(array)) return [];
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
const getAIInstance = () => {
  const studentKey = typeof window !== 'undefined' ? localStorage.getItem('student_gemini_api_key') : null;
  const apiKey = studentKey || process.env.API_KEY || process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey === "undefined") {
    console.error("CRITICAL: GEMINI_API_KEY is missing or undefined in environment.");
    throw new Error("API_KEY no encontrada. Por favor, configura GEMINI_API_KEY en los ajustes.");
  }
  return new GoogleGenAI({ apiKey });
};

const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const callGeminiApi = async (action: string, contents: any[], config: any) => {
  const provider = getAiProvider();
  
  if (isLocal) {
    if (provider === 'gemini') {
      const ai = getAIInstance();
      return await ai.models.generateContent({ model: 'gemini-2.5-flash-lite', contents, config });
    } else {
      const isOpenrouter = provider === 'openrouter';
      let apiKey = isOpenrouter ? (import.meta as any).env?.VITE_OPENROUTER_API_KEY : (import.meta as any).env?.VITE_CEREBRAS_API_KEY;
      if (!apiKey) apiKey = isOpenrouter ? process.env.OPENROUTER_API_KEY : process.env.CEREBRAS_API_KEY;
      if (!apiKey) throw new Error(`${provider.toUpperCase()}_API_KEY no configurada localmente.`);
      
      const endpoint = isOpenrouter ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.cerebras.ai/v1/chat/completions';
      const model = isOpenrouter ? 'google/gemini-2.5-flash-lite' : 'llama-3.3-70b';
      
      const messages: any[] = [];
      if (config?.systemInstruction) messages.push({ role: 'system', content: config.systemInstruction });
      
      for (const item of (contents || [])) {
        let textContent = '';
        if (item.parts && Array.isArray(item.parts)) {
          textContent = item.parts.map((p: any) => p.text || '').join('');
        }
        const role = item.role === 'model' ? 'assistant' : 'user';
        if (textContent) messages.push({ role, content: textContent });
      }
      
      let temp = config?.temperature ?? 0.7;
      if (config?.responseMimeType === 'application/json') {
          messages.push({ role: 'system', content: 'You must respond ONLY with valid JSON matching the requested schema.'});
          if (isOpenrouter) temp = 0.1; 
      }
      
      const bodyConfig: any = {
          model,
          messages,
          temperature: temp,
          response_format: config?.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined
      };
      if (config?.maxOutputTokens) {
          bodyConfig.max_tokens = config.maxOutputTokens;
      }
      
      const aiRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://buensoft.com',
          'X-Title': 'Buensoft Education'
        },
        body: JSON.stringify(bodyConfig)
      });
      
      if (!aiRes.ok) throw new Error(`API Error ${aiRes.status}: ${await aiRes.text()}`);
      const data = await aiRes.json();
      return { text: data.choices?.[0]?.message?.content || '' };
    }
  } else {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload: { provider, contents, config } })
    });
    if (!res.ok) {
       const errorData = await res.json().catch(() => ({}));
       throw new Error(errorData.error || `API Error: ${res.statusText}`);
    }
    return await res.json();
  }
};

const cleanJsonResponse = (text: string): string => {
  let cleaned = text.trim();
  
  // Find the first '{' or '[' and the last '}' or ']'
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  
  let start = -1;
  let end = -1;
  
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
  } else if (firstBracket !== -1) {
    start = firstBracket;
  }
  
  if (lastBrace !== -1 && (lastBracket === -1 || lastBrace > lastBracket)) {
    end = lastBrace;
  } else if (lastBracket !== -1) {
    end = lastBracket;
  }
  
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.substring(start, end + 1);
  }

  // Fallback to simple replacement
  return cleaned.replace(/```json/g, "").replace(/```/g, "").trim();
};

// Retry wrapper for transient 503/429 errors with exponential backoff
const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = String(err);
      const isTransient = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429') || msg.includes('quota');
      if (!isTransient || attempt === maxRetries - 1) throw err;
      const delayMs = Math.pow(2, attempt) * 1500; // 1.5s, 3s, 6s
      console.warn(`Gemini transient error (attempt ${attempt + 1}/${maxRetries}), retrying in ${delayMs}ms...`, msg);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
};

export const generateTeacherResponse = async (
  lesson: Lesson,
  user: any,
  currentTopic: Microtema | undefined,
  topicIndex: number,
  isReviewMode: boolean = false,
  feedbackContext?: string,
  onChunk?: (partial: string) => void
) => {
  const ai = getAIInstance();
  
  const systemInstruction = `
    ROL: Profesor experto y empático. Enfócate en dar explicaciones claras, directas y objetivas. NO exageres con elogios ni alabanzas (evita decir "¡Excelente trabajo!", "¡Eres un genio!", etc.), mantén un tono profesional. Usa emojis moderadamente.
    ${user.preferred_teacher_profile ? `INSTRUCCIONES DE PERSONALIDAD DEL MAESTRO: ${user.preferred_teacher_profile}` : ''}
    MATERIA: ${lesson.subject}. TEMA GENERAL: "${lesson.title}".
    ${lesson.learningPrompt ? `INSTRUCCIONES ESPECÍFICAS PARA ESTE CURSO (Obligatorias, adáptate a ellas SIN olvidar tu rol de profesor): "${lesson.learningPrompt}"` : ''}
    ESTUDIANTE: ${user.username}.
    ${user.student_profile ? `PERFIL DEL ESTUDIANTE: ${user.student_profile}` : ''}
    REGLA DE ORO: TUS EXPLICACIONES DEBEN SER EXTREMADAMENTE BREVES Y CONCISAS (MÁXIMO 50 PALABRAS). VE DIRECTO AL GRANO.
  `;

  let prompt = "";
  // Check if we hit the limit for resume interactions (assume feedbackContext contains a signal or we pass a flag)
  // Wait, I need to pass resumeInteractions count to this function!
  // I will just use a specific string in feedbackContext from VirtualClassroom to signal it's the final interaction.
  if (isReviewMode) {
     if (feedbackContext === "FINAL_REVIEW_INTERACTION") {
        prompt = `El estudiante ha completado sus interacciones de repaso obligatorias. Evalúa brevemente su última respuesta y dile explícitamente "Generando examen de evaluación...". NO HAGAS NINGUNA PREGUNTA NUEVA.
FORMATO OBLIGATORIO:
[EXPLICACION] <Tu evaluación aquí>. Generando examen de evaluación... [/EXPLICACION]`;
     } else {
        const topicsList = lesson.microtemas?.map((t, i) => `${i + 1}. ${t.titulo}`).join('\\n') || '';
        prompt = `El estudiante ha completado todos los temas pero necesita seguir practicando para cumplir el tiempo de estudio. 
Hazle UNA pregunta de repaso de Opción Múltiple (MCQ) al azar, basada ESPECÍFICAMENTE en uno de los temas vistos hoy:
${topicsList}

Instrucciones: ${feedbackContext 
  ? `El estudiante acaba de responder. Feedback del profesor: "${feedbackContext}". Basado en esto, dale un breve feedback REFORZADOR que explique POR QUÉ está bien o mal, y formula UNA NUEVA pregunta.`
  : `Haz UNA pregunta de repaso al azar.`}
IMPORTANTE: La pregunta debe ser OBLIGATORIAMENTE de Opción Múltiple (MCQ).
FORMATO OBLIGATORIO Y ESTRICTO (NO uses bloques de código, NO uses acentos graves):
¡ESTRICTAMENTE PROHIBIDO ESCRIBIR TEXTO FUERA DE LAS ETIQUETAS! TODO TU TEXTO DEBE IR DENTRO DE [EXPLICACION].
[EXPLICACION] <Explicación breve o introducción> [/EXPLICACION]
[EXPLICACION] <Explicación breve o introducción> [/EXPLICACION]
[DATA_LOGICA] {"type":"MCQ", "question":"...", "options":["...","...","...","..."], "correct":"..."} [/DATA_LOGICA]
REGLA VITAL PARA EL MCQ: El valor de "correct" DEBE SER EXACTAMENTE IDÉNTICO letra por letra a una de las "options". No agregues prefijos como "A)" si no están en las opciones.`;
     }
  } else if (currentTopic) {
     const topicsList = lesson.microtemas?.map((t, i) => `${i + 1}. ${t.titulo}`).join('\\n') || '';
     if (topicIndex === 0 && !feedbackContext) {
        // Primera interacción de la clase
        prompt = `Esta es la primera interacción de la clase.
ANTES de explicar el Tema 1, MUESTRA EL LISTADO COMPLETO DE LOS TEMAS que aprenderemos hoy:
${topicsList}

Luego, presenta el Tema actual (1/10): "${currentTopic.titulo}".
INSTRUCCIÓN VITAL: 
1. Pon el título del tema en letras **NEGRITAS**.
2. Da una explicación introductoria breve y clara.
3. BRINDA SIEMPRE UN EJEMPLO DE LA VIDA DIARIA (fácil de entender).
4. Después del ejemplo, haz UNA (1) sola pregunta para validar su comprensión.

IMPORTANTE: Alterna los tipos de preguntas para hacerlo divertido (Opción Múltiple Clásica, Preguntas Abiertas, Verdadero/Falso [usa type:MCQ con opciones Verdadero/Falso], o Rellenar el espacio [usa type:WRITTEN o MCQ]).
FORMATO OBLIGATORIO Y ESTRICTO (NO uses bloques de código, NO uses acentos graves):
¡ESTRICTAMENTE PROHIBIDO ESCRIBIR TEXTO FUERA DE LAS ETIQUETAS! TODO TU TEXTO DEBE IR DENTRO DE [EXPLICACION].
[EXPLICACION] <Lista de temas, explicación y ejemplo aquí> [/EXPLICACION]
[DATA_LOGICA] {"type":"MCQ|WRITTEN", "question":"...", "options":["..."](solo si MCQ), "correct":"..."} [/DATA_LOGICA]`;
     } else {
        // Interacciones subsecuentes
        prompt = `Tema actual (${topicIndex + 1}/10): "${currentTopic.titulo}". Contenido de referencia: "${currentTopic.contenido}".
Instrucciones: ${feedbackContext 
  ? `El estudiante acaba de responder a una pregunta. Feedback previo: "${feedbackContext}". Basado en esto, dale un breve feedback REFORZADOR que consolide lo aprendido (si era el último tema anterior, felicítalo). 
Luego, si estamos avanzando a un NUEVO tema (el título del tema actual es nuevo para el estudiante), preséntalo obligatoriamente poniendo su título en **NEGRITAS**, da una explicación introductoria y BRINDA SIEMPRE UN EJEMPLO DE LA VIDA DIARIA. 
Si seguimos en el MISMO tema, solo da el feedback y continúa.`
  : `Presenta el tema actual poniendo su título en **NEGRITAS**, da una explicación introductoria y BRINDA SIEMPRE UN EJEMPLO DE LA VIDA DIARIA.`}

Finalmente, haz UNA (1) sola pregunta para validar su comprensión.
IMPORTANTE: Alterna los tipos de preguntas para hacerlo divertido (Opción Múltiple Clásica, Preguntas Abiertas, Verdadero/Falso [usa type:MCQ con opciones Verdadero/Falso], o Rellenar el espacio [usa type:WRITTEN o MCQ]).
FORMATO OBLIGATORIO Y ESTRICTO (NO uses bloques de código, NO uses acentos graves):
¡ESTRICTAMENTE PROHIBIDO ESCRIBIR TEXTO FUERA DE LAS ETIQUETAS! TODO TU TEXTO DEBE IR DENTRO DE [EXPLICACION]. Sé directo, breve y no redundes.
[EXPLICACION] <Tu explicación/feedback y ejemplo aquí> [/EXPLICACION]
[DATA_LOGICA] {"type":"MCQ|WRITTEN", "question":"...", "options":["..."](solo si MCQ), "correct":"..."} [/DATA_LOGICA]`;
     }
  } else {
     prompt = `Has terminado todos los temas. Felicita al estudiante.`;
  }

  // Use streaming to show text progressively
  
  const streamFn = async () => {
    let fullText = '';
    const contents = [{ role: 'user', parts: [{ text: prompt }] }];
    const provider = getAiProvider();
    
    if (isLocal && provider === 'gemini') {
      const ai = getAIInstance();
      const result = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash-lite',
        contents,
        config: { systemInstruction, maxOutputTokens: 600 }
      });
      for await (const chunk of result) {
        const chunkText = chunk.text || '';
        fullText += chunkText;
        if (onChunk && chunkText) onChunk(fullText);
      }
    } else {
      const response = await callGeminiApi('generateTeacherResponse', contents, { systemInstruction, maxOutputTokens: 600 });
      fullText = response.text || '';
      // Simulate streaming for production proxy or non-gemini local
      for (let i = 0; i < fullText.length; i += 6) {
        if (onChunk) onChunk(fullText.substring(0, i));
        await new Promise(r => setTimeout(r, 10));
      }
      if (onChunk) onChunk(fullText);
    }
    return fullText;
  };


  return await withRetry(streamFn);
};


export const evaluateStudentAnswer = async (
  studentAnswer: string,
  lastQuestion: string,
  user?: any
) => {
  const cached = await getCachedEvaluation(lastQuestion, studentAnswer);
  if (cached) {
    return { aprobado: cached.is_correct, retroalimentacion: cached.feedback };
  }

  const ai = getAIInstance();
  
  let systemInstruction = `ROL: Profesor académico experto.`;
  if (user) {
    if (user.preferred_teacher_profile) systemInstruction += `\nINSTRUCCIONES DE PERSONALIDAD DEL MAESTRO: ${user.preferred_teacher_profile}`;
    systemInstruction += `\nESTUDIANTE: ${user.username}`;
    if (user.student_profile) systemInstruction += `\nPERFIL DEL ESTUDIANTE: ${user.student_profile}`;
  }

  const prompt = `Pregunta hecha al alumno: "${lastQuestion}"
Respuesta del alumno: "${studentAnswer}"
Evalúa si la respuesta es correcta o al menos demuestra comprensión razonable.
Si es incorrecta, debes formular UNA NUEVA PREGUNTA de refuerzo sobre el mismo tema dentro de tu retroalimentación para que el estudiante vuelva a intentarlo.
Responde obligatoriamente en JSON con este formato: {"aprobado": true/false, "retroalimentacion": "<explicación breve y, si falló, incluye aquí la nueva pregunta>"}`;

  const response = await withRetry(() => callGeminiApi('evaluateStudentAnswer', [{ role: 'user', parts: [{ text: prompt }] }], {
    systemInstruction,
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        aprobado: { type: Type.BOOLEAN },
        retroalimentacion: { type: Type.STRING }
      },
      required: ["aprobado", "retroalimentacion"]
    }
  }));

  const cleaned = cleanJsonResponse(response.text || '');
  const result = JSON.parse(cleaned);
  await saveEvaluationToCache(lastQuestion, studentAnswer, result.aprobado, result.retroalimentacion);
  return result;
};

export const generateExam = async (lessonTitle: string, chatHistory: any[], neededMCQ: number, neededOpen: number, neededTF: number) => {
  const ai = getAIInstance();
  
  const historyContext = (chatHistory || [])
    .filter(m => m.parts && m.parts[0]?.text && !m.isSilent)
    .slice(-10) 
    .map(m => {
      const text = m.parts[0].text;
      const cleanText = text.replace(/\[DATA_LOGICA\][\s\S]*?\[\/DATA_LOGICA\]/g, '')
                            .replace(/\[EXPLICACION\]|\[\/EXPLICACION\]|\[RESPUESTA_VALIDA\]|\[RESPUESTA_INCORRECTA\]|\[PLAGIO_IA\]|\[IRRELEVANTE\]|\[REFUERZO\]|\[ERROR_INFO\]|\[MICRO_TEMA_COMPLETADO\]/g, '')
                            .trim();
      return `${m.role === 'user' ? 'Estudiante' : 'Profesor'}: ${cleanText}`;
    })
    .filter(t => t.length > 20)
    .join('\n---\n');

  const total = neededMCQ + neededOpen + neededTF;
  if (total === 0) return { questions: [] };

  const examPrompt = `Genera ${total} preguntas para examen sobre "${lessonTitle}".
  CANTIDADES EXACTAS REQUERIDAS:
  - ${neededMCQ} preguntas de Opción Múltiple (type: "multiple_choice") con 4 opciones.
  - ${neededOpen} preguntas Abiertas (type: "open").
  - ${neededTF} preguntas de Falso o Verdadero (type: "true_false") donde las opciones sean ["Verdadero", "Falso"].
  
  REGLAS:
  1. CONTEXTO: Solo conceptos del historial. NO info externa.
  2. FORMATO MCQ y T/F: Evita "todas las anteriores".
  3. ABIERTAS: La "correct_answer" debe ser la rúbrica o idea clave que el estudiante debe mencionar.
  4. REGLA ESTRICTA DE JSON: Los valores de texto para 'options' y 'question' deben ser CORTOS, LIMPIOS y DIRECTOS. Está ESTRICTAMENTE PROHIBIDO generar cadenas de razonamiento, explicaciones largas, tags de depuración o texto basura dentro de los valores de las opciones.
  
  HISTORIAL:
  ${historyContext}
  
  JSON: questions[{id, question, type, options[], correct_answer, explanation}]`;

  const response = await withRetry(() => callGeminiApi('generateExam', [{ role: 'user', parts: [{ text: examPrompt }] }], {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        questions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.INTEGER },
              question: { type: Type.STRING },
              type: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correct_answer: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["id", "question", "type", "correct_answer", "explanation", "options"]
          }
        }
      },
      required: ["questions"]
    }
  }));

  try {
    const cleaned = cleanJsonResponse(response.text || '');
    const examData = JSON.parse(cleaned);
    if (examData.questions) {
      examData.questions = examData.questions.map((q: any) => {
        const cleanStr = (s: string) => (typeof s === 'string') ? s.replace(/^[A-Z]\)\s*/, '') : s;
        const shuffled = shuffleOptions((q.options || []).map(cleanStr));
        return { ...q, options: shuffled, correct_answer: cleanStr(q.correct_answer) };
      });
    }
  } catch (e) { return { questions: [] }; }
};

export const generateMCQBatch = async (
  lesson: Lesson,
  studentName: string,
  currentTopic: Microtema | undefined,
  isReviewMode: boolean = false
) => {
  const ai = getAIInstance();
  
  let promptContext = "";
  if (isReviewMode) {
    promptContext = "El estudiante está en modo de repaso. Genera preguntas al azar sobre cualquier tema de la materia.";
  } else if (currentTopic) {
    promptContext = `Tema actual: "${currentTopic.titulo}: ${currentTopic.contenido}". Enfócate estrictamente en este tema.`;
  } else {
    promptContext = "Genera preguntas generales sobre la lección.";
  }

  const prompt = `
    MATERIA: ${lesson.subject}. TEMA GENERAL: "${lesson.title}". ${lesson.learningPrompt ? `PROMPT: "${lesson.learningPrompt}".` : ''}
    ESTUDIANTE: ${studentName}.
    CONTEXTO: ${promptContext}
    
    Genera 3 preguntas de opción múltiple (MCQ). Para cada pregunta:
    - Formula una pregunta clara.
    - Proporciona 4 opciones.
    - Indica la opción correcta exacta.
    - Proporciona una explicación pedagógica dirigida al estudiante del porqué es correcta.
    
    REGLA ESTRICTA DE JSON: Los valores de texto para 'options' y 'question' deben ser CORTOS, LIMPIOS y DIRECTOS. Está ESTRICTAMENTE PROHIBIDO generar cadenas de razonamiento, explicaciones largas, tags de depuración o texto basura dentro de los valores de las opciones.
  `;

  const response = await withRetry(() => callGeminiApi('generateMCQBatch', [{ role: 'user', parts: [{ text: prompt }] }], {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        questions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correct: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["question", "options", "correct", "explanation"]
          }
        }
      },
      required: ["questions"]
    }
  }));

  try {
    const cleaned = cleanJsonResponse(response.text || '');
    const data = JSON.parse(cleaned);
    // Shuffle options for each question
    if (data.questions) {
      data.questions = data.questions.map((q: any) => ({
        ...q,
        options: shuffleOptions(q.options)
      }));
    }
    return data.questions || [];
  } catch (e) {
    console.error("Error parsing MCQ batch", e);
    return [];
  }
};


export const generateQuestionBank = async (subject: string, topic: string) => {
  const ai = getAIInstance();
  const prompt = `Banco 50 preguntas "${topic}" ("${subject}").
  - 20 MCQ (4 opciones).
  - 20 Open.
  - 10 T/F.
  - REGLAS PARA OPCIÓN MÚLTIPLE (MCQ):
    * Todas las opciones deben tener una longitud similar.
    * Evita patrones que permitan adivinar la respuesta (ej: una opción mucho más larga o con más detalle).
    * Mantén estructura y nivel de detalle similares en todas las opciones.
    * El objetivo es que el estudiante no pueda identificar la respuesta correcta por patrones de forma.
  - Para preguntas T/F, el campo "correct_answer" DEBE ser exactamente "VERDADERO" o "FALSO".
  - Si la materia es analítica (Matemáticas, Programación, etc.), incluye preguntas de razonamiento, depuración de código o resolución de problemas.
  JSON questions[{id, type, question, options[], correct_answer, acceptable_answers[], explanation}]`;

  const response = await withRetry(() => callGeminiApi('generateQuestionBank', [{ role: 'user', parts: [{ text: prompt }] }], {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        questions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING },
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correct_answer: { type: Type.STRING },
              acceptable_answers: { type: Type.ARRAY, items: { type: Type.STRING } },
              explanation: { type: Type.STRING }
            },
            required: ["id", "type", "question", "correct_answer", "explanation"]
          }
        }
      },
      required: ["questions"]
    }
  }));

  try {
    const text = response.text || '';
    const cleaned = cleanJsonResponse(text);
    const parsed = JSON.parse(cleaned);
    if (parsed.questions) {
        parsed.questions = parsed.questions.map((q: any) => {
            let correctAnswer = q.correct_answer;
            if (q.type === 'true_false') {
                const lower = String(correctAnswer).toLowerCase().trim();
                if (lower === 'true' || lower === 'verdadero') correctAnswer = 'VERDADERO';
                else if (lower === 'false' || lower === 'falso') correctAnswer = 'FALSO';
            }
            return {
                ...q,
                correct_answer: correctAnswer,
                options: shuffleOptions(q.options || []),
                acceptable_answers: q.acceptable_answers || []
            };
        });
    }
    return parsed;
  } catch (e) {
    console.error("Error al generar banco de preguntas:", e);
    throw e;
  }
};

export interface OpenAnswerEvaluation {
  es_correcta: boolean;
  score: number;
  status: 'correcta' | 'parcialmente_correcta' | 'incorrecta';
  explicacion: string;
  feedback?: string;
}

export const validateOpenAnswer = async (question: string, acceptableAnswers: string[], studentAnswer: string): Promise<OpenAnswerEvaluation> => {
  const ai = getAIInstance();
  const prompt = `Evalúa la respuesta del estudiante comparándola con la respuesta esperada, siendo flexible y empático.
  Pregunta: "${question}"
  Respuestas Correctas de Referencia: ${JSON.stringify(acceptableAnswers)}
  Respuesta del Estudiante: "${studentAnswer}"
  
  REGLAS DE EVALUACIÓN:
  1. COMPRENSIÓN CONCEPTUAL: No evalúes por coincidencia exacta de palabras. Evalúa si el estudiante demuestra comprensión del concepto.
  2. PROPIAS PALABRAS: Acepta respuestas que expliquen la idea con sus propias palabras, usando sinónimos o diferente redacción.
  3. FLEXIBILIDAD Y EMPATÍA: Sé flexible y empático al evaluar. No penalices diferencias de redacción, orden de ideas o uso de sinónimos.
  
  CLASIFICACIÓN POR SIMILITUD CONCEPTUAL:
  - 100–70% → correcta (status: "correcta", es_correcta: true)
  - 69–50% → parcialmente correcta (status: "parcialmente_correcta", es_correcta: true)
  - <50% → incorrecta (status: "incorrecta", es_correcta: false)
  
  REGLAS DE REDACCIÓN DE LA EXPLICACIÓN:
  - Dirígete DIRECTAMENTE al estudiante (ej: "Mencionas que...", "Tu respuesta explica...").
  - NO uses frases como "El estudiante demuestra una comprensión clara...".
  - Explica qué dice el estudiante y por qué su respuesta coincide, coincide parcialmente o no coincide con la respuesta esperada.
  - Si la respuesta es PARCIALMENTE CORRECTA (score 50), explícale qué parte de su respuesta es correcta y qué parte falta o es incorrecta.
  
  REGLAS ADICIONALES:
  - Si la respuesta es parcialmente correcta, el score debe ser 50. Si es correcta, 100. Si es incorrecta, 0.
  
  Responde ÚNICAMENTE con un objeto JSON con este formato:
  {
    "es_correcta": boolean,
    "score": number (0, 50 o 100),
    "status": "correcta" | "parcialmente_correcta" | "incorrecta",
    "explicacion": "string"
  }`;

  try {
    const response = await callGeminiApi('validateOpenAnswer', [{ role: 'user', parts: [{ text: prompt }] }], { 
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          es_correcta: { type: Type.BOOLEAN },
          score: { type: Type.NUMBER },
          status: { type: Type.STRING },
          explicacion: { type: Type.STRING }
        },
        required: ["es_correcta", "score", "status", "explicacion"]
      }
    });
    const cleaned = cleanJsonResponse(response.text || '');
    return JSON.parse(cleaned);
  } catch (e) { 
    return { 
      es_correcta: false, 
      score: 0, 
      status: 'incorrecta', 
      explicacion: "Error al evaluar la respuesta." 
    }; 
  }
};

export const generateMicrotemas = async (subject: string, description: string) => {
  const ai = getAIInstance();
  const prompt = `Genera 10 microtemas de estudio para la materia "${subject}" basados en la siguiente descripción de lección: "${description}".
  
  Cada microtema debe tener:
  1. Un título corto y claro.
  2. Una explicación breve y concisa del concepto (máximo 3 frases).
  
  Devuelve un objeto JSON con un array "microtemas" donde cada objeto tenga: titulo (string) y contenido (string).`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          microtemas: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                titulo: { type: Type.STRING },
                contenido: { type: Type.STRING }
              },
              required: ["titulo", "contenido"]
            }
          }
        },
        required: ["microtemas"]
      }
    }
  });

  try {
    const cleaned = cleanJsonResponse(response.text || '');
    return JSON.parse(cleaned).microtemas;
  } catch (e) {
    console.error("Error al generar microtemas:", e);
    return [];
  }
};

export const generateQuestionsForMicrotemas = async (subject: string, lessonTitle: string, microtemas: Microtema[], chatHistory: any[] = [], retries = 2) => {
  const ai = getAIInstance();
  
  const historyContext = (chatHistory || [])
    .filter(m => m.parts && m.parts[0]?.text && !m.isSilent)
    .slice(-5) 
    .map(m => {
      const cleanText = m.parts[0].text.replace(/\[.*?\]/g, '').trim();
      return `${m.role === 'user' ? 'Estudiante' : 'Profesor'}: ${cleanText}`;
    })
    .filter(t => t.length > 20)
    .join('\n---\n');
    
  const prompt = `Genera exactamente 10 preguntas de evaluación únicas para la materia "${subject}" y lección "${lessonTitle}".
  
  DISTRIBUCIÓN OBLIGATORIA:
  - 5 preguntas abiertas (tipo: 'open')
  - 3 preguntas de opción múltiple (tipo: 'multiple_choice')
  - 2 preguntas de verdadero/falso (tipo: 'true_false')
  
  COBERTURA:
  - Debes generar exactamente 1 pregunta por cada microtema proporcionado (hay 10 microtemas).
  - IMPORTANTÍSIMO: Utiliza CONTEXTO DE LA CLASE y ejemplos específicos que se hayan mencionado en el historial de chat para formular las preguntas, haciendo el examen más personalizado y contextualizado.
  
  CONTEXTO (MICROTEMAS):
  ${microtemas.map((m, i) => `Microtema ${i+1}: [ID REAL: ${m.id}] - Título: ${m.titulo}. Contenido: ${m.contenido}`).join('\n')}
  
  HISTORIAL DE CLASE (Usa ejemplos de aquí):
  ${historyContext}
  
  REGLAS CRÍTICAS:
  1. El campo "microtema_id" DEBE ser exactamente el ID REAL proporcionado entre corchetes.
  2. PARA OPCIÓN MÚLTIPLE (multiple_choice):
     - Genera 4 opciones (una correcta).
     - Todas las opciones deben tener una longitud similar.
     - Evita patrones que permitan adivinar la respuesta (ej: una opción mucho más larga o detallada).
     - Mantén estructura y nivel de detalle similares en todas las opciones.
  3. El campo "tipo" debe ser exactamente 'open', 'multiple_choice' o 'true_false'.
  4. Para 'true_false', el campo "respuesta_correcta" DEBE ser exactamente "VERDADERO" o "FALSO". No uses "True", "False", "Verdadero" o "Falso" con otra capitalización.
  5. La pregunta debe ser clara, profesional y basada estrictamente en el contenido de los microtemas.
  6. ANALÍTICO: Si la materia es técnica (Programación, Matemáticas, etc.), incluye preguntas de razonamiento, depuración de código (ej: identificar errores) o resolución de problemas prácticos.
  7. Asegúrate de que las 10 preguntas sean diferentes entre sí.
  
  JSON: {
    "preguntas": [
      {
        "microtema_id": ID_NUMERICO_REAL,
        "tipo": "open|multiple_choice|true_false",
        "pregunta": "...",
        "respuesta_correcta": "...",
        "explicacion": "...",
        "opciones": [{"opcion": "...", "es_correcta": true|false}] (solo si multiple_choice)
      }
    ]
  }`;

  const fallbackKey = typeof window !== 'undefined' ? localStorage.getItem('student_fallback_api_key') : null;
  const cerebrasKey = typeof window !== 'undefined' ? localStorage.getItem('student_cerebras_api_key') : null;
  const systemInstruction = "Eres un generador de JSON estricto. Tu única tarea es generar preguntas de evaluación basadas en los microtemas proporcionados. Usa los IDs reales de los microtemas.";

  for (let i = 0; i <= retries; i++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              preguntas: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    microtema_id: { type: Type.INTEGER },
                    tipo: { 
                      type: Type.STRING,
                      enum: ['open', 'multiple_choice', 'true_false']
                    },
                    pregunta: { type: Type.STRING },
                    respuesta_correcta: { type: Type.STRING },
                    explicacion: { type: Type.STRING },
                    opciones: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          opcion: { type: Type.STRING },
                          es_correcta: { type: Type.BOOLEAN }
                        },
                        required: ["opcion", "es_correcta"]
                      }
                    }
                  },
                  required: ["microtema_id", "tipo", "pregunta", "respuesta_correcta", "explicacion"]
                }
              }
            },
            required: ["preguntas"]
          }
        }
      });

      const text = response.text || '';
      if (!text) throw new Error("Respuesta vacía de la IA");
      
      const cleaned = cleanJsonResponse(text);
      const parsed = JSON.parse(cleaned);
      if (!parsed.preguntas || !Array.isArray(parsed.preguntas)) {
        throw new Error("El JSON no contiene un array 'preguntas'");
      }

      // Normalización de respuestas Verdadero/Falso y barajado de opciones
      parsed.preguntas = parsed.preguntas.map((q: any) => {
        if (q.tipo === 'true_false') {
          const lower = String(q.respuesta_correcta).toLowerCase().trim();
          if (lower === 'true' || lower === 'verdadero') q.respuesta_correcta = 'VERDADERO';
          else if (lower === 'false' || lower === 'falso') q.respuesta_correcta = 'FALSO';
        }
        if (q.tipo === 'multiple_choice' && q.opciones) {
          q.opciones = shuffleOptions(q.opciones);
        }
        return q;
      });

      return parsed.preguntas;
    } catch (err: any) {
      const isQuotaError = String(err).includes('429') || String(err).includes('quota') || String(err).includes('503');
      if (isQuotaError && (cerebrasKey || fallbackKey)) {
        try {
          console.warn("Gemini falló en generateQuestions. Usando Fallback...");
          
          let apiUrl = "https://openrouter.ai/api/v1/chat/completions";
          let authHeader = `Bearer ${fallbackKey?.trim()}`;
          let requestBody: any = {
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: prompt + "\n\nResponde SOLO con el JSON estructurado según las reglas." }
            ],
            response_format: { type: "json_object" }
          };

          if (cerebrasKey) {
             apiUrl = "https://api.cerebras.ai/v1/chat/completions";
             authHeader = `Bearer ${cerebrasKey.trim()}`;
             requestBody = {
               model: "llama3.1-8b",
               messages: [
                 { role: "system", content: systemInstruction },
                 { role: "user", content: prompt + "\n\nResponde SOLO con el JSON estructurado según las reglas." }
               ],
               response_format: { type: "json_object" }
             };
          }

          const orResponse = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Authorization": authHeader,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
          });
          if (orResponse.ok) {
            const orData = await orResponse.json();
            const orText = orData.choices[0].message.content;
            const cleaned = cleanJsonResponse(orText || '');
            const parsed = JSON.parse(cleaned);
            
            parsed.preguntas = parsed.preguntas.map((q: any) => {
              if (q.tipo === 'true_false') {
                const lower = String(q.respuesta_correcta).toLowerCase().trim();
                if (lower === 'true' || lower === 'verdadero') q.respuesta_correcta = 'VERDADERO';
                else if (lower === 'false' || lower === 'falso') q.respuesta_correcta = 'FALSO';
              }
              if (q.tipo === 'multiple_choice' && q.opciones) {
                q.opciones = shuffleOptions(q.opciones);
              }
              return q;
            });
            return parsed.preguntas;
          }
        } catch (fbErr) {
          console.error("Fallback también falló", fbErr);
        }
      }
      
      console.error(`Error al generar preguntas (intento ${i + 1}/${retries + 1}):`, err);
      if (i === retries) return [];
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return [];
};

export interface BatchOpenAnswerResult {
  result: "Correcta" | "Incorrecta" | "Parcialmente Correcta";
  feedback?: string;
}

export const evaluateBatchOpenAnswersAI = async (
  answers: { question: string; expected_answer: string; student_answer: string }[],
  retries = 2
): Promise<BatchOpenAnswerResult[]> => {
  const ai = getAIInstance();
  
  const systemInstruction = `
    ROL: Profesor académico estricto pero justo. Eres un experto evaluador del aprendizaje.
    TAREA: Evaluar un lote (batch) de respuestas abiertas de un examen.
    
    REGLAS DE EVALUACIÓN:
    1. "Correcta": La respuesta del estudiante cubre los conceptos clave de la respuesta esperada.
    2. "Parcialmente Correcta": La respuesta es incompleta o tiene errores menores pero demuestra conocimiento parcial.
    3. "Incorrecta": La respuesta es errónea, irrelevante o no aborda el concepto solicitado.
    
    OPTIMIZACIÓN:
    - Sé conciso en el feedback.
    - No repitas la pregunta en el feedback.
    - Dirígete al estudiante.
    
    FORMATO DE SALIDA (JSON ARRAY PURO, sin texto adicional):
    [
      {
        "result": "Correcta" | "Incorrecta" | "Parcialmente Correcta",
        "feedback": "Breve explicación del porqué de la nota"
      }
    ]
    
    IMPORTANTE: El orden del arreglo de salida DEBE coincidir exactamente con el orden del arreglo de entrada.
    Responde ÚNICAMENTE con el JSON array, sin explicaciones adicionales.
  `;

  const prompt = JSON.stringify(answers);
  const contents = [{ role: 'user', parts: [{ text: prompt }] }];

  for (let i = 0; i <= retries; i++) {
    try {
      // Use callGeminiApi which routes through OpenRouter (avoids direct Google API 404)
      const response = await callGeminiApi('evaluateBatchOpenAnswers', contents, {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.1
      });
      
      const text = response.text || '';
      if (!text) throw new Error("Respuesta vacía de la IA");
      
      const cleaned = cleanJsonResponse(text);
      const parsed = JSON.parse(cleaned);
      
      if (Array.isArray(parsed) && parsed.length === answers.length) {
        return parsed;
      } else {
        throw new Error("El número de respuestas de la IA no coincide con el enviado");
      }
    } catch (e) { 
      console.error(`Error evaluando respuestas abiertas en lote (intento ${i + 1}/${retries + 1}):`, e);
      if (i === retries) {
        return answers.map(() => ({ result: "Incorrecta", feedback: "Error técnico en la evaluación." }));
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return answers.map(() => ({ result: "Incorrecta", feedback: "Error técnico en la evaluación." }));
};

export const evaluateOpenAnswerAI = async (question: string, correctAnswer: string, studentAnswer: string, retries = 2): Promise<OpenAnswerEvaluation> => {
  const ai = getAIInstance();
  const prompt = `Evalúa la respuesta del estudiante comparándola con la respuesta esperada, siendo flexible y empático.
  Pregunta: "${question}"
  Respuesta Correcta Modelo: "${correctAnswer}"
  Respuesta Estudiante: "${studentAnswer}"
  
  REGLAS DE EVALUACIÓN:
  1. COMPRENSIÓN CONCEPTUAL: No evalúes por coincidencia exacta de palabras. Evalúa si el estudiante demuestra comprensión del concepto.
  2. PROPIAS PALABRAS: Acepta respuestas que expliquen la idea con sus propias palabras, usando sinónimos o diferente redacción.
  3. FLEXIBILIDAD Y EMPATÍA: Sé flexible y empático al evaluar. No penalices diferencias de redacción, orden de ideas o uso de sinónimos.
  
  CLASIFICACIÓN POR SIMILITUD CONCEPTUAL:
  - 100–70% → correcta (status: "correcta", es_correcta: true)
  - 69–50% → parcialmente correcta (status: "parcialmente_correcta", es_correcta: true)
  - <50% → incorrecta (status: "incorrecta", es_correcta: false)
  
  REGLAS DE REDACCIÓN DE LA EXPLICACIÓN:
  - Dirígete DIRECTAMENTE al estudiante (ej: "Mencionas que...", "Tu respuesta explica...").
  - NO uses frases como "El estudiante demuestra una comprensión clara...".
  - Explica qué dice el estudiante y por qué su respuesta coincide, coincide parcialmente o no coincide con la respuesta esperada.
  - Si la respuesta es PARCIALMENTE CORRECTA (score 50), explícale qué parte de su respuesta es correcta y qué parte falta o es incorrecta.
  
  REGLAS ADICIONALES:
  - Si la respuesta es parcialmente correcta, el score debe ser 50. Si es correcta, 100. Si es incorrecta, 0.
  
  Responde con un JSON indicando el resultado detallado con este formato:
  {
    "es_correcta": boolean,
    "score": number (0, 50 o 100),
    "status": "correcta" | "parcialmente_correcta" | "incorrecta",
    "explicacion": "string"
  }`;

  for (let i = 0; i <= retries; i++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              es_correcta: { type: Type.BOOLEAN },
              score: { type: Type.NUMBER },
              status: { type: Type.STRING },
              explicacion: { type: Type.STRING }
            },
            required: ["es_correcta", "score", "status", "explicacion"]
          },
          temperature: 0.1
        }
      });
      
      const text = response.text || '';
      if (!text) throw new Error("Respuesta vacía de la IA");
      
      const cleaned = cleanJsonResponse(text);
      return JSON.parse(cleaned);
    } catch (e) { 
      console.error(`Error evaluando respuesta abierta (intento ${i + 1}/${retries + 1}):`, e);
      if (i === retries) return { es_correcta: false, score: 0, status: 'incorrecta', explicacion: "Error al evaluar la respuesta." };
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return { es_correcta: false, score: 0, status: 'incorrecta', explicacion: "Error al evaluar la respuesta." };
};

export const generateSpeech = async (text: string) => {
  const ai = getAIInstance();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (e) {
    console.error("Error generating speech:", e);
    return null;
  }
};

export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const generateClassExamQuestions = async (
  subject: string,
  lessonTitle: string,
  temario: Microtema[],
  neededMCQ: number,
  neededOpen: number,
  neededTF: number,
  retries = 2
) => {
  const ai = getAIInstance();
  
  const temarioStr = temario.map((m, i) => `${i + 1}. ${m.titulo}: ${m.contenido}`).join('\n');

  const total = neededMCQ + neededOpen + neededTF;
  if (total === 0) return [];

  const prompt = `Genera exactamente ${total} preguntas de evaluacion unicas para la materia "${subject}" y leccion "${lessonTitle}".
  CANTIDADES OBLIGATORIAS:
  - ${neededOpen} preguntas abiertas (tipo: 'open')
  - ${neededMCQ} preguntas de opcion multiple (tipo: 'multiple_choice')
  - ${neededTF} preguntas de verdadero/falso (tipo: 'true_false')

  HISTORIAL DE CLASE (Usa ejemplos de aqui):
  ${temarioStr}

  REGLAS CRITICAS:
  1. PARA OPCION MULTIPLE (multiple_choice): Genera 4 opciones. La correcta debe ser aleatoria (no siempre la A).
  2. El campo 'tipo' debe ser exactamente 'open', 'multiple_choice' o 'true_false'.
  3. Para 'true_false', la correcta debe ser 'VERDADERO' o 'FALSO'.
  4. El campo 'opciones' DEBE ser un arreglo de strings (textos), NO objetos. Ejemplo: ["Opcion 1", "Opcion 2"]
  5. FORMATO DE SALIDA EXACTO (Un objeto con la propiedad "preguntas" que es un arreglo):
  {
    "preguntas": [
      {
        "tipo": "open" | "multiple_choice" | "true_false",
        "pregunta": "Texto de la pregunta",
        "respuesta_correcta": "La respuesta correcta (para true_false debe ser VERDADERO o FALSO)",
        "explicacion": "Explicacion de por que es correcta",
        "opciones": ["opcion 1", "opcion 2", "opcion 3", "opcion 4"] // Solo para multiple_choice
      }
    ]
  }`;

  const systemInstruction = "Eres un generador de JSON estricto. Tu tarea es generar preguntas de evaluacion para estudiantes.";

  for (let i = 0; i <= retries; i++) {
    try {
      // Use callGeminiApi to route through OpenRouter (avoids direct Google API 404)
      const contents = [{ role: 'user', parts: [{ text: prompt }] }];
      const response = await callGeminiApi('generateClassExamQuestions', contents, {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.3
      });
      const cleaned = cleanJsonResponse(response.text || '');
      const examData = JSON.parse(cleaned);
      if (examData?.preguntas && Array.isArray(examData.preguntas)) {
        return examData.preguntas;
      }
      // Sometimes the response is a direct array
      if (Array.isArray(examData)) return examData;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return [];
};
