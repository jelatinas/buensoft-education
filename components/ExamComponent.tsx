import React, { useState, useEffect, useCallback } from 'react';
import { Lesson, Microtema, Pregunta, RespuestaEstudiante, ClassExamQuestion } from '../types';
import { 
  createIntentoExamen, 
  saveRespuestasEstudianteBatch, 
  updateIntentoExamen,
  updateLessonGradeAndStatus,
  executeCreditTransfer,
  saveRespuestaEstudiante,
  getRespuestasByIntento,
  updateRespuestaEstudiante,
  getUnansweredQuestionsForClass,
  saveNewClassExamQuestions,
  saveStudentExamAnswer
} from '../storage2';
import { evaluateOpenAnswerAI, shuffleOptions, evaluateBatchOpenAnswersAI, OpenAnswerEvaluation, BatchOpenAnswerResult, generateClassExamQuestions } from '../geminiService2';
import { Loader2, CheckCircle2, XCircle, ArrowRight, ArrowLeft, Send, BrainCircuit, RefreshCcw, Clock } from 'lucide-react';
// @ignore
import ReactMarkdown from 'react-markdown';
// @ignore
import remarkGfm from 'remark-gfm';
// @ignore
import rehypeRaw from 'rehype-raw';

interface ExamComponentProps {
  lesson: Lesson;
  lessonDbId: string;
  microtemas: Microtema[];
  studentId: string;
  studentUsername: string;
  chatHistory?: any[];
  onFinish: (grade: number) => void;
  onClose: () => void;
  onReady?: () => void;
}

