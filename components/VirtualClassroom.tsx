import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lesson, ChatMessage } from '../types';
import { updateLessonInStudent, getClassChatHistory, saveClassChatHistory, getClassIdFromLesson, getMicrotemas } from '../storage2';
import { generateTeacherResponse, evaluateStudentAnswer, generateMCQBatch, getAiProvider, setAiProvider } from '../geminiService2';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { XCircle, Loader2, Send, CheckCircle2 } from 'lucide-react';
import ExamComponent from './ExamComponent';

interface VirtualClassroomProps {
  lesson: Lesson;
  user: any;
  onClose: () => void;
  onLessonAccredited?: (grade: number) => void;
  isAdminAudit?: boolean;
  isEmbedded?: boolean;
}

const MarkdownComponents = {
  a: ({ node, ...props }: any) => (
    <a {...props} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-bold" />
  )
};

const processAIResponse = (rawText: string): string => {
  let aiText = rawText;
  let dataMatch = aiText.match(/\[DATA_LOGICA\]([\s\S]*?)\[\/DATA_LOGICA\]/);
  if (!dataMatch) {
      dataMatch = aiText.match(/\[DATA_LOGICA\]([\s\S]*)$/);
  }
  
  if (dataMatch) {
     try {
        let jsonStr = dataMatch[1].trim();
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/```json|```/g, '').trim();
        else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/```/g, '').trim();
        
        const jsonMatch = jsonStr.match(/(\{[\s\S]*?\})/);
        if (jsonMatch) jsonStr = jsonMatch[1];
        
        const data = JSON.parse(jsonStr);
        if (data.type === 'MCQ' && Array.isArray(data.options)) {
           const shuffled = [...data.options];
           for (let i = shuffled.length - 1; i > 0; i--) {
             const j = Math.floor(Math.random() * (i + 1));
             [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
           }
           data.options = shuffled;
        }
        
        const newDataLogica = `[DATA_LOGICA]\n${JSON.stringify(data)}\n[/DATA_LOGICA]`;
        aiText = aiText.replace(dataMatch[0], newDataLogica);
     } catch (e) {
        console.error("Error processing AI response:", e);
     }
  }
  return aiText;
};

const VirtualClassroom: React.FC<VirtualClassroomProps> = ({ lesson, user, onClose, onLessonAccredited, isAdminAudit = false, isEmbedded = false }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Iniciando clase virtual...');
  const [lastSystemInstruction, setLastSystemInstruction] = useState<string>('');
  
  // Timer & Inactivity
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Logic
  const [completedTopics, setCompletedTopics] = useState(0);
  const [correctAnswersForTopic, setCorrectAnswersForTopic] = useState(0);
  const [sessionCompletedTopics, setSessionCompletedTopics] = useState(0);
  const [isShowingFeedback, setIsShowingFeedback] = useState(false);
  const lastInitSignature = useRef("");
  const [showExam, setShowExam] = useState(false);
  const [examReady, setExamReady] = useState(false);
  // Interaction counter for resume mode (when all 10 topics already done)
  const [resumeInteractions, setResumeInteractions] = useState(0);
  const RESUME_INTERACTIONS_REQUIRED = 3;

  const [preloadedMCQs, setPreloadedMCQs] = useState<any[]>([]);
  const [aiProvider, setLocalAiProvider] = useState(getAiProvider());
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const FALLBACK_CHAIN = ['openrouter', 'gemini', 'cerebras'];
  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProv = e.target.value;
    setLocalAiProvider(newProv);
    setAiProvider(newProv);
  };
  const currentTopicForPreloadRef = useRef<number>(-1);
  const lastAskedMCQExplanationRef = useRef<string>("");

  // MCQ selections: track which option was chosen per message index
  const [mcqSelections, setMcqSelections] = useState<Record<number, { selected: string; correct: string }>>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const masterLeccionIdRef = useRef<string | null>(null);
  const isResumingRef = useRef(false);
  // Refs for stable values inside streaming callbacks
  const completedTopicsRef = useRef(completedTopics);
  const correctAnswersRef = useRef(correctAnswersForTopic);
  const resumeInteractionsRef = useRef(resumeInteractions);
  const secondsRef = useRef(secondsElapsed);
  useEffect(() => { completedTopicsRef.current = completedTopics; }, [completedTopics]);
  useEffect(() => { correctAnswersRef.current = correctAnswersForTopic; }, [correctAnswersForTopic]);
  useEffect(() => { resumeInteractionsRef.current = resumeInteractions; }, [resumeInteractions]);
  useEffect(() => { secondsRef.current = secondsElapsed; }, [secondsElapsed]);

  // Preload MCQs whenever the topic changes or we enter review mode
  useEffect(() => {
    if (isAdminAudit || !lesson.microtemas || lesson.microtemas.length === 0) return;
    
    const signature = `${lesson.id}-${user.username}-${lesson.lesson_status}`;
    if (lastInitSignature.current === signature) return;
    lastInitSignature.current = signature;
    const currentTopicIndex = completedTopics >= 10 ? 9 : completedTopics;
    
    // Ignore if already preloaded for this topic/mode
    if (currentTopicForPreloadRef.current === completedTopics) return;
    
    // Ignore if we already have questions queued
    if (preloadedMCQs.length > 0) return;

    const preload = async () => {
      currentTopicForPreloadRef.current = completedTopics;
      const isRev = completedTopics >= 10;
      const currentTopic = lesson.microtemas?.[currentTopicIndex];
      try {
        const mcqs = await generateMCQBatch(lesson, user.username, currentTopic, isRev);
        if (mcqs && mcqs.length > 0) {
           setPreloadedMCQs(mcqs);
        }
      } catch (e) {
        console.error("Failed to preload MCQs", e);
      }
    };
    preload();
  }, [completedTopics, lesson, user.username, isAdminAudit]);
  
  // Rule of 5 min penalty if failed before
  const isRetrying = lesson.lesson_status === 'Reprobada';
  const PENALTY_MINUTES = 5;
  const penaltySecondsRequired = isRetrying ? PENALTY_MINUTES * 60 : 0;
  
  useEffect(() => {
    // Inactivity listener
    const resetInactivity = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      
      if (isPaused && document.visibilityState === 'visible') {
         setIsPaused(false);
      }
      
      if (!showExam) {
        inactivityTimerRef.current = setTimeout(() => {
          setIsPaused(true);
          setSecondsElapsed(prev => Math.max(0, prev - 180));
        }, 180000); // 3 minutes of inactivity -> pause
      }
    };
    
    const blurTimeoutRef = { current: null as NodeJS.Timeout | null };
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
         blurTimeoutRef.current = setTimeout(() => setIsPaused(true), 10000);
      } else {
         if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
         setIsPaused(false);
      }
    };

    window.addEventListener('mousemove', resetInactivity);
    window.addEventListener('keydown', resetInactivity);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    resetInactivity();
    
    return () => {
      window.removeEventListener('mousemove', resetInactivity);
      window.removeEventListener('keydown', resetInactivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, [isPaused, showExam]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (!isPaused && !showExam && !isAdminAudit) {
      timer = setInterval(() => {
        setSecondsElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isPaused, showExam, isAdminAudit]);

  useEffect(() => {
    const initChat = async () => {
      try {
        let history = lesson.chatHistory || [];
        
        const mId = await getClassIdFromLesson(lesson);
        masterLeccionIdRef.current = mId;
        
        if (mId && (!lesson.microtemas || lesson.microtemas.length === 0)) {
           lesson.microtemas = await getMicrotemas(mId);
        }

        if (!isAdminAudit && history.length === 0 && mId) {
          const dbHistory = await getClassChatHistory(mId, user.username);
          if (dbHistory && dbHistory.chat_history) {
            try {
              history = JSON.parse(dbHistory.chat_history);
            } catch (e) {
              console.error("Error parsing history", e);
            }
          }
        }
        
        // Reset local stats if there's genuinely no history (new attempt)
        if (history.length === 0) {
           setSecondsElapsed(0);
           setCompletedTopics(0);
        } else {
           setSecondsElapsed(lesson.elapsedSeconds || 0);
           setCompletedTopics(lesson.completedTopicsCount || 0);
           isResumingRef.current = true;
           setTimeout(() => {
             messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
           }, 500);
        }

        setMessages(history);
        
        if (!isAdminAudit) {
          if (history.length === 0) {
             // Fresh start - stream first teacher message
             const topic = lesson.microtemas?.[0];
             const streamingMsg: ChatMessage = { role: 'model', parts: [{ text: 'El profesor está escribiendo...' }], timestamp: new Date().toISOString(), isStreaming: true };
             setMessages([streamingMsg]);
             let responseText = "";
             let currentProvider = aiProvider;
             let providerIndex = FALLBACK_CHAIN.indexOf(currentProvider);
             if (providerIndex === -1) providerIndex = 0;
             
             for (let attempt = 0; attempt < FALLBACK_CHAIN.length; attempt++) {
                try {
                  responseText = await generateTeacherResponse(lesson, user, topic, 0, false, undefined, (partial) => {
                    setMessages(prev => {
                       const m = [...prev];
                       if (m.length > 0 && m[m.length-1].isStreaming) {
                         m[m.length-1] = { ...m[m.length-1], parts: [{ text: partial }] };
                       }
                       return m;
                    });
                  });
                  break;
                } catch (err) {
                  console.warn(`${currentProvider} failed in init, attempting fallback...`, err);
                  const nextIndex = (providerIndex + 1) % FALLBACK_CHAIN.length;
                  currentProvider = FALLBACK_CHAIN[nextIndex];
                  providerIndex = nextIndex;
                  setFallbackMessage(`Problema de conexión. Cambiando a ${currentProvider.toUpperCase()}...`);
                  setLocalAiProvider(currentProvider);
                  setAiProvider(currentProvider);
                  if (attempt === FALLBACK_CHAIN.length - 1) {
                     setFallbackMessage(null);
                     throw err;
                  }
                  await new Promise(r => setTimeout(r, 2000));
                }
             }
             setTimeout(() => setFallbackMessage(null), 4000);
             const processedText = processAIResponse(responseText || '');
             const newMsg: ChatMessage = { role: 'model', parts: [{ text: processedText }], timestamp: new Date().toISOString() };
             setMessages([newMsg]);
             if (mId) await saveClassChatHistory(mId, user.username, JSON.stringify([newMsg]));
          } else {
             // Resuming - check if last model message already has an unanswered question
             const lastModelMsg = [...history].reverse().find(m => m.role === 'model' && !m.isError);
             const hasUnansweredQuestion = lastModelMsg?.parts[0]?.text?.includes('[DATA_LOGICA]');
             
             if (hasUnansweredQuestion) {
               // Don't add a new message - the last question is still there, student can answer it directly
               setMessages(history);
             } else {
               // Generate welcome + new question
               const targetSeconds = (lesson.durationMinutes || 0) * 60;
               const elapsed = lesson.elapsedSeconds || 0;
               const isTimeMet = elapsed >= targetSeconds && elapsed >= penaltySecondsRequired;
               const topicsCount = lesson.completedTopicsCount || 0;
               const isReviewMode = !isTimeMet && topicsCount >= 10;
               const currentTopic = lesson.microtemas?.[topicsCount < 10 ? topicsCount : 9];

               const streamingMsg: ChatMessage = { role: 'model', parts: [{ text: 'El profesor está escribiendo...' }], timestamp: new Date().toISOString(), isStreaming: true };
               setMessages([...history, streamingMsg]);
               let responseText = "";
               let currentProvider = aiProvider;
               let providerIndex = FALLBACK_CHAIN.indexOf(currentProvider);
               if (providerIndex === -1) providerIndex = 0;
               
               for (let attempt = 0; attempt < FALLBACK_CHAIN.length; attempt++) {
                  try {
                    responseText = await generateTeacherResponse(
                       lesson, user, currentTopic,
                       topicsCount < 10 ? topicsCount : 9, 
                       isReviewMode, 
                       "El estudiante acaba de retomar la clase tras una pausa. Dale una breve y entusiasta bienvenida de vuelta y hazle directamente una nueva pregunta sobre este tema para continuar.",
                       (partial) => {
                         setMessages(prev => {
                            const m = [...prev];
                            if (m.length > 0 && m[m.length-1].isStreaming) {
                              m[m.length-1] = { ...m[m.length-1], parts: [{ text: partial }] };
                            }
                            return m;
                         });
                       }
                    );
                    break;
                  } catch (err) {
                    console.warn(`${currentProvider} failed in resume init, attempting fallback...`, err);
                    const nextIndex = (providerIndex + 1) % FALLBACK_CHAIN.length;
                    currentProvider = FALLBACK_CHAIN[nextIndex];
                    providerIndex = nextIndex;
                    setFallbackMessage(`Problema de conexión. Cambiando a ${currentProvider.toUpperCase()}...`);
                    setLocalAiProvider(currentProvider);
                    setAiProvider(currentProvider);
                    if (attempt === FALLBACK_CHAIN.length - 1) {
                       setFallbackMessage(null);
                       throw err;
                    }
                    await new Promise(r => setTimeout(r, 2000));
                  }
               }
               setTimeout(() => setFallbackMessage(null), 4000);
               const processedText = processAIResponse(responseText || '');
               const newMsg: ChatMessage = { role: 'model', parts: [{ text: processedText }], timestamp: new Date().toISOString() };
               setMessages([...history, newMsg]);
               if (mId) await saveClassChatHistory(mId, user.username, JSON.stringify([...history, newMsg]));
             }
          }
        }
      } catch (err: any) {
        console.error(err);
        const errStr = String(err);
        const isQuotaError = errStr.includes('429') || errStr.includes('quota');
        const isBalanceError = errStr.includes('402') || errStr.includes('Insufficient Balance');
        const isNotFound = errStr.includes('404') || errStr.includes('Model does not exist');
        const isTimeout = errStr.includes('aborted') || errStr.includes('AbortError');
        
        let errorText = "Ocurrió un error al iniciar la clase con el modelo de IA. El servidor puede estar saturado.";
        if (isQuotaError) errorText = "Has agotado tu límite de mensajes gratuitos o el servidor está saturado (Error 429).";
        else if (isBalanceError) errorText = "OpenRouter reporta saldo insuficiente (Error 402). Por favor, recarga tu cuenta.";
        else if (isNotFound) errorText = "Cerebras reporta que el modelo seleccionado no existe o no tienes acceso (Error 404).";
        else if (isTimeout) errorText = "El modelo de IA tardó demasiado en responder (Error de Tiempo de Espera).";
        
        const errorMsg: ChatMessage = { 
          role: 'model',
          parts: [{ text: errorText }], 
          timestamp: new Date().toISOString(),
          isError: true,
        };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }
    };
    initChat();
  }, []);

  const saveProgress = async (msgs: ChatMessage[], topicsCount: number, time: number) => {
    if (isAdminAudit) return;
    try {
      await updateLessonInStudent(user.username, {
        ...lesson,
        completedTopicsCount: topicsCount,
        elapsedSeconds: time,
        lesson_status: 'En Progreso'
      });
      if (masterLeccionIdRef.current && msgs.length > 1) {
        await saveClassChatHistory(masterLeccionIdRef.current, user.username, JSON.stringify(msgs));
      }
    } catch (e) {
      console.error("Error saving progress", e);
    }
  };

  // Core response generator - shared between handleSend (WRITTEN) and handleMCQSelect
  const generateAndAppendTeacherResponse = async (
    studentAnswer: string,
    currentMessages: ChatMessage[],
    skipUserBubble: boolean = false,
    mcqIsCorrect?: boolean
  ) => {
    const targetSeconds = (lesson.durationMinutes || 0) * 60;
    const isTimeMet = secondsRef.current >= targetSeconds && secondsRef.current >= penaltySecondsRequired;
    
    let newCompletedTopics = completedTopicsRef.current;
    let newCorrectAnswers = correctAnswersRef.current;
    let isTopicCompleted = false;
    let teacherContext = "";

    // Extract last question for evaluator
    const lastModelMessage = currentMessages.filter(m => m.role === 'model' && !m.isError && !m.isStreaming).pop();
    let lastQuestion = "";
    if (lastModelMessage) {
      let match = lastModelMessage.parts[0].text.match(/\[DATA_LOGICA\]([\s\S]*?)\[\/DATA_LOGICA\]/);
      if (!match) {
        const fallback = lastModelMessage.parts[0].text.match(/(\{[\s\S]*?\})\s*\[\/DATA_LOGICA\]/);
        if (fallback) match = [fallback[0], fallback[1]];
      }
      if (match) {
        try {
          const data = JSON.parse(match[1]);
          lastQuestion = data.question || lastModelMessage.parts[0].text;
        } catch (e) {
          lastQuestion = lastModelMessage.parts[0].text;
        }
      } else {
        lastQuestion = lastModelMessage.parts[0].text;
      }
    }

    if (lastQuestion) {
      setLoadingText('El profesor está evaluando...');
      setIsLoading(true);
      
      let evalResult;
      // Skip AI evaluation for MCQ - we already know if it's correct
      if (mcqIsCorrect !== undefined) {
        const explanation = lastAskedMCQExplanationRef.current || (mcqIsCorrect ? "La respuesta elegida fue la correcta." : "La respuesta elegida fue incorrecta.");
        evalResult = { 
          aprobado: mcqIsCorrect, 
          retroalimentacion: explanation 
        };
      } else {
        evalResult = await evaluateStudentAnswer(studentAnswer, lastQuestion, user);
      }
      
      if (evalResult.aprobado) {
        newCorrectAnswers += 1;
        if (newCorrectAnswers >= 2) {
          newCompletedTopics = Math.min(completedTopicsRef.current + 1, 10);
          newCorrectAnswers = 0;
          isTopicCompleted = true;
        }
      }
      
      setCorrectAnswersForTopic(newCorrectAnswers);
      correctAnswersRef.current = newCorrectAnswers;
      teacherContext = evalResult.retroalimentacion;
    }

    // NEW LOGIC: Bypass time check if 10 topics completed early
    if (newCompletedTopics >= 10 && !isResumingRef.current) {
        isResumingRef.current = true;
        setResumeInteractions(0);
        resumeInteractionsRef.current = 0;
    }

    // Increment resume interaction counter EARLY so UI updates immediately
    let newResumeInteractions = resumeInteractionsRef.current;
    if (isResumingRef.current && newCompletedTopics >= 10 && mcqIsCorrect !== false && !isTopicCompleted) {
      newResumeInteractions += 1;
      setResumeInteractions(newResumeInteractions);
      resumeInteractionsRef.current = newResumeInteractions;
    }

    if (newResumeInteractions >= RESUME_INTERACTIONS_REQUIRED) {
       teacherContext = "FINAL_REVIEW_INTERACTION";
    }

    if (isTopicCompleted) {
      setCompletedTopics(newCompletedTopics);
      completedTopicsRef.current = newCompletedTopics;
      setSessionCompletedTopics(prev => prev + 1);
    }
    
    const isReviewMode = !isTimeMet && newCompletedTopics >= 10;
    const currentTopic = lesson.microtemas?.[newCompletedTopics < 10 ? newCompletedTopics : 9];

    const isReadyForExamNow = (newCompletedTopics >= 10) && (newResumeInteractions >= RESUME_INTERACTIONS_REQUIRED);
    
    if (isReadyForExamNow) {
       // FINAL INTERACTION FOR BOTH MCQ AND OPEN
       const feedbackText = (mcqIsCorrect !== undefined) 
           ? (mcqIsCorrect ? `¡Correcto! ${teacherContext}` : `¡Incorrecto! ${teacherContext}`)
           : teacherContext;
           
       const localAiText = `[EXPLICACION] ${feedbackText} [/EXPLICACION]`;
       const aiMsg: ChatMessage = { role: 'model', parts: [{ text: processAIResponse(localAiText) }], timestamp: new Date().toISOString() };
       
       setIsLoading(true);
       setLoadingText('El profesor está evaluando...');
       await new Promise(r => setTimeout(r, 1500));
       setIsLoading(false);

       setMessages(prev => {
         const newMsgs = [...prev, aiMsg, {
           role: 'model', 
           parts: [{ text: "## ⏳ GENERANDO PREGUNTAS DEL EXAMEN...\nPor favor espera un momento, estamos preparando tu evaluación personalizada en base a tu progreso." }],
           timestamp: new Date().toISOString()
         }];
         saveProgress(newMsgs, newCompletedTopics, secondsRef.current);
         return newMsgs;
       });
       
       setShowExam(true);
       return; // SKIP GEMINI API
    }

    // INSTANT PRELOADED MCQ CHECK
    if (mcqIsCorrect !== undefined && newResumeInteractions < RESUME_INTERACTIONS_REQUIRED && !isTopicCompleted) {
       if (preloadedMCQs.length > 0) {
          const nextMCQ = preloadedMCQs[0];
          const restMCQs = preloadedMCQs.slice(1);
          setPreloadedMCQs(restMCQs);
          lastAskedMCQExplanationRef.current = nextMCQ.explanation;
          
          const feedbackText = mcqIsCorrect ? `¡Correcto! ${teacherContext}` : `¡Incorrecto! ${teacherContext}`;
          
          const localAiText = `[EXPLICACION] ${feedbackText} [/EXPLICACION]\n[DATA_LOGICA] ${JSON.stringify({
            type: 'MCQ',
            question: nextMCQ.question,
            options: nextMCQ.options,
            correct: nextMCQ.correct
          })} [/DATA_LOGICA]`;

          const aiMsg: ChatMessage = { role: 'model', parts: [{ text: processAIResponse(localAiText) }], timestamp: new Date().toISOString() };
          
          setIsLoading(true);
          setLoadingText('El profesor está evaluando...');
          await new Promise(r => setTimeout(r, 1500));
          setIsLoading(false);

          setMessages(prev => {
            const newMsgs = [...prev, aiMsg];
            saveProgress(newMsgs, newCompletedTopics, secondsRef.current);
            return newMsgs;
          });
          
          return; // SKIP GEMINI API
       }
    }

    // If we fall back to Gemini, clear the local explanation ref so it doesn't get used for a Gemini-generated question
    lastAskedMCQExplanationRef.current = "";

    setLoadingText('El profesor está respondiendo...');

    // Streaming message
    const streamingMsg: ChatMessage = { role: 'model', parts: [{ text: 'El profesor está escribiendo...' }], timestamp: new Date().toISOString(), isStreaming: true };
    setMessages(prev => [...prev, streamingMsg]);
    setIsLoading(false);

    let responseText = "";
    let currentProvider = aiProvider;
    let providerIndex = FALLBACK_CHAIN.indexOf(currentProvider);
    if (providerIndex === -1) providerIndex = 0;
    
    for (let attempt = 0; attempt < FALLBACK_CHAIN.length; attempt++) {
       try {
         responseText = await generateTeacherResponse(
           lesson, user, currentTopic,
           newCompletedTopics < 10 ? newCompletedTopics : 9,
           isReviewMode, teacherContext,
           (partial) => {
             setMessages(prev => {
               const idx = prev.findIndex(m => m.isStreaming);
               if (idx === -1) return prev;
               const newMsgs = [...prev];
               newMsgs[idx] = { ...newMsgs[idx], parts: [{ text: partial }] };
               return newMsgs;
             });
           }
         );
         break; // Success
       } catch (err) {
         console.warn(`${currentProvider} failed, attempting fallback...`, err);
         const nextIndex = (providerIndex + 1) % FALLBACK_CHAIN.length;
         currentProvider = FALLBACK_CHAIN[nextIndex];
         providerIndex = nextIndex;
         setFallbackMessage(`El modelo tardó demasiado. Cambiando a ${currentProvider.toUpperCase()}...`);
         setLocalAiProvider(currentProvider);
         setAiProvider(currentProvider);
         
         if (attempt === FALLBACK_CHAIN.length - 1) {
            setFallbackMessage(null);
            throw err; // All failed
         }
         await new Promise(r => setTimeout(r, 2000));
       }
    }
    setTimeout(() => setFallbackMessage(null), 4000);
    

    const aiText = processAIResponse(responseText || '');

    const aiMsg: ChatMessage = { role: 'model', parts: [{ text: aiText }], timestamp: new Date().toISOString() };
    setMessages(prev => {
      // Replace the streaming message (last element) with the final message
      const newMsgs = [...prev.slice(0, -1), aiMsg];
      saveProgress(newMsgs, newCompletedTopics, secondsRef.current);
      return newMsgs;
    });

    const sessionRequirementMet = isResumingRef.current
      ? newResumeInteractions >= RESUME_INTERACTIONS_REQUIRED
      : true;

    const isReadyForExam = (newCompletedTopics >= 10) && (
      isResumingRef.current ? sessionRequirementMet : (isTimeMet && sessionRequirementMet)
    );

    if (isReadyForExam) {
      setMessages(prev => [...prev, {
        role: 'model', 
        parts: [{ text: "## ⏳ GENERANDO PREGUNTAS DEL EXAMEN...\nPor favor espera un momento, estamos preparando tu evaluación personalizada en base a tu progreso." }],
        timestamp: new Date().toISOString()
      }]);
      setShowExam(true);
    }
  };

  // Handle MCQ option click - visual feedback inline, NO user message bubble
  const handleMCQSelect = async (opt: string, correctAnswer: string, messageIndex: number) => {
    if (isLoading || isPaused || isAdminAudit) return;
    // Mark selection immediately for visual feedback
    const isCorrect = opt === correctAnswer;
    setMcqSelections(prev => ({ ...prev, [messageIndex]: { selected: opt, correct: correctAnswer } }));
    
    try {
      const currentMsgs = [...messages];
      currentMsgs[messageIndex] = { ...currentMsgs[messageIndex], selectedOption: opt, is_correct: isCorrect };
      setMessages(currentMsgs);
      await generateAndAppendTeacherResponse(opt, currentMsgs, true, isCorrect);
    } catch (err: any) {
      console.error(err);
      const errorMsg: ChatMessage = { 
        role: 'model',
        parts: [{ text: String(err).includes('402') ? "Error: OpenRouter reporta saldo insuficiente (402)." : String(err).includes('404') ? "Error: Cerebras reporta modelo inexistente (404)." : String(err).includes('aborted') || String(err).includes('AbortError') ? "Error: El modelo de IA tardó demasiado en responder." : "Ocurrió un error con el modelo de IA. Los servidores están saturados." }], 
        timestamp: new Date().toISOString(),
        isError: true,
        studentResponse: opt
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  // Handle written/text answer - adds user message bubble
  const handleSend = async (manualText?: string) => {
    const userText = manualText || input.trim();
    if (!userText || isLoading || isPaused) return;

    setInput('');
    setIsLoading(true);

    const userMsg: ChatMessage = { role: 'user', parts: [{ text: userText }], timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const currentMsgs = [...messages, userMsg];
      await generateAndAppendTeacherResponse(userText, currentMsgs, false);
    } catch (err: any) {
      console.error(err);
      const errorMsg: ChatMessage = { 
        role: 'model',
        parts: [{ text: String(err).includes('402') ? "Error: OpenRouter reporta saldo insuficiente (402)." : String(err).includes('404') ? "Error: Cerebras reporta modelo inexistente (404)." : String(err).includes('aborted') || String(err).includes('AbortError') ? "Error: El modelo de IA tardó demasiado en responder." : "Ocurrió un error con el modelo de IA (503 Service Unavailable). Los servidores están saturados." }], 
        timestamp: new Date().toISOString(),
        isError: true,
        studentResponse: userText
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const renderMessage = (msg: ChatMessage, index: number) => {
    if (msg.role === 'user') {
      return (
        <div key={index} className="flex justify-end w-full mb-4">
          <div className="bg-indigo-600 text-white p-4 rounded-[2rem] rounded-tr-none max-w-[80%] shadow-md">
             <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={MarkdownComponents}>{msg.parts[0].text}</ReactMarkdown>
          </div>
        </div>
      );
    }

    if (msg.isError) {
      return (
        <div key={index} className="flex justify-start w-full mb-6 relative group">
          <div className="bg-red-50 dark:bg-red-900/30 border-2 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100 p-5 rounded-[2rem] rounded-tl-none max-w-[90%] shadow-sm flex flex-col space-y-4">
             <p className="font-bold text-sm">⚠️ {msg.parts[0].text}</p>
             {msg.studentResponse && (
               <button 
                 onClick={() => {
                   setMessages(prev => prev.filter((_, i) => i !== index && i !== index - 1));
                   handleSend(msg.studentResponse);
                 }}
                 disabled={isLoading}
                 className="bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-xl shadow-md transition-all uppercase text-xs tracking-widest disabled:opacity-50"
               >
                 Reintentar Envío
               </button>
             )}
          </div>
        </div>
      );
    }

    const text = msg.parts[0].text;
    const expMatch = text.match(/\[EXPLICACION\]([\s\S]*?)\[\/EXPLICACION\]/);
    let dataMatch = text.match(/\[DATA_LOGICA\]([\s\S]*?)\[\/DATA_LOGICA\]/);
    
    if (!dataMatch) {
      const fallbackMatch = text.match(/(\{[\s\S]*?\})\s*\[\/DATA_LOGICA\]/);
      if (fallbackMatch) {
        dataMatch = [fallbackMatch[0], fallbackMatch[1]];
      } else {
        const fallbackMatch2 = text.match(/\[DATA_LOGICA\]\s*(\{[\s\S]*?\})\s*(?:\[\/DATA_LOGICA\]|$)/);
        if (fallbackMatch2) {
           dataMatch = [fallbackMatch2[0], fallbackMatch2[1]];
        }
      }
    }
    
    let explanation = expMatch ? expMatch[1].trim() : text;
    explanation = explanation
      .replace(/\[DATA_LOGICA\][\s\S]*?\[\/DATA_LOGICA\]/g, '')
      .replace(/\{[\s\S]*?\}\s*\[\/DATA_LOGICA\]/g, '')
      .replace(/\[DATA_LOGICA\][\s\S]*$/g, '')
      .replace(/\[\/DATA_LOGICA\]`?/g, '')
      .replace(/\*\*Draft\*\*/g, '')
      .replace(/\*\*Draft/g, '')
      .replace(/\[EXPLICACION\]|\[\/EXPLICACION\]|\[RESPUESTA_VALIDA\]|\[RESPUESTA_INCORRECTA\]|\[PLAGIO_IA\]|\[MICRO_TEMA_COMPLETADO\]/g, '')
      .replace(/\[TEMAS_COMPLETADOS:\s*\d+\]/ig, '')
      .trim();

    let questionData: any = null;
    if (dataMatch) {
      try {
        questionData = JSON.parse(dataMatch[1].trim());
      } catch (e) {}
    }

    const isLastMessage = index === messages.length - 1;
    const mcqSelection = mcqSelections[index] || (msg.selectedOption ? { selected: msg.selectedOption, correct: questionData?.correct || '' } : undefined); // track MCQ answer for this message
    const hasAnsweredMCQ = !!mcqSelection;

    // Streaming: show cursor while streaming
    const displayText = msg.isStreaming && !explanation.trim() ? 'El profesor está escribiendo...' : explanation;

    return (
      <div key={index} className="flex justify-start w-full mb-6 relative group">
        <div className="bg-white dark:bg-indigo-900 border-2 border-indigo-50 dark:border-indigo-800 text-indigo-900 dark:text-indigo-100 p-5 rounded-[2rem] rounded-tl-none max-w-[90%] shadow-sm">
          <div className={`prose dark:prose-invert max-w-none font-medium ${msg.isStreaming ? 'animate-pulse' : ''}`}>
             <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={MarkdownComponents}>{displayText}</ReactMarkdown>
          </div>

          {questionData && questionData.question && !msg.isStreaming && (
             <div className="mt-6 pt-4 border-t-2 border-indigo-50 dark:border-indigo-800">
               <p className="font-black text-lg mb-4">{questionData.question}</p>
               {questionData.type === 'MCQ' && questionData.options && (
                 <div className="grid gap-2">
                   {questionData.options.map((opt: string, i: number) => {
                     const isSelected = mcqSelection?.selected === opt;
                     const isCorrectOpt = opt === questionData.correct || opt === mcqSelection?.correct;
                     
                     let btnClass = "text-left w-full p-4 rounded-xl font-bold border-2 transition-all ";
                     let icon = null;

                     // Since we skip the user bubble for MCQ, the next message (index + 1) is the AI feedback.
                     const aiFeedbackExists = messages.length > index + 1 && !messages[index + 1].isStreaming;

                     if (hasAnsweredMCQ) {
                       if (aiFeedbackExists) {
                         // AI HAS RESPONDED: Reveal correct/incorrect
                         if (isCorrectOpt) {
                           btnClass += "bg-green-50 dark:bg-green-900/30 border-green-500 text-green-800 dark:text-green-200";
                           icon = <CheckCircle2 size={18} className="text-green-500 shrink-0" />;
                         } else if (isSelected) {
                           btnClass += "bg-red-50 dark:bg-red-900/30 border-red-500 text-red-800 dark:text-red-200";
                           icon = <XCircle size={18} className="text-red-500 shrink-0" />;
                         } else {
                           btnClass += "border-indigo-50 dark:border-indigo-900 opacity-30 text-indigo-400";
                         }
                       } else {
                         // PENDING AI RESPONSE
                         if (isSelected) {
                           btnClass += "bg-indigo-600 border-indigo-600 text-white";
                         } else {
                           btnClass += "border-indigo-50 dark:border-indigo-900 opacity-30 text-indigo-400";
                         }
                       }
                     } else {
                       btnClass += "bg-indigo-50 dark:bg-indigo-950 border-indigo-100 dark:border-indigo-800 hover:bg-indigo-600 hover:text-white hover:border-indigo-600";
                     }

                     return (
                       <button 
                         key={i}
                         onClick={() => handleMCQSelect(opt, questionData.correct, index)}
                         disabled={!isLastMessage || isLoading || isPaused || isAdminAudit || hasAnsweredMCQ}
                         className={btnClass + " flex items-center gap-3 disabled:cursor-default"}
                       >
                         {icon}
                         <span>{opt}</span>
                       </button>
                     );
                   })}
                 </div>
               )}
               {questionData.type === 'WRITTEN' && isLastMessage && !isAdminAudit && !hasAnsweredMCQ && (
                 <p className="text-xs text-indigo-400 font-bold uppercase tracking-widest animate-pulse mt-2">Escribe tu respuesta abajo 👇</p>
               )}
             </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={isEmbedded ? "relative w-full h-[65vh] md:h-[75vh] bg-indigo-50 dark:bg-indigo-950 flex flex-col font-fredoka rounded-[2rem] overflow-hidden border-2 border-indigo-100 dark:border-indigo-800 shadow-inner" : "fixed inset-0 bg-indigo-50 dark:bg-indigo-950 z-[2000] flex flex-col font-fredoka"}>
        <header className="bg-indigo-600 text-white p-4 shadow-lg flex justify-between items-center z-10 shrink-0">
        {fallbackMessage && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-amber-500 text-white px-6 py-2 rounded-full font-black text-xs z-50 shadow-2xl animate-bounce">
             ⚠️ {fallbackMessage}
          </div>
        )}
        <div className="flex items-center space-x-4">
           <div className="bg-white/20 px-4 py-2 rounded-2xl flex flex-col items-center min-w-[80px]">
             <span className="text-xl font-black font-mono">{Math.floor(secondsElapsed / 60)}:{String(secondsElapsed % 60).padStart(2, '0')}</span>
             {isRetrying && secondsElapsed < penaltySecondsRequired && (
                <span className="text-[8px] text-amber-300 font-black uppercase mt-1 text-center leading-tight">Repaso<br/>obligatorio</span>
             )}
            </div>
            <div>
             <h2 className="text-sm font-black uppercase truncate max-w-[200px] sm:max-w-md">{lesson.title}</h2>
             <p className="text-[10px] font-bold opacity-80 uppercase flex flex-wrap items-center gap-2 mt-1">
               <span>Temas completados: {completedTopics} / 10</span>
               {isRetrying && secondsElapsed < penaltySecondsRequired ? <span>| Repaso req: {PENALTY_MINUTES} min</span> : null}
               {isResumingRef.current && completedTopics >= 10 && resumeInteractions < RESUME_INTERACTIONS_REQUIRED && (
                 <span className="bg-amber-400/30 text-amber-200 px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest border border-amber-400/40">
                   Interacciones para examen: {resumeInteractions}/{RESUME_INTERACTIONS_REQUIRED}
                 </span>
               )}
               <span className="bg-white/20 px-2 py-0.5 rounded-full text-[9px] tracking-widest ml-1">{aiProvider}</span>
             </p>
           </div>
        </div>
        <button onClick={async () => {
           if (!isAdminAudit) {
              await saveProgress(messages, completedTopics, secondsElapsed);
           }
           onClose();
        }} className="w-10 h-10 rounded-full bg-white/10 hover:bg-red-500 transition-all flex items-center justify-center">
          <XCircle size={24} />
        </button>
      </header>

      <div className="flex-1 relative flex flex-col overflow-hidden bg-sky-50 dark:bg-indigo-950/50">
         <div className="flex-1 overflow-y-auto px-[4%] py-8 custom-scrollbar">

            {messages.map((m, i) => renderMessage(m, i))}
            {isLoading && !messages.some(m => m.isStreaming) && (
              <div className="flex justify-start w-full mb-6">
                 <div className="bg-white/60 dark:bg-indigo-900/40 p-4 rounded-2xl border-2 border-indigo-50 dark:border-indigo-800 flex items-center space-x-3">
                   <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                   <p className="text-xs font-black text-indigo-400 uppercase tracking-widest animate-pulse">{loadingText}</p>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
         </div>

         {!isAdminAudit && (
           <div className="p-4 bg-white dark:bg-indigo-900 border-t-4 border-indigo-50 dark:border-indigo-800">
             <div className="w-full max-w-4xl mx-auto flex items-center space-x-3">
               <input
                 type="text"
                 value={input}
                 onChange={(e) => setInput(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                 disabled={isLoading || isPaused || showExam}
                 placeholder="Escribe tu respuesta..."
                 className="flex-1 px-6 py-4 rounded-2xl border-2 border-indigo-100 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold outline-none focus:border-indigo-500 disabled:opacity-50"
               />
               <button 
                 onClick={() => handleSend()}
                 disabled={isLoading || isPaused || showExam || !input.trim()}
                 className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white p-4 rounded-2xl shadow-lg transition-all"
               >
                 <Send size={24} />
               </button>
             </div>
           </div>
         )}
      </div>

      {isPaused && !isAdminAudit && !showExam && (
        <div className="absolute inset-0 bg-indigo-900/60 backdrop-blur-md z-[3000] flex items-center justify-center p-6 text-center">
          <div className="bg-white dark:bg-indigo-900 p-10 rounded-[3rem] shadow-2xl animate-in zoom-in duration-300 border-8 border-indigo-50 dark:border-indigo-800">
             <h3 className="text-2xl font-black text-indigo-900 dark:text-white mb-6 uppercase tracking-tight">Estudio Pausado por Inactividad</h3>
             <p className="text-indigo-500 dark:text-indigo-200 font-bold mb-8">El cronómetro se ha detenido. ¿Sigues ahí?</p>
             <button onClick={() => setIsPaused(false)} className="w-full bg-indigo-600 dark:bg-indigo-500 text-white font-black py-4 rounded-2xl shadow-xl text-xl px-12 uppercase">
               Continuar Aprendiendo
             </button>
          </div>
        </div>
      )}
      </div>

      {showExam && (
        <div className={`fixed inset-0 bg-indigo-900/95 z-[3000] flex flex-col p-6 overflow-y-auto transition-opacity duration-500 ${examReady ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
           <ExamComponent 
              lesson={lesson} 
              lessonDbId={masterLeccionIdRef.current || lesson.id.toString()}
              microtemas={lesson.microtemas}
              studentId={user.id || user.username} 
              studentUsername={user.username}
              chatHistory={messages}
              onReady={() => setExamReady(true)}
              onFinish={async (grade) => {
                if (onLessonAccredited) onLessonAccredited(grade);
                try {
                   await updateLessonInStudent(user.username, {
                     ...lesson, 
                     grade,
                     actualDurationMinutes: Math.ceil(secondsElapsed / 60),
                     completed: grade >= 6,
                     lesson_status: grade >= 6 ? 'Aprobada' : 'Reprobada'
                   });
                } catch(e) {}
                onClose();
              }}
              onClose={() => setShowExam(false)}
            />
        </div>
      )}
    </>
  );
};

export default VirtualClassroom;
