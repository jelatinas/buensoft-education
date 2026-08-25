import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Lesson, Microtema } from '../types';
import { 
  getOrCreateMateria, 
  getOrCreateLeccion, 
  getMicrotemas, 
  saveMicrotemas,
  updateLessonInStudent,
  getLeccionById,
  getClassChatHistory,
  saveClassChatHistory
} from '../storage2';
import { generateMicrotemas } from '../geminiService2';
import { Copy, CheckCircle, XCircle, Loader2, BrainCircuit, BookOpen, ClipboardCheck, AlertCircle } from 'lucide-react';
import ExamComponent from './ExamComponent';

interface StudyGuideModalProps {
  lesson: Lesson;
  user: any; // Added user prop to get studentId
  onClose: () => void;
  onLessonAccredited?: (grade: number) => void;
}

const StudyGuideModal: React.FC<StudyGuideModalProps> = ({ lesson, user, onClose, onLessonAccredited }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [microtemas, setMicrotemas] = useState<Microtema[]>([]);
  const [lessonInfo, setLessonInfo] = useState({ number: '', description: '' });
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showExam, setShowExam] = useState(false);
  const [lessonDbId, setLessonDbId] = useState<string | null>(null);
  const hasInitialized = useRef(false);

  // Verification flow states
  const [verificationStep, setVerificationStep] = useState<'none' | 'checking' | 'review' | 'paste' | 'validating'>('none');
  const [pastedLesson, setPastedLesson] = useState('');
  const [savedGeminiLesson, setSavedGeminiLesson] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initFlow = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Parsing logic for Lesson Number and Description
        const topic = lesson.title || 'Lección 0';
        const subject = lesson.subject || 'General';
        
        const match = topic.match(/(?:Lección|Lesson)\s+(\d+)/i);
        const lessonNumber = match ? match[1] : topic;
        const description = topic.replace(/(?:Lección|Lesson)\s+\d+[:\s]*/i, '').replace(/^[.\s]+/, '').trim() || topic;
        
        setLessonInfo({ number: lessonNumber, description });

        console.log("Iniciando flujo de guía:", { subject, lessonNumber, description });

        // 1. Verificar o crear Materia
        let mId;
        try {
          mId = await getOrCreateMateria(subject);
        } catch (e: any) {
          console.error("Error en getOrCreateMateria:", e);
          throw new Error(`Error al procesar la materia: ${e.message || 'Error desconocido'}`);
        }

        // 2. Verificar o crear Lección
        let lId;
        try {
          lId = await getOrCreateLeccion(lessonNumber, description, mId);
          setLessonDbId(lId);
        } catch (e: any) {
          console.error("Error en getOrCreateLeccion:", e);
          throw new Error(`Error al procesar la lección: ${e.message || 'Error desconocido'}`);
        }

        // 3. Verificar si ya existen Microtemas
        let existingMicrotemas = [];
        try {
          existingMicrotemas = await getMicrotemas(lId);
        } catch (e: any) {
          console.error("Error en getMicrotemas:", e);
          // No bloqueamos aquí, intentamos generar si falla la consulta
        }
        
        if (existingMicrotemas.length > 0) {
          setMicrotemas(existingMicrotemas);
        } else {
          // 4. Generar Microtemas con AI
          console.log("Generando microtemas con IA...");
          let generated = [];
          try {
            generated = await generateMicrotemas(subject, description);
          } catch (e: any) {
            console.error("Error en generateMicrotemas:", e);
            throw new Error(`Error al generar temas con IA: ${e.message || 'Error de conexión'}`);
          }

          if (!generated || generated.length === 0) {
            throw new Error("La IA no pudo generar los temas de estudio. Intenta de nuevo.");
          }

          const microtemasToSave = generated.map((m: any) => ({
            titulo: m.titulo,
            contenido: m.contenido,
            leccion_id: lId
          }));

          let finalMicrotemas: Microtema[] = [];
          try {
            const saved = await saveMicrotemas(microtemasToSave);
            if (saved && saved.length > 0) {
              finalMicrotemas = saved as Microtema[];
            } else {
              // Si no devolvió nada, intentamos recuperar
              const existing = await getMicrotemas(lId);
              finalMicrotemas = existing.length > 0 ? existing : (microtemasToSave as any);
            }
          } catch (e: any) {
            console.error("Error en saveMicrotemas:", e);
            const existing = await getMicrotemas(lId);
            finalMicrotemas = existing.length > 0 ? existing : (microtemasToSave as any);
          }
          
          if (finalMicrotemas.length > 0) {
            console.log("Microtemas finales listos:", finalMicrotemas);
            const ids = finalMicrotemas.map(m => m.id).filter(id => id !== undefined);
            console.log(`Se encontraron ${ids.length} IDs válidos de ${finalMicrotemas.length} microtemas.`);
            
            setMicrotemas(finalMicrotemas);
            lesson.microtemas = finalMicrotemas;
          } else {
            setError("No se pudieron generar los temas de estudio. Por favor intenta de nuevo.");
          }
        }
      } catch (err: any) {
        console.error("Error crítico en initFlow:", err);
        setError(err.message || "Hubo un error al preparar tu guía de estudio.");
      } finally {
        setIsLoading(false);
      }
    };

    initFlow();
  }, [lesson]);

  const studyContent = `--- CONTENIDO DE LA LECCIÓN ---
Materia: ${lesson.subject}
Lección: ${lessonInfo.number} - ${lessonInfo.description}
Tiempo sugerido de estudio: ${lesson.durationMinutes} MINUTOS

Temas a aprender:
${microtemas.map((m, i) => `${i + 1}. ${m.titulo}: ${m.contenido}`).join('\n')}

--- INSTRUCCIONES PARA GEMINI ---

Al iniciar la lección:
- Saluda al estudiante por su nombre (${user.username}) de manera cordial y entusiasta.
- Muestra la FECHA y HORA actual.
- Inicia un contador del tiempo total de estudio desde el comienzo de la lección.

Reglas durante la interacción:
- En cada mensaje, tanto tuyo como mío, muestra la hora actual con segundos.
- Lleva un seguimiento del tiempo total que llevamos interactuando con esta lección para mantener control del tiempo real de estudio.

Estructura de la enseñanza:
- La lección ya está organizada en los 10 microtemas listados arriba.
- Enséñame cada microtema utilizando ejemplos claros y prácticos.
- No avances al siguiente microtema hasta que confirmes que realmente comprendí lo que me explicaste.
- Durante la enseñanza: Explica el concepto, proporciona ejemplos sencillos y haz una pregunta corta para verificar mi comprensión. Si no respondo correctamente, explícame de nuevo y vuelve a preguntar antes de avanzar.
- Intenta enseñar toda la lección (los 10 microtemas) dentro del tiempo de estudio sugerido, manteniendo un ritmo adecuado para que el estudiante comprenda el contenido sin exceder el tiempo recomendado.

Finalización de la lección:
- Cuando se hayan explicado los 10 microtemas y el tiempo mínimo de estudio requerido se haya cumplido, da por terminada la lección.
- Al finalizar, indica claramente al estudiante que debe regresar a la plataforma de Buensoft Education para presentar el examen de evaluación.`;

  const handleCopy = () => {
    navigator.clipboard.writeText(studyContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  };

  const [showDetailedError, setShowDetailedError] = useState(false);

  const checkValidity = (text: string) => {
    const t = text.trim();
    const errors: string[] = [];
    if (!t) return { isValid: false, errors: ["El texto está vacío."] };

    const lines = t.split('\n').filter(l => l.trim().length > 0);
    const words = t.split(/\s+/).filter(w => w.length > 0);
    
    // Rule: Gemini mentions (at least 10)
    const geminiCount = (t.match(/gemini/gi) || []).length;
    if (geminiCount < 10) {
      errors.push(`Se requieren al menos 10 menciones de "Gemini" (se encontraron ${geminiCount}).`);
    }

    // Rule: Pregunta mentions (at least 10)
    const preguntaCount = (t.match(/pregunta/gi) || []).length;
    if (preguntaCount < 10) {
      errors.push(`Se requieren al menos 10 menciones de la palabra "Pregunta" (se encontraron ${preguntaCount}).`);
    }

    // Rule: Buensoft Education presence
    if (!t.toLowerCase().includes("buensoft education")) {
      errors.push('No se encontró la frase "Buensoft Education" en la lección.');
    }

    // Rule 3: Total words >= 500
    if (words.length < 500) {
      errors.push(`Total de palabras insuficiente: ${words.length} de 500 requeridas.`);
    }
    
    // Rule 4: Total lines >= 20
    if (lines.length < 20) {
      errors.push(`Total de líneas insuficiente: ${lines.length} de 20 requeridas.`);
    }

    // Rule 1: Detect 10 micro-topics (1. to 10.)
    const topicRegex = /(?:\n|^)\s*(\d+)\.\s+/g;
    const matches = [...t.matchAll(topicRegex)];
    
    const foundNumbers = new Set<number>();
    matches.forEach(m => {
      const num = parseInt(m[1], 10);
      if (num >= 1 && num <= 10) foundNumbers.add(num);
    });

    if (foundNumbers.size < 10) {
      const missing = [];
      for(let i=1; i<=10; i++) if(!foundNumbers.has(i)) missing.push(i);
      errors.push(`Faltan los siguientes microtemas numerados: ${missing.join(', ')}.`);
    }

    // Rule 2: At least 50 words per micro-topic
    for (let i = 1; i <= 10; i++) {
      const instances = matches.filter(m => parseInt(m[1], 10) === i);
      let maxWordsInTopic = 0;
      let foundLongEnough = false;
      
      for (const instance of instances) {
        const nextMatch = matches.find(m => m.index! > instance.index!);
        const start = instance.index! + instance[0].length;
        const end = nextMatch ? nextMatch.index! : t.length;
        
        const content = t.substring(start, end).trim();
        const contentWords = content.split(/\s+/).filter(w => w.length > 0).length;
        if (contentWords > maxWordsInTopic) maxWordsInTopic = contentWords;
        
        if (contentWords >= 50) {
          foundLongEnough = true;
          break;
        }
      }
      
      if (!foundLongEnough && foundNumbers.has(i)) {
        errors.push(`El microtema ${i} solo tiene ${maxWordsInTopic} palabras (mínimo 50).`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const validationResult = useMemo(() => checkValidity(pastedLesson), [pastedLesson]);
  const isValid = validationResult.isValid;

  const validatePastedLesson = () => {
    if (!isValid) {
      setValidationError("No se detecta que la lección esté completa. Por favor regresa a la lección en Gemini-Guided Learning y copia la guía de estudio completa antes de continuar con el examen.");
      return false;
    }
    return true;
  };

  const handleStartVerification = async () => {
    if (microtemas.length === 0) {
      alert("Aún se están preparando los temas de estudio. Por favor espera un momento.");
      return;
    }

    setVerificationStep('checking');
    try {
      const history = await getClassChatHistory(lessonDbId!, user.username);
      if (history && history.chat_history) {
        setSavedGeminiLesson(history.chat_history);
        setVerificationStep('review');
      } else {
        setVerificationStep('paste');
      }
    } catch (e) {
      console.error("Error checking gemini_lesson history:", e);
      setVerificationStep('paste');
    }
  };

  const handleContinueToExam = async () => {
    if (verificationStep === 'paste') {
      if (!validatePastedLesson()) return;
      
      setVerificationStep('validating');
      try {
        await saveClassChatHistory(lessonDbId!, user.username, pastedLesson);
      } catch (e) {
        console.error("Error saving gemini_lesson history:", e);
      }
    }

    // Marcar lección como "En Progreso" al iniciar el examen
    try {
      const updatedLesson = { ...lesson, lesson_status: 'En Progreso' as any };
      await updateLessonInStudent(user.username, updatedLesson);
    } catch (e) {
      console.error("Error al actualizar estatus a En Progreso:", e);
    }
    
    setShowExam(true);
  };

  if (showExam) {
    return (
      <div className="fixed inset-0 bg-indigo-900/90 backdrop-blur-md z-[2000] flex items-center justify-center p-6">
        <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3.5rem] w-full max-w-2xl shadow-2xl border-8 border-indigo-50 dark:border-indigo-800 flex flex-col max-h-[90vh] animate-in zoom-in duration-300 relative overflow-y-auto">
          <button 
            onClick={() => setShowExam(false)}
            className="absolute top-6 right-6 w-10 h-10 bg-indigo-50 dark:bg-indigo-800 text-indigo-400 hover:text-red-500 rounded-full flex items-center justify-center transition-colors z-10"
          >
            <XCircle size={24} />
          </button>
          <ExamComponent 
            lesson={lesson} 
            lessonDbId={lessonDbId || ''}
            microtemas={microtemas}
            studentId={user.id || user.username} 
            studentUsername={user.username}
            onFinish={(grade) => {
              if (onLessonAccredited) onLessonAccredited(grade);
              onClose();
            }}
            onClose={() => setShowExam(false)}
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-indigo-900/90 backdrop-blur-md z-[2000] flex items-center justify-center p-6">
        <div className="bg-white dark:bg-indigo-900 p-10 rounded-[3.5rem] w-full max-w-lg shadow-2xl border-8 border-red-50 text-center">
          <XCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
          <h2 className="text-2xl font-black text-red-600 uppercase mb-4">Error</h2>
          <p className="text-indigo-400 font-bold mb-8">{error}</p>
          <button onClick={onClose} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl uppercase">Cerrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-indigo-900/90 backdrop-blur-md z-[2000] flex items-center justify-center p-6">
      <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3.5rem] w-full max-w-2xl shadow-2xl border-8 border-indigo-50 dark:border-indigo-800 flex flex-col max-h-[90vh] animate-in zoom-in duration-300 relative">
        {/* Botón Cerrar Superior Derecha */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 w-10 h-10 bg-indigo-50 dark:bg-indigo-800 text-indigo-400 hover:text-red-500 rounded-full flex items-center justify-center transition-colors z-10"
        >
          <XCircle size={24} />
        </button>

        {isLoading || verificationStep === 'checking' || verificationStep === 'validating' ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
            <h2 className="text-2xl font-black text-indigo-900 dark:text-white uppercase">
              {verificationStep === 'checking' ? 'Verificando lección guardada...' : 
               verificationStep === 'validating' ? 'Validando y guardando lección...' :
               'Preparando tu guía de estudio...'}
            </h2>
            <p className="text-indigo-400 font-bold mt-2">Por favor espera un momento.</p>
          </div>
        ) : verificationStep === 'review' ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="text-center mb-6">
              <BookOpen className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
              <h2 className="text-3xl font-black text-indigo-900 dark:text-white uppercase leading-none">Repaso de Lección</h2>
              <p className="text-indigo-400 dark:text-indigo-300 font-bold mt-2 text-sm">Ya tienes una lección guardada. Repásala antes del examen.</p>
            </div>
            <div className="flex-1 overflow-y-auto bg-indigo-50 dark:bg-indigo-950 p-6 rounded-[2.5rem] border-4 border-indigo-100 dark:border-indigo-800 mb-6 shadow-inner">
              <div className="prose dark:prose-invert max-w-none text-indigo-900 dark:text-indigo-100 whitespace-pre-wrap font-medium">
                {savedGeminiLesson}
              </div>
            </div>
            <div className="flex space-x-4">
              <button 
                onClick={() => setVerificationStep('paste')}
                className="flex-1 bg-indigo-100 text-indigo-600 font-black py-4 rounded-2xl uppercase text-xs hover:bg-indigo-200 transition-all"
              >
                Actualizar Lección
              </button>
              <button 
                onClick={handleContinueToExam}
                className="flex-[2] bg-green-500 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-green-600 transition-all uppercase text-xs"
              >
                Continuar al Examen
              </button>
            </div>
          </div>
        ) : verificationStep === 'paste' ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="text-center mb-6">
              <ClipboardCheck className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
              <h2 className="text-3xl font-black text-indigo-900 dark:text-white uppercase leading-none">Validación de Lección</h2>
              <p className="text-indigo-400 dark:text-indigo-300 font-bold mt-2 text-sm">Pega aquí la lección completa que tomaste con Gemini.</p>
            </div>
            
            {pastedLesson.trim().length > 0 && !isValid && (
              <div className="bg-red-50 border-2 border-red-200 p-4 rounded-2xl mb-4 flex items-start space-x-3 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
                <div className="text-red-600 text-xs font-bold leading-tight">
                  {!showDetailedError ? (
                    <p>
                      No se detecta que la lección esté completa.<br/>
                      Por favor regresa a la lección en Gemini-Guided Learning y copia la guía de estudio completa antes de continuar con el examen.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      <p className="underline mb-1">Motivos de validación fallida:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {validationResult.errors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 mb-6">
              <textarea 
                value={pastedLesson}
                onChange={(e) => {
                  setPastedLesson(e.target.value);
                  setValidationError(null);
                }}
                placeholder="Pega aquí el contenido de tu lección..."
                className="w-full h-full bg-white dark:bg-indigo-950 p-6 rounded-[2.5rem] border-4 border-indigo-100 dark:border-indigo-800 focus:border-indigo-600 outline-none resize-none font-medium text-indigo-900 dark:text-indigo-100 shadow-inner"
              />
            </div>

            <div className="flex space-x-4">
              <button 
                onClick={() => setVerificationStep('none')}
                className="flex-1 bg-indigo-100 text-indigo-600 font-black py-4 rounded-2xl uppercase text-xs hover:bg-indigo-200 transition-all"
              >
                Volver
              </button>
              <button 
                onClick={handleContinueToExam}
                disabled={!isValid}
                className={`flex-[2] bg-green-500 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-green-600 transition-all uppercase text-xs disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Continuar al Examen
              </button>
            </div>
            <p 
              onDoubleClick={() => setShowDetailedError(!showDetailedError)}
              className="text-center text-[10px] font-bold text-indigo-400 mt-4 uppercase cursor-help select-none"
              title="Doble clic para ver detalles de validación"
            >
              Palabras detectadas: {pastedLesson.trim() === '' ? 0 : pastedLesson.trim().split(/\s+/).length} / 500 mínimo
            </p>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">📖</div>
              <h2 className="text-3xl font-black text-indigo-900 dark:text-white uppercase leading-none">Guía de Estudio</h2>
              <p className="text-indigo-400 dark:text-indigo-300 font-bold mt-2 text-sm">Revisa los temas antes de comenzar la evaluación.</p>
            </div>

            <div className="flex-1 overflow-y-auto bg-white dark:bg-indigo-950 p-8 rounded-[2.5rem] border-4 border-indigo-50 dark:border-indigo-800 mb-8 shadow-inner">
              <div className="space-y-8">
                {/* Materia - Font más grande */}
                <div className="border-b-4 border-indigo-50 dark:border-indigo-900 pb-4">
                  <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">Materia</p>
                  <h3 className="text-4xl font-black text-indigo-600 dark:text-indigo-400 uppercase leading-none">
                    {lesson.subject}
                  </h3>
                </div>

                {/* Lección - Font mediano */}
                <div>
                  <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">Lección {lessonInfo.number}</p>
                  <h4 className="text-xl font-black text-indigo-900 dark:text-white uppercase leading-tight">
                    {lessonInfo.description}
                  </h4>
                  <p className="text-[10px] font-black text-amber-600 uppercase mt-2 bg-amber-50 dark:bg-amber-900/20 w-fit px-3 py-1 rounded-full border border-amber-100 dark:border-amber-800">
                    Tiempo de estudio: {lesson.durationMinutes} MINUTOS
                  </p>
                </div>

                {/* Temas a aprender */}
                <div className="space-y-6 pt-4">
                  <p className="text-xs font-black text-indigo-400 uppercase tracking-widest border-l-4 border-indigo-600 pl-3">
                    Temas a aprender
                  </p>
                  <div className="grid gap-6">
                    {microtemas.map((m, i) => (
                      <div key={i} className="bg-indigo-50/50 dark:bg-indigo-900/20 p-5 rounded-3xl border-2 border-indigo-50 dark:border-indigo-900/50">
                        <div className="flex items-start space-x-4">
                          <span className="flex-shrink-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-black text-sm">
                            {i + 1}
                          </span>
                          <div className="space-y-2">
                            {/* Titulo microtema - Body negrita */}
                            <p className="text-base font-bold text-indigo-900 dark:text-white leading-tight">
                              {m.titulo}
                            </p>
                            {/* Descripción microtema - Body normal */}
                            <p className="text-sm text-indigo-600 dark:text-indigo-300 font-medium leading-relaxed">
                              {m.contenido}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button 
                onClick={handleCopy}
                className={`relative font-black py-4 rounded-2xl shadow-md transition-all uppercase text-[10px] flex items-center justify-center space-x-2 ${
                  isCopied ? 'bg-green-100 text-green-600' : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                }`}
              >
                <Copy size={16} />
                <span>{isCopied ? '¡Contenido Copiado!' : 'Copiar Lección a Porta-Papeles'}</span>
              </button>

              <button 
                onClick={handleStartVerification}
                className={`bg-green-500 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-green-600 transition-all uppercase text-[10px] flex items-center justify-center space-x-2 ${microtemas.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <BrainCircuit size={16} />
                <span>Iniciar evaluación de la lección</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StudyGuideModal;