const ExamComponent: React.FC<ExamComponentProps> = ({ lesson, lessonDbId, microtemas, studentId, studentUsername, chatHistory, onFinish, onClose, onReady }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [questions, setQuestions] = useState<Pregunta[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [intentoId, setIntentoId] = useState<string | number | null>(null);

  useEffect(() => {
    const initIntento = async () => {
      if (studentId && lessonDbId && !intentoId) {
        try {
          const id = await createIntentoExamen(studentId, lessonDbId);
          setIntentoId(id);
        } catch (err) {
          console.error("Error creating initial intento:", err);
        }
      }
    };
    initIntento();
  }, [studentId, lessonDbId]);
  const [isFinishing, setIsFinishing] = useState(false);
  const [result, setResult] = useState<{ 
    grade: number, 
    correctCount: number, 
    total: number, 
    failedMicrotemas: Microtema[],
    failedQuestions: Pregunta[]
  } | null>(null);
  const [showReinforcement, setShowReinforcement] = useState(false);

  const [isShowingFeedback, setIsShowingFeedback] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<{ isCorrect: boolean, explanation: string, status?: 'correcta' | 'parcialmente_correcta' | 'incorrecta' } | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [questionResults, setQuestionResults] = useState<Record<string, number>>({});
  const [openQuestionFeedbacks, setOpenQuestionFeedbacks] = useState<Record<string, OpenAnswerEvaluation>>({});

  const [isReviewingOpenQuestions, setIsReviewingOpenQuestions] = useState(false);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [openQuestionsToReview, setOpenQuestionsToReview] = useState<Pregunta[]>([]);

  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [cheatWarning, setCheatWarning] = useState<string | null>(null);

  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isTimerActive, setIsTimerActive] = useState(false);

  const calculateTimeForQuestion = (q: Pregunta) => {
    const wordCount = q.pregunta.trim().split(/\s+/).length;
    if (q.tipo === 'multiple_choice') {
      return (wordCount * 3) + 10;
    } else if (q.tipo === 'true_false') {
      return (wordCount * 2) + 10;
    } else if (q.tipo === 'open') {
      return (wordCount * 5) + 20;
    }
    return wordCount * 3;
  };

  useEffect(() => {
    if (!microtemas || microtemas.length === 0) {
      console.log("Esperando microtemas...");
      return;
    }

    const initExam = async () => {
      setIsLoading(true);
      setErrorDetails(null);
      // Reset states for a fresh start - critical to clear answers to prevent pre-selection bug
      setQuestions([]);
      setCurrentQuestionIndex(0);
      setAnswers({});
      setQuestionResults({});
      setOpenQuestionFeedbacks({});
      setIsReviewingOpenQuestions(false);
      setCurrentReviewIndex(0);
      setOpenQuestionsToReview([]);
      setIsShowingFeedback(false);
      setCurrentFeedback(null);
      setResult(null);
      setShowReinforcement(false);
      setIntentoId(null); // Force fresh intento on each exam attempt

      
      console.log(`Iniciando examen (Intento ${retryCount + 1}) para lección DB ID:`, lessonDbId);
      console.log("Microtemas recibidos:", microtemas);
      
      try {
        if (!lessonDbId) {
          throw new Error("No se proporcionó un ID de lección válido.");
        }

        if (!lessonDbId) {
          throw new Error("No se proporcionó un ID de lección válido.");
        }

        let freshQuestions = await getUnansweredQuestionsForClass(studentId, lessonDbId);
        console.log(`Se encontraron ${freshQuestions.length} preguntas sin responder en la BD.`);

        const mcqCount = freshQuestions.filter(q => q.tipo === 'multiple_choice').length;
        const openCount = freshQuestions.filter(q => q.tipo === 'open').length;
        const tfCount = freshQuestions.filter(q => q.tipo === 'true_false').length;
        
        const neededMCQ = Math.max(0, 4 - mcqCount);
        const neededOpen = Math.max(0, 4 - openCount);
        const neededTF = Math.max(0, 2 - tfCount);

        if (neededMCQ > 0 || neededOpen > 0 || neededTF > 0) {
          console.log(`Generando déficit con AI: ${neededMCQ} MCQ, ${neededOpen} Open, ${neededTF} TF`);
          try {
            const aiPreguntas = await generateClassExamQuestions(lesson.subject, lesson.title, microtemas, neededMCQ, neededOpen, neededTF);
            if (aiPreguntas && aiPreguntas.length > 0) {
              const toSave = aiPreguntas.map((q: any) => ({
                class_id: lessonDbId,
                tipo: q.tipo,
                pregunta: q.pregunta,
                respuesta_correcta: q.respuesta_correcta,
                explicacion: q.explicacion,
                opciones: q.opciones || null
              }));
              const savedQuestions = await saveNewClassExamQuestions(toSave);
              freshQuestions = [...freshQuestions, ...savedQuestions];
            }
          } catch (e) {
            console.error("Error generando nuevas preguntas con IA:", e);
          }
        }
        
        // Ensure exactly 10 questions of correct types
        const finalMCQ = freshQuestions.filter(q => q.tipo === 'multiple_choice').slice(0, 4);
        const finalOpen = freshQuestions.filter(q => q.tipo === 'open').slice(0, 4);
        const finalTF = freshQuestions.filter(q => q.tipo === 'true_false').slice(0, 2);
        
        let finalQuestions = [...finalMCQ, ...finalOpen, ...finalTF];
        
        // Shuffle the 10 questions
        finalQuestions = finalQuestions.sort(() => 0.5 - Math.random());
        
        // Shuffle the options of multiple_choice questions if needed
        finalQuestions = finalQuestions.map(q => {
          if (q.tipo === 'multiple_choice' && q.opciones && Array.isArray(q.opciones)) {
            return { ...q, opciones: shuffleOptions([...q.opciones]) };
          }
          return q;
        });

        console.log(`Seleccionadas ${finalQuestions.length} preguntas para el examen de acreditación.`);
        
        if (finalQuestions.length > 0) {
          setQuestions(finalQuestions as any[]); // Cast to any array to bypass strict type checking temporarily
        } else {
          setErrorDetails("No se encontraron preguntas en la base de datos ni se pudieron generar nuevas. Por favor, intenta de nuevo.");
        }
        
      } catch (error: any) {
        console.error("Error al iniciar examen:", error);
        setErrorDetails(error.message || "Error desconocido al iniciar el examen.");
      } finally {
        setIsLoading(false);
        if (onReady) onReady();
      }
    };
    
    initExam();
  }, [lessonDbId, studentId, microtemas, retryCount]);

  const handleAnswerChange = (questionId: string, answer: string) => {
    if (isShowingFeedback) return; // Bloquear cambios si se está mostrando feedback
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleCheckAnswer = useCallback(async (isTimeOut = false) => {
    const q = questions[currentQuestionIndex];
    if (!q) return;
    
    const studentAnswer = answers[q.id] || "";
    
    setIsEvaluating(true);
    setIsTimerActive(false); // Stop timer when evaluating
    let isCorrect = false;
    let score = 0;
    let status: 'correcta' | 'parcialmente_correcta' | 'incorrecta' = 'incorrecta';
    let explanation = q.explicacion || "Sin explicación disponible.";
    
    try {
      if (isTimeOut) {
        isCorrect = false;
        score = 0;
        status = 'incorrecta';
        explanation = `¡TIEMPO AGOTADO! ⏰ La respuesta correcta era: ${q.respuesta_correcta}. ${q.explicacion || ""}`;
        // Actualizar el estado de respuestas para el guardado final
        setAnswers(prev => ({ ...prev, [q.id]: "[TIEMPO AGOTADO]" }));
      } else {
        if (q.tipo === 'multiple_choice') {
          isCorrect = studentAnswer === q.respuesta_correcta;
          score = isCorrect ? 1 : 0;
          status = isCorrect ? 'correcta' : 'incorrecta';
        } else if (q.tipo === 'true_false') {
          const normalize = (s: string) => {
            const lower = s.toLowerCase().trim();
            if (lower === 'true' || lower === 'verdadero') return 'verdadero';
            if (lower === 'false' || lower === 'falso') return 'falso';
            return lower;
          };
          isCorrect = normalize(studentAnswer) === normalize(q.respuesta_correcta);
          score = isCorrect ? 1 : 0;
          status = isCorrect ? 'correcta' : 'incorrecta';
        } else if (q.tipo === 'open') {
          // Las preguntas abiertas se califican al final en lote
          isCorrect = true; // Marcamos como "completada" para el flujo
          score = 0; // El score real se calculará al final
          status = 'correcta'; 
          explanation = "Preguntas abiertas se califican al finalizar el exámen";
        }
      }
      
      setQuestionResults(prev => ({ ...prev, [q.id]: score }));
      
      // Guardar respuesta en tiempo real
      if (lessonDbId) {
        saveStudentExamAnswer(
          studentId,
          lessonDbId,
          String(q.id),
          isCorrect,
          studentAnswer
        ).catch(err => console.error("Error saving answer real-time:", err));
      }

      if (q.tipo === 'open' && !isTimeOut) {
        if (currentQuestionIndex < questions.length - 1) {
          setCurrentQuestionIndex(prev => prev + 1);
        } else {
          finishExam();
        }
      } else {
        setCurrentFeedback({
          isCorrect,
          explanation,
          status
        });
        setIsShowingFeedback(true);
      }

      // Eliminamos el guardado inmediato de la respuesta

    } catch (error) {
      console.error("Error al calificar pregunta:", error);
    } finally {
      setIsEvaluating(false);
    }
  }, [questions, currentQuestionIndex, answers, intentoId]);

  // Effect to handle the countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isTimerActive && timeLeft > 0 && !isShowingFeedback && !isEvaluating) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isTimerActive && !isShowingFeedback && !isEvaluating) {
      // Auto-submit when time is up
      handleCheckAnswer(true);
    }
    return () => clearInterval(timer);
  }, [isTimerActive, timeLeft, isShowingFeedback, isEvaluating, handleCheckAnswer]);

  // Effect to reset timer when question changes
  useEffect(() => {
    if (questions.length > 0 && questions[currentQuestionIndex] && !isShowingFeedback && !result && !isEvaluating) {
      const time = calculateTimeForQuestion(questions[currentQuestionIndex]);
      setTimeLeft(time);
      setIsTimerActive(true);
    }
  }, [currentQuestionIndex, questions, isShowingFeedback, result, isEvaluating]);

  // Anti-cheat: Right click and copy/paste detection only
  useEffect(() => {
    if (isLoading || result) return;

    const preventDefault = (e: Event) => e.preventDefault();

    document.addEventListener('contextmenu', preventDefault);
    document.addEventListener('copy', preventDefault);
    document.addEventListener('paste', preventDefault);
    document.addEventListener('selectstart', preventDefault);

    return () => {
      document.removeEventListener('contextmenu', preventDefault);
      document.removeEventListener('copy', preventDefault);
      document.removeEventListener('paste', preventDefault);
      document.removeEventListener('selectstart', preventDefault);
    };
  }, [isLoading, result]);

  const handleNext = () => {
    setCheatWarning(null);
    if (!isShowingFeedback) {
      handleCheckAnswer();
      return;
    }

    if (currentQuestionIndex < questions.length - 1) {
      setIsShowingFeedback(false);
      setCurrentFeedback(null);
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      finishExam();
    }
  };

  const finishExam = async () => {
    if (isFinishing || result) return;
    setIsFinishing(true);
    setErrorDetails(null);
    try {
      console.log("Iniciando finalización del examen...", { studentId, lessonDbId, questionsCount: questions.length });
      
      if (questions.length === 0) {
        throw new Error("No hay preguntas en el examen para calificar.");
      }

      // 1. Identificar y calificar preguntas abiertas en lote
      const openQuestions = questions.filter(q => q.tipo === 'open');
      const openQuestionsData = openQuestions.map(q => ({
        question: q.pregunta,
        expected_answer: q.respuesta_correcta,
        student_answer: answers[String(q.id)] || ""
      }));

      let batchResults: BatchOpenAnswerResult[] = [];
      const openQuestionFeedbacksMap: Record<string, OpenAnswerEvaluation> = {};

      if (openQuestionsData.length > 0) {
        console.log(`Calificando ${openQuestionsData.length} preguntas abiertas en lote...`);
        batchResults = await evaluateBatchOpenAnswersAI(openQuestionsData);
        
        // Mapear resultados de vuelta a los IDs de las preguntas
        openQuestions.forEach((q, idx) => {
          const res = batchResults[idx];
          if (res) {
            openQuestionFeedbacksMap[q.id] = {
              es_correcta: res.result === "Correcta" || res.result === "Parcialmente Correcta",
              explicacion: res.feedback || "",
              feedback: res.feedback || "",
              score: res.result === "Correcta" ? 1 : (res.result === "Parcialmente Correcta" ? 0.5 : 0),
              status: res.result === "Parcialmente Correcta" ? "parcialmente_correcta" : (res.result === "Correcta" ? "correcta" : "incorrecta")
            };
          }
        });
        setOpenQuestionFeedbacks(openQuestionFeedbacksMap);
      }

      let correctCount = 0;
      const failedMicrotemaIds = new Set<string>();
      const failedQuestions: Pregunta[] = [];
      const respuestasParaGuardar: Partial<RespuestaEstudiante>[] = [];
      const updatedQuestionResults = { ...questionResults };
      
      for (const q of questions) {
        let score = updatedQuestionResults[q.id] || 0;
        
        if (q.tipo === 'open') {
          const evalResult = openQuestionFeedbacksMap[q.id];
          if (evalResult) {
            score = evalResult.status === 'parcialmente_correcta' ? 0.5 : (evalResult.es_correcta ? 1 : 0);
            updatedQuestionResults[q.id] = score;
          }
        }

        correctCount += score;
        
        if (score < 1) {
          failedMicrotemaIds.add(String(q.microtema_id));
          failedQuestions.push(q);
        }

        respuestasParaGuardar.push({
          pregunta_id: q.id,
          respuesta: answers[String(q.id)] || "[SIN RESPUESTA]",
          es_correcta: score >= 1
        });
      }
      
      setQuestionResults(updatedQuestionResults);

      const total = questions.length;
      const percentage = (correctCount / total) * 100;
      const grade = Math.round(percentage / 10);
      
      console.log("Persistiendo resultados del examen en la base de datos...");
      
      // 1. Asegurar que el intento existe
      let currentIntentoId = intentoId;
      if (!currentIntentoId) {
        currentIntentoId = await createIntentoExamen(studentId, lessonDbId);
        if (!currentIntentoId) throw new Error("No se pudo obtener un ID para el intento de examen.");
        setIntentoId(currentIntentoId);
      }

      // 2. Guardar respuestas por lote
      const respuestasConIntento = respuestasParaGuardar.map(r => ({
        ...r,
        intento_id: currentIntentoId
      }));

      console.log(`Guardando ${respuestasConIntento.length} respuestas...`);
      await saveRespuestasEstudianteBatch(respuestasConIntento);
      
      // 3. Actualizar calificación del intento
      console.log("Actualizando calificación final del intento...");
      await updateIntentoExamen(String(currentIntentoId), grade);
      
      // 4. Actualizar estatus de la lección del estudiante
      if (lesson.id) {
        console.log("Actualizando estatus de la lección asignada...");
        await updateLessonGradeAndStatus(String(lesson.id), grade);
      }
      
      const failedMicrotemas = (lesson.microtemas || []).filter(m => failedMicrotemaIds.has(String(m.id)));
      
      const finalResult = { grade, correctCount, total, failedMicrotemas, failedQuestions };
      
      if (openQuestions.length > 0) {
        setOpenQuestionsToReview(openQuestions);
        setIsReviewingOpenQuestions(true);
        // Guardamos el resultado pero no lo mostramos aún
        setResult(finalResult);
      } else {
        setResult(finalResult);
        if (grade < 6) {
          setShowReinforcement(true);
        }
      }
      
      console.log("Examen procesado y guardado con éxito. Calificación:", grade);
      
    } catch (error: any) {
      console.error("Error crítico al finalizar examen:", error);
      setErrorDetails(`Error al finalizar el examen: ${error.message || 'Error desconocido'}. Por favor, intenta presionar "Finalizar" de nuevo.`);
    } finally {
      setIsFinishing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
        <h2 className="text-2xl font-black text-indigo-900 dark:text-white uppercase">Preparando Evaluación...</h2>
        <p className="text-indigo-400 font-bold mt-2 text-center max-w-md">
          Estamos seleccionando las mejores preguntas para poner a prueba tus conocimientos.
        </p>
      </div>
    );
  }

  if (isFinishing) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <BrainCircuit className="w-16 h-16 text-indigo-600 animate-pulse mb-6" />
        <h2 className="text-2xl font-black text-indigo-900 dark:text-white uppercase">Calificando...</h2>
        <p className="text-indigo-400 font-bold mt-2 text-center max-w-md">
          Nuestra IA está analizando tus respuestas para darte una calificación justa.
        </p>
      </div>
    );
  }

  if (errorDetails && !isLoading && !result) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <XCircle className="w-16 h-16 text-red-500 mb-6" />
        <h2 className="text-2xl font-black text-indigo-900 dark:text-white uppercase">Error en la Evaluación</h2>
        <p className="text-indigo-400 font-bold mt-2 text-center max-w-md">
          {errorDetails}
        </p>
        <div className="flex space-x-4 mt-8">
          <button 
            onClick={() => {
              setErrorDetails(null);
              if (currentQuestionIndex === questions.length - 1 && isShowingFeedback) {
                finishExam();
              } else {
                setRetryCount(prev => prev + 1);
              }
            }} 
            className="bg-indigo-600 text-white font-black px-8 py-3 rounded-xl uppercase flex items-center space-x-2"
          >
            <RefreshCcw size={18} />
            <span>Reintentar</span>
          </button>
          <button onClick={onClose} className="bg-indigo-100 text-indigo-600 font-black px-8 py-3 rounded-xl uppercase">
            Volver a la Guía
          </button>
        </div>
      </div>
    );
  }

  if (isReviewingOpenQuestions) {
    const q = openQuestionsToReview[currentReviewIndex];
    const feedback = openQuestionFeedbacks[q.id];
    
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-black text-indigo-900 dark:text-white uppercase">Revisión de Respuestas Abiertas</h2>
          <p className="text-indigo-400 font-bold">Pregunta {currentReviewIndex + 1} de {openQuestionsToReview.length}</p>
        </div>

        <div className="bg-white dark:bg-indigo-950 p-8 rounded-[2.5rem] border-4 border-indigo-50 dark:border-indigo-800 shadow-xl">
          <div className="prose dark:prose-invert max-w-none mb-6">
            <h3 className="text-lg font-black text-indigo-900 dark:text-white mb-2">Pregunta:</h3>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {q.pregunta}
            </ReactMarkdown>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-black text-indigo-900 dark:text-white mb-2">Tu Respuesta:</h3>
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl border border-indigo-100 dark:border-indigo-800 text-indigo-900 dark:text-white italic">
              {answers[String(q.id)] || "[Sin respuesta]"}
            </div>
          </div>

          {feedback && (
            <div className={`p-6 rounded-2xl border-2 ${
              feedback.status === 'correcta' 
                ? 'bg-green-50 border-green-100 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300' 
                : feedback.status === 'parcialmente_correcta'
                ? 'bg-amber-50 border-amber-100 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300'
                : 'bg-red-50 border-red-100 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {feedback.status === 'correcta' ? <CheckCircle2 size={20} /> : feedback.status === 'parcialmente_correcta' ? <RefreshCcw size={20} /> : <XCircle size={20} />}
                <span className="font-black uppercase text-sm">
                  Calificación: {feedback.status.replace('_', ' ')} ({feedback.score}%)
                </span>
              </div>
              <p className="font-bold">{feedback.explicacion}</p>
            </div>
          )}

          <button
            onClick={() => {
              if (currentReviewIndex < openQuestionsToReview.length - 1) {
                setCurrentReviewIndex(prev => prev + 1);
              } else {
                setIsReviewingOpenQuestions(false);
                if (result && result.grade < 6) {
                  setShowReinforcement(true);
                }
              }
            }}
            className="w-full mt-8 bg-indigo-600 text-white font-black py-4 rounded-2xl uppercase shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center space-x-2"
          >
            <span>{currentReviewIndex < openQuestionsToReview.length - 1 ? 'Siguiente Revisión' : 'Ver Resultado Final'}</span>
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="text-center">
          <div className={`text-7xl font-black mb-4 ${result.grade >= 6 ? 'text-green-500' : 'text-red-500'}`}>
            {result.grade}
          </div>
          <h2 className="text-3xl font-black text-indigo-900 dark:text-white uppercase leading-none">
            {result.grade >= 6 ? '¡Lección Acreditada!' : 'Necesitas Refuerzo'}
          </h2>
          <p className="text-indigo-400 font-bold mt-4">
            Acertaste {result.correctCount} de {result.total} preguntas ({Math.round((result.correctCount / result.total) * 100)}%).
          </p>
        </div>

        {result.grade >= 6 ? (
          <div className="bg-green-50 dark:bg-green-900/20 p-8 rounded-[2.5rem] border-4 border-green-100 dark:border-green-800 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <p className="text-green-700 dark:text-green-300 font-bold text-lg">
              La lección ha sido acreditada correctamente. ¡Excelente trabajo!
            </p>
            <button 
              onClick={() => onFinish(result.grade)}
              className="mt-8 bg-green-500 text-white font-black px-12 py-4 rounded-2xl uppercase shadow-xl hover:bg-green-600 transition-all"
            >
              Finalizar y Continuar
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-red-50 dark:bg-red-900/20 p-8 rounded-[2.5rem] border-4 border-red-100 dark:border-red-800 text-center">
              <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <p className="text-red-700 dark:text-red-300 font-bold text-lg">
                No has alcanzado la calificación mínima. Vamos a repasar los temas que te costaron más.
              </p>
            </div>

            {showReinforcement && (
              <div className="space-y-6">
                <h3 className="text-xl font-black text-indigo-900 dark:text-white uppercase border-l-4 border-indigo-600 pl-4">
                  Tutorial de Refuerzo
                </h3>
                <div className="grid gap-4">
                  {result.failedQuestions.map((q, i) => (
                    <div key={i} className="bg-white dark:bg-indigo-950 p-6 rounded-3xl border-2 border-indigo-50 dark:border-indigo-800 shadow-sm">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center shrink-0">
                          <BrainCircuit className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-black text-indigo-900 dark:text-white mb-2">{q.pregunta}</p>
                          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-800">
                            <p className="text-xs font-black text-amber-600 uppercase mb-1">Tutorial de Refuerzo</p>
                            <p className="text-sm font-bold text-amber-900 dark:text-amber-200">{q.explicacion || "Repasa este tema en la lección principal."}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                  <button 
                    onClick={() => {
                      setResult(null);
                      setShowReinforcement(false);
                      setCurrentQuestionIndex(0);
                      setAnswers({});
                      setRetryCount(prev => prev + 1);
                    }}
                    className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl uppercase shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center space-x-3"
                  >
                    <RefreshCcw size={20} />
                    <span>Nuevo examen</span>
                  </button>
                  
                  <button 
                    onClick={onClose}
                    className="w-full bg-white dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border-2 border-indigo-600 dark:border-indigo-400 font-black py-5 rounded-2xl uppercase shadow-xl hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-all flex items-center justify-center space-x-3"
                  >
                    <ArrowLeft size={20} />
                    <span>Volver a la Guía</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  if (!currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <XCircle className="w-16 h-16 text-red-500 mb-6" />
        <h2 className="text-2xl font-black text-indigo-900 dark:text-white uppercase">No hay preguntas disponibles</h2>
        <p className="text-indigo-400 font-bold mt-2 text-center max-w-md">
          {errorDetails || "Hubo un problema al cargar las preguntas. Por favor, intenta de nuevo."}
        </p>
        <div className="flex space-x-4 mt-8">
          <button 
            onClick={() => setRetryCount(prev => prev + 1)} 
            className="bg-indigo-600 text-white font-black px-8 py-3 rounded-xl uppercase flex items-center space-x-2"
          >
            <RefreshCcw size={18} className={isLoading ? "animate-spin" : ""} />
            <span>Reintentar</span>
          </button>
          <button onClick={onClose} className="bg-indigo-100 text-indigo-600 font-black px-8 py-3 rounded-xl uppercase">
            Volver a la Guía
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-right duration-300 select-none">
      {/* Anti-cheat Warning */}
      {cheatWarning && (
        <div className="bg-red-600 text-white p-4 rounded-2xl font-black uppercase text-center animate-bounce shadow-2xl border-4 border-white shrink-0 mb-4">
          ⚠️ {cheatWarning}
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4 space-y-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">Pregunta</span>
            <span className="bg-indigo-600 text-white text-xs font-black px-3 py-1 rounded-full">
              {currentQuestionIndex + 1} / {questions.length}
            </span>
          </div>

          {/* Temporizador */}
          {!isShowingFeedback && !isEvaluating && (
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border-2 transition-all duration-300 ${
              timeLeft <= 5 
                ? 'border-red-500 bg-red-50 text-red-600 animate-pulse' 
                : 'border-indigo-100 bg-indigo-50 text-indigo-600'
            }`}>
              <Clock size={14} className={timeLeft <= 5 ? 'animate-spin-slow' : ''} />
              <span className="text-xs font-black tracking-tighter w-6 text-center">{timeLeft}s</span>
            </div>
          )}
        </div>
        
        <div className="h-2 flex-1 mx-4 bg-indigo-50 dark:bg-indigo-900 rounded-full overflow-hidden">
          <div 
            className="h-full bg-indigo-600 transition-all duration-500" 
            style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
        
        <button 
          onClick={onClose}
          className="text-indigo-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
          title="Salir del examen"
        >
          <XCircle size={28} />
        </button>
      </div>

      <div className="bg-white dark:bg-indigo-950 p-8 rounded-[2.5rem] border-4 border-indigo-50 dark:border-indigo-800 shadow-xl">
        <div className="prose dark:prose-invert max-w-none mb-8">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {currentQuestion.pregunta}
          </ReactMarkdown>
        </div>

        {currentQuestion.tipo === 'multiple_choice' && (
          <div className="grid gap-4">
            {currentQuestion.opciones?.map((oStr: string, i: number) => {
              const isSelected = answers[String(currentQuestion.id)] === oStr;
              const isCorrect = oStr === currentQuestion.respuesta_correcta;
              
              let buttonClass = 'border-indigo-50 dark:border-indigo-900 hover:border-indigo-200 text-indigo-600 dark:text-indigo-400';
              let iconClass = 'bg-indigo-50 dark:bg-indigo-900 text-indigo-400';

              if (isShowingFeedback) {
                if (isCorrect) {
                  buttonClass = 'border-green-500 bg-green-50 dark:bg-green-900/40 text-green-900 dark:text-white';
                  iconClass = 'bg-green-500 text-white';
                } else if (isSelected) {
                  buttonClass = 'border-red-500 bg-red-50 dark:bg-red-900/40 text-red-900 dark:text-white';
                  iconClass = 'bg-red-500 text-white';
                } else {
                  buttonClass = 'border-indigo-50 dark:border-indigo-900 opacity-50 text-indigo-300';
                  iconClass = 'bg-indigo-50 dark:bg-indigo-900 text-indigo-200';
                }
              } else if (isSelected) {
                buttonClass = 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-900 dark:text-white';
                iconClass = 'bg-indigo-600 text-white';
              }

              return (
                <button
                  key={i}
                  onClick={() => handleAnswerChange(String(currentQuestion.id), oStr)}
                  disabled={isShowingFeedback}
                  className={`w-full text-left p-5 rounded-2xl border-2 transition-all flex items-center space-x-4 ${buttonClass}`}
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${iconClass}`}>
                    {isShowingFeedback && isCorrect ? <CheckCircle2 size={16} /> : isShowingFeedback && isSelected && !isCorrect ? <XCircle size={16} /> : String.fromCharCode(65 + i)}
                  </span>
                  <span className="font-bold">{oStr}</span>
                </button>
              );
            })}
          </div>
        )}

        {currentQuestion.tipo === 'true_false' && (
          <div className="grid grid-cols-2 gap-4">
            {['Verdadero', 'Falso'].map((val) => {
              const normalize = (s: string) => {
                const lower = (s || '').toLowerCase().trim();
                if (lower === 'true' || lower === 'verdadero') return 'verdadero';
                if (lower === 'false' || lower === 'falso') return 'falso';
                return lower;
              };
              const isSelected = answers[String(currentQuestion.id)] === val;
              const isCorrect = normalize(val) === normalize(currentQuestion.respuesta_correcta);
              
              let buttonClass = 'border-indigo-50 dark:border-indigo-900 hover:border-indigo-200 text-indigo-600 dark:text-indigo-400';

              if (isShowingFeedback) {
                if (isCorrect) {
                  buttonClass = 'border-green-500 bg-green-50 dark:bg-green-900/40 text-green-900 dark:text-white';
                } else if (isSelected) {
                  buttonClass = 'border-red-500 bg-red-50 dark:bg-red-900/40 text-red-900 dark:text-white';
                } else {
                  buttonClass = 'border-indigo-50 dark:border-indigo-900 opacity-50 text-indigo-300';
                }
              } else if (isSelected) {
                buttonClass = 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-900 dark:text-white';
              }

              return (
                <button
                  key={val}
                  onClick={() => handleAnswerChange(String(currentQuestion.id), val)}
                  disabled={isShowingFeedback}
                  className={`p-6 rounded-2xl border-2 font-black uppercase transition-all flex items-center justify-center space-x-2 ${buttonClass}`}
                >
                  {isShowingFeedback && isCorrect && <CheckCircle2 size={18} />}
                  {isShowingFeedback && isSelected && !isCorrect && <XCircle size={18} />}
                  <span>{val}</span>
                </button>
              );
            })}
          </div>
        )}

        {currentQuestion.tipo === 'open' && (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-100 dark:border-amber-800 flex items-center gap-3">
              <Clock className="text-amber-600 shrink-0" size={20} />
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Preguntas abiertas se califican al finalizar el exámen
              </p>
            </div>
            <textarea
              value={answers[String(currentQuestion.id)] || ""}
              onChange={(e) => handleAnswerChange(String(currentQuestion.id), e.target.value)}
              placeholder="Escribe tu respuesta aquí..."
              disabled={isShowingFeedback}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (answers[String(currentQuestion.id)]?.trim().length > 0 && !isShowingFeedback && !isEvaluating) {
                    handleCheckAnswer();
                  } else if (isShowingFeedback && !isEvaluating) {
                    handleNext();
                  }
                }
              }}
              className={`w-full h-40 p-6 rounded-2xl border-2 bg-indigo-50/30 dark:bg-indigo-900/20 text-indigo-900 dark:text-white font-medium placeholder-indigo-300 focus:border-indigo-600 focus:ring-0 transition-all resize-none ${
                isShowingFeedback ? 'opacity-70 cursor-not-allowed' : 'border-indigo-50 dark:border-indigo-900'
              }`}
            />
          </div>
        )}

        {/* Feedback Section */}
        {isShowingFeedback && currentFeedback && (
          <div className={`mt-8 p-6 rounded-2xl border-2 animate-in slide-in-from-top duration-300 ${
            currentFeedback.status === 'correcta' 
              ? 'bg-green-50 border-green-100 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300' 
              : currentFeedback.status === 'parcialmente_correcta'
              ? 'bg-orange-50 border-orange-100 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-300'
              : 'bg-red-50 border-red-100 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
          }`}>
            <div className="flex items-center space-x-3 mb-3">
              {currentFeedback.status === 'correcta' ? <CheckCircle2 size={24} /> : 
               currentFeedback.status === 'parcialmente_correcta' ? <BrainCircuit size={24} /> : <XCircle size={24} />}
              <span className="font-black uppercase tracking-widest">
                {currentFeedback.status === 'correcta' ? '¡Correcto!' : 
                 currentFeedback.status === 'parcialmente_correcta' ? 'Parcialmente Correcta' : 'Incorrecto'}
              </span>
            </div>
            <div className="prose dark:prose-invert max-w-none text-sm font-bold leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {currentFeedback.explanation}
              </ReactMarkdown>
            </div>
          </div>
        )}
        )}
      </div>
      </div>

      <div className="shrink-0 pt-4 mt-auto">
        <button
          onClick={handleNext}
        disabled={(!answers[String(currentQuestion.id)] && !isShowingFeedback) || isEvaluating}
        className={`w-full py-5 rounded-2xl font-black uppercase shadow-xl transition-all flex items-center justify-center space-x-3 ${
          (!answers[String(currentQuestion.id)] && !isShowingFeedback) || isEvaluating
            ? 'bg-indigo-100 text-indigo-300 cursor-not-allowed'
            : 'bg-indigo-600 text-white hover:bg-indigo-700'
        }`}
      >
        {isEvaluating ? (
          <>
            <Loader2 className="animate-spin" size={20} />
            <span>Evaluando...</span>
          </>
        ) : (
          <>
            <span>
              {isShowingFeedback 
                ? (currentQuestionIndex === questions.length - 1 ? 'Finalizar Examen' : 'Siguiente Pregunta')
                : (currentQuestion.tipo === 'open' ? 'Enviar Respuesta' : 'Calificar Respuesta')}
            </span>
            <ArrowRight size={20} />
          </>
        )}
      </button>
      </div>
    </div>
  );
};

export default ExamComponent;
