import React, { useState, useEffect, useMemo } from 'react';
import { User, StudentData, Lesson, Transaction, Role } from '../types';
import { 
  getStudentData, 
  executeCreditTransfer, 
  getTransactions, 
  getAccountBalance, 
  autoUpdateLessonStatuses,
  updateLessonInStudent,
  deleteLessonFromStudent,
  clearStudentLessonData,
  getUsers,
  executeStudentTransfer,
  checkAuditStatus,
  getAuditStatusesBulk,
  getCourses,
  getClasses,
  getTopics
} from '../storage2';
import Calendar from './Calendar';
import VirtualClassroom from './VirtualClassroom';

interface StudentDashboardProps {
  user: User;
  onBalanceUpdate?: () => void;
  isAdminView?: boolean;
  onAuditLesson?: (lesson: Lesson) => void;
  onEditLessonDetails?: (lesson: Lesson) => void;
  initialSelectedDate?: string | null;
  lastFinishedLessonId?: string | null;
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({ 
  user, 
  onBalanceUpdate,
  isAdminView = false,
  onAuditLesson,
  onEditLessonDetails,
  initialSelectedDate,
  lastFinishedLessonId: propsLastFinishedId
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'aula' | 'banco'>('aula');
  const [data, setData] = useState<StudentData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransferring, setIsTransferring] = useState(false);
  const [quickEditLessonId, setQuickEditLessonId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [auditStatuses, setAuditStatuses] = useState<Record<string, { hasGeminiLesson: boolean, hasExamAttempts: boolean }>>({});

  // Estados para el Interceptor de Ruta
  const [pendingLesson, setPendingLesson] = useState<Lesson | null>(null);
  const [showClassroom, setShowClassroom] = useState(false);

  // Estados para el modal de Temario (reemplazado por inline)
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [inlineTopics, setInlineTopics] = useState<any[]>([]);
  const [isFetchingInlineTopics, setIsFetchingInlineTopics] = useState(false);

  const [otherStudents, setOtherStudents] = useState<User[]>([]);
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferConcept, setTransferConcept] = useState('');
  const [isTransferringFunds, setIsTransferringFunds] = useState(false);

  // Ajustes de IA
  const [showAISettings, setShowAISettings] = useState(false);
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('student_gemini_api_key') || '');
  const [customFallbackApiKey, setCustomFallbackApiKey] = useState(() => localStorage.getItem('student_fallback_api_key') || '');
  const [customCerebrasApiKey, setCustomCerebrasApiKey] = useState(() => localStorage.getItem('student_cerebras_api_key') || '');

  const ADMIN_UUID = '6a6db323-6229-42e3-a8b8-3ccfa177dfd7';

  const getLocalDateStr = (d: Date = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDay, setSelectedDay] = useState<string | null>(initialSelectedDate || getLocalDateStr());
  const [dayLessons, setDayLessons] = useState<Lesson[]>([]);

  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0); 
    return monday;
  };
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  // Mapeo de IDs a Nombres para el historial del estudiante
  const userMap = useMemo(() => {
    const map: Record<string, string> = { 
      [ADMIN_UUID]: 'BANCO CENTRAL',
      'ADMIN': 'BANCO CENTRAL'
    };
    otherStudents.forEach(s => {
      if (s.id) map[s.id] = s.username.toUpperCase();
      map[s.username] = s.username.toUpperCase();
    });
    // Agregar al propio estudiante al mapeo
    if (user.id) map[user.id] = user.username.toUpperCase();
    map[user.username] = user.username.toUpperCase();
    return map;
  }, [otherStudents, user, ADMIN_UUID]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (!isAdminView) await autoUpdateLessonStatuses(user.username);
      const ownerId = user.id || user.username;
      const [studentData, history, balance, allUsers] = await Promise.all([
        getStudentData(user.username),
        getTransactions(ownerId),
        getAccountBalance(ownerId),
        getUsers()
      ]);
      setData(studentData);
      setTransactions(history);
      setCurrentBalance(balance);
      setOtherStudents(allUsers.filter(u => (u.id || u.username) !== ownerId && u.role === Role.STUDENT));
    } catch (error) { console.error(error); } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchData(); }, [user.username]);

  useEffect(() => {
    if (isAdminView && user.id && data?.student_lessons) {
      const fetchAuditStatuses = async () => {
        const statuses = await getAuditStatusesBulk(user.id!, user.username, data.student_lessons);
        setAuditStatuses(statuses);
      };
      fetchAuditStatuses();
    }
  }, [isAdminView, user.id, data]);

  useEffect(() => {
    if (data && selectedDay) {
      setDayLessons(data.student_lessons.filter(l => l.date === selectedDay) || []);
    }
  }, [selectedDay, data]);

  const currentWeekLessons = useMemo(() => {
    if (!data) return [];
    const monday = new Date(weekStart);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return data.student_lessons.filter(l => {
      const lDate = new Date(l.date + 'T12:00:00');
      return lDate >= monday && lDate <= sunday;
    });
  }, [data, weekStart]);

  const creditsTransferable = useMemo(() => {
    return currentWeekLessons.filter(l => (l.lesson_status === 'Aprobada' || l.lesson_status === 'Completada' || (l.grade && l.grade >= 6)) && !l.credits_transfered).reduce((acc, l) => acc + (l.grade || 0), 0);
  }, [currentWeekLessons]);

  const creditsToWin = useMemo(() => {
    return currentWeekLessons.filter(l => (l.lesson_status !== 'Aprobada' && l.lesson_status !== 'Completada' && (!l.grade || l.grade < 6)) && !l.credits_transfered).length * 10;
  }, [currentWeekLessons]);

  const weeklyStats = useMemo(() => {
    return currentWeekLessons.reduce((acc, l) => {
      const status = (l.lesson_status || 'Pendiente').toLowerCase();
      if (status === 'aprobada' || status === 'completada') acc.passed += 1;
      else if (status === 'reprobada') acc.failed += 1;
      else if (status === 'en progreso') acc.inProgress += 1;
      else acc.pending += 1;
      acc.total += 1;
      return acc;
    }, { passed: 0, failed: 0, inProgress: 0, pending: 0, total: 0 });
  }, [currentWeekLessons]);

  const handleTransfer = async () => {
    if (creditsTransferable <= 0 || isTransferring || isAdminView) return;
    const today = new Date();
    const isWeekend = today.getDay() === 0 || today.getDay() === 6;
    if (!isWeekend) { alert("Solo puedes transferir créditos los fines de semana."); return; }
    const hasIncomplete = currentWeekLessons.some(l => {
      const lDate = new Date(l.date + 'T12:00:00');
      const isPastOrToday = lDate <= today;
      return isPastOrToday && l.lesson_status !== 'Aprobada' && l.lesson_status !== 'Completada';
    });
    if (hasIncomplete) { alert("Debes completar todas tus clases asignadas hasta el día de hoy antes de transferir créditos."); return; }
    const pending = currentWeekLessons.filter(l => (l.lesson_status === 'Aprobada' || l.lesson_status === 'Completada' || (l.grade && l.grade >= 6)) && !l.credits_transfered);
    const realSum = pending.reduce((acc, l) => acc + (l.grade || 0), 0);
    if (!window.confirm(`¿Confirmas transferencia de $${realSum}?`)) return;
    setIsTransferring(true);
    try {
      const lessonIds = pending.map(l => String(l.id));
      const studentId = user.id || user.username;
      await executeCreditTransfer(studentId, user.username, realSum, `Semana [${weekStart.toISOString().split('T')[0]}]`, lessonIds);
      alert("¡Transferencia exitosa!"); fetchData(); if (onBalanceUpdate) onBalanceUpdate();
    } catch (err: any) { alert(err.message); } finally { setIsTransferring(false); }
  };

  const handleFundsTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(transferAmount);
    if (!transferTo || isNaN(amount) || amount <= 0 || !transferConcept) return;
    if (amount > currentBalance) { alert("Fondos insuficientes."); return; }
    if (!window.confirm(`¿Transferir $${amount.toFixed(2)}?`)) return;
    setIsTransferringFunds(true);
    try {
      await executeStudentTransfer(user.id || user.username, transferTo, amount, transferConcept);
      alert("¡Éxito!"); setTransferAmount(''); setTransferConcept(''); setTransferTo(''); fetchData(); if (onBalanceUpdate) onBalanceUpdate();
    } catch (err: any) { alert(err.message); } finally { setIsTransferringFunds(false); }
  };

  // Interceptor de acción al intentar entrar a una lección
  const onHandleLessonClick = (lesson: Lesson) => {
    if (isAdminView) {
      if (onAuditLesson) onAuditLesson(lesson);
      return;
    }

    setPendingLesson(lesson);
    setShowClassroom(true);
  };

  const handleToggleExpand = async (lesson: Lesson) => {
    if (expandedLessonId === String(lesson.id)) {
      setExpandedLessonId(null);
      return;
    }
    setExpandedLessonId(String(lesson.id));
    setInlineTopics([]);
    setIsFetchingInlineTopics(true);
    
    try {
      const courses = await getCourses();
      const course = courses.find(c => c.nombre.trim().toLowerCase() === lesson.subject.trim().toLowerCase());
      if (course) {
        const classes = await getClasses(course.id);
        const classObj = classes.find(c => c.titulo.trim().toLowerCase() === lesson.title.trim().toLowerCase());
        if (classObj) {
          const topics = await getTopics(classObj.id);
          setInlineTopics(topics);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsFetchingInlineTopics(false);
    }
  };

  const getLessonUIConfig = (status: string, isTransfered: boolean, lessonId: string | number) => {
    const s = (status || 'Pendiente').toLowerCase();
    const auditStatus = auditStatuses[String(lessonId)];
    const canAudit = auditStatus?.hasGeminiLesson || auditStatus?.hasExamAttempts;

    let defaultBtnText = isAdminView ? 'AUDITAR LECCIÓN' : 'TOMAR CLASE 🚀';
    
    let config = { 
      color: 'bg-blue-600', 
      label: 'PENDIENTE', 
      btnText: defaultBtnText,
      textColor: 'text-white',
      disabled: isAdminView ? !canAudit : false
    };

    if (s === 'aprobada' || s === 'completada') {
      config = isTransfered ? { 
        color: 'bg-green-800', 
        label: (s === 'completada' ? 'COMPLETADA' : 'APROBADA') + ' (PAGADA)', 
        btnText: isAdminView ? 'AUDITAR LECCIÓN' : 'AUDITAR LECCIÓN ✨', 
        textColor: 'text-white',
        disabled: isAdminView ? !canAudit : false
      }
      : { 
        color: 'bg-green-600', 
        label: s === 'completada' ? 'COMPLETADA' : 'APROBADA', 
        btnText: isAdminView ? 'AUDITAR LECCIÓN' : 'REPASAR LECCIÓN ✨', 
        textColor: 'text-white',
        disabled: isAdminView ? !canAudit : false
      };
    } else if (s === 'reprobada') {
      config = { 
        color: 'bg-red-600', 
        label: 'REPROBADA', 
        btnText: isAdminView ? 'AUDITAR LECCIÓN' : 'MEJORAR NOTA 🔁', 
        textColor: 'text-white',
        disabled: isAdminView ? !canAudit : false
      };
    } else if (s === 'en progreso') {
      config = { 
        color: 'bg-orange-500', 
        label: 'EN PROGRESO', 
        btnText: isAdminView ? 'AUDITAR LECCIÓN' : 'REANUDAR CLASE 🚀', 
        textColor: 'text-white',
        disabled: isAdminView ? !canAudit : false
      };
    }
    return config;
  };

  const handleQuickUpdate = async (lesson: Lesson, updates: Partial<Lesson>) => {
    if (!isAdminView || isUpdating) return;
    setIsUpdating(true);
    try { await updateLessonInStudent(user.username, { ...lesson, ...updates }); await fetchData(); } catch (err) { alert(err instanceof Error ? err.message : String(err)); } finally { setIsUpdating(false); }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!isAdminView || !confirm("¿Eliminar?")) return;
    setIsUpdating(true); try { await deleteLessonFromStudent(lessonId); await fetchData(); } catch (err) { alert(err instanceof Error ? err.message : String(err)); } finally { setIsUpdating(false); }
  };

  const handleClearHistory = async (lesson: Lesson) => {
    if (!isAdminView || !confirm("¿Reiniciar y Reprobar esta clase?")) return;
    setIsUpdating(true); 
    try { 
      await clearStudentLessonData(user.id || user.username, user.username, lesson); 
      await fetchData(); 
    } catch (err) { 
      alert(err instanceof Error ? err.message : String(err)); 
    } finally { 
      setIsUpdating(false); 
    }
  };

  if (isLoading) return <div className="py-24 text-center"><div className="animate-spin w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div><p>Cargando...</p></div>;

  return (
    <div className="space-y-6 font-fredoka animate-in fade-in">
      <div className="flex justify-between items-center bg-white dark:bg-indigo-900 p-2 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 shadow-sm">
        <div className="flex">
          <button onClick={() => setActiveSubTab('aula')} className={`px-4 md:px-6 py-2 rounded-xl font-black text-[10px] md:text-xs uppercase transition-all ${activeSubTab === 'aula' ? 'bg-indigo-600 text-white shadow-md' : 'text-indigo-400 hover:bg-indigo-50'}`}>Aula Virtual 📚</button>
          <button onClick={() => setActiveSubTab('banco')} className={`px-4 md:px-6 py-2 rounded-xl font-black text-[10px] md:text-xs uppercase transition-all ${activeSubTab === 'banco' ? 'bg-amber-500 text-white shadow-md' : 'text-amber-500 hover:bg-amber-50'}`}>Estado de Cuenta 🏦</button>
        </div>
        <button onClick={() => setShowAISettings(true)} className="px-4 py-2 rounded-xl font-black text-[10px] md:text-xs uppercase text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
          Llave IA ⚙️
        </button>
      </div>

      {activeSubTab === 'aula' ? (
        <div className="space-y-6">
          <div className="bg-white dark:bg-indigo-900 p-6 rounded-[2.5rem] shadow-sm border-4 border-indigo-50 dark:border-indigo-800 flex flex-col md:flex-row items-center gap-6">
            <div className="flex space-x-8">
               <div className="bg-amber-50 dark:bg-amber-900/30 px-6 py-4 rounded-2xl border-2 border-amber-100 flex flex-col items-center min-w-[160px]">
                  <p className="text-[10px] font-black text-amber-600 uppercase mb-1">TRANSFERIBLES</p>
                  <p className="text-3xl font-black text-amber-500 leading-none mb-2">⭐ {creditsTransferable}</p>
                  {!isAdminView && <button onClick={handleTransfer} disabled={creditsTransferable <= 0} className="text-[11px] font-black uppercase underline text-indigo-600 disabled:opacity-30">Transferir</button>}
               </div>
               <div className="bg-indigo-50 dark:bg-indigo-950 px-6 py-4 rounded-2xl border-2 border-indigo-100 flex flex-col items-center min-w-[160px]">
                  <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">POR GANAR</p>
                  <p className="text-3xl font-black text-indigo-300 leading-none">⭐ {creditsToWin}</p>
               </div>
            </div>
            <div className="flex-1 w-full h-7 bg-indigo-50 dark:bg-indigo-950 rounded-full flex overflow-hidden border-2 border-indigo-100 shadow-inner">
                <div style={{ width: `${weeklyStats.total > 0 ? (weeklyStats.pending/weeklyStats.total)*100 : 0}%` }} className="bg-blue-600 transition-all duration-700"></div>
                <div style={{ width: `${weeklyStats.total > 0 ? (weeklyStats.inProgress/weeklyStats.total)*100 : 0}%` }} className="bg-orange-500 transition-all duration-700"></div>
                <div style={{ width: `${weeklyStats.total > 0 ? (weeklyStats.passed/weeklyStats.total)*100 : 0}%` }} className="bg-green-600 transition-all duration-700"></div>
                <div style={{ width: `${weeklyStats.total > 0 ? (weeklyStats.failed/weeklyStats.total)*100 : 0}%` }} className="bg-red-600 transition-all duration-700"></div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-indigo-900 p-6 rounded-[3rem] border-4 border-indigo-50 dark:border-indigo-800">
                <Calendar 
                  lessons={data?.student_lessons || []} 
                  selectedDate={selectedDay} 
                  onDayClick={setSelectedDay} 
                  weekStart={weekStart} 
                  onWeekStartChange={setWeekStart} 
                  isAdmin={isAdminView} 
                />
              </div>
            </div>

            <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] border-4 border-indigo-50 dark:border-indigo-800 h-fit">
              <h3 className="text-2xl font-black text-indigo-900 dark:text-white uppercase mb-8">Clases del día</h3>
              <div className="space-y-6">
                {dayLessons.length === 0 ? <p className="text-center text-indigo-300 italic uppercase text-xs">Sin lecciones.</p> : dayLessons.map(lesson => {
                  const status = lesson.lesson_status || 'Pendiente';
                  const ui = getLessonUIConfig(status, !!lesson.credits_transfered, lesson.id);
                  const isSelected = quickEditLessonId === lesson.id;
                  
                  // Meta de interacciones (ej. 80% del tiempo en minutos)
                  const targetInteractions = Math.ceil(lesson.durationMinutes * 0.8);

                  return (
                    <div key={lesson.id} className={`p-6 rounded-[2.5rem] border-4 bg-white dark:bg-indigo-950 border-indigo-50 dark:border-indigo-800 relative ${isSelected ? 'ring-4 ring-amber-400' : ''}`}>
                      {isAdminView && isSelected && (
                        <div className="absolute inset-0 bg-white/95 dark:bg-indigo-900/95 z-50 flex flex-col p-4 space-y-3 rounded-[2.5rem]">
                           <div className="flex justify-between items-center"><span className="text-[10px] font-black text-indigo-400">ADMIN</span><button onClick={()=>setQuickEditLessonId(null)} className="text-red-500">✕</button></div>
                           <select value={status} onChange={(e)=>handleQuickUpdate(lesson, {lesson_status: e.target.value as any})} className="bg-indigo-50 dark:bg-indigo-950 p-2 rounded-xl text-[10px] font-black border-2 border-indigo-100">
                              <option value="Pendiente">Pendiente</option><option value="En Progreso">En Progreso</option><option value="Aprobada">Aprobada</option><option value="Reprobada">Reprobada</option><option value="Completada">Completada</option>
                           </select>
                           <input type="number" value={lesson.grade || ''} onChange={(e)=>handleQuickUpdate(lesson, {grade: parseInt(e.target.value)||0})} className="bg-indigo-50 dark:bg-indigo-950 p-2 rounded-xl text-[10px] font-black border-2 border-indigo-100" placeholder="Nota" />
                           <div className="grid grid-cols-2 gap-2"><button onClick={()=>handleClearHistory(lesson)} className="py-2 bg-amber-100 text-amber-600 text-[9px] font-black rounded-xl uppercase">Limpiar 🫧</button><button onClick={()=>{setQuickEditLessonId(null); onEditLessonDetails?.(lesson)}} className="py-2 bg-indigo-100 text-indigo-600 text-[9px] font-black rounded-xl uppercase">Editar ✏️</button></div>
                           <button onClick={()=>handleDeleteLesson(String(lesson.id))} className="w-full py-2 bg-red-50 text-red-500 text-[9px] font-black rounded-xl uppercase">Eliminar 🗑️</button>
                        </div>
                      )}
                      <div 
                        className="cursor-pointer group" 
                        onClick={() => handleToggleExpand(lesson)}
                      >
                        <div className="flex justify-between items-center mb-4">
                          <span className={`${ui.color} ${ui.textColor} text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-wider`}>{lesson.subject}</span>
                          {isAdminView && !isSelected && <button onClick={(e)=>{e.stopPropagation(); setQuickEditLessonId(String(lesson.id))}} className="w-8 h-8 rounded-full bg-slate-100 text-indigo-400 hover:bg-indigo-600 hover:text-white">⚙️</button>}
                        </div>
                        <h4 className="text-lg font-black text-indigo-900 dark:text-white uppercase mb-4 leading-tight group-hover:text-indigo-600 transition-colors flex justify-between items-center">
                          <span>🧠 {lesson.title}</span>
                          <span className="text-xs opacity-50 bg-indigo-50 dark:bg-indigo-900 px-2 py-1 rounded-lg">
                            {expandedLessonId === String(lesson.id) ? '▲ Ocultar' : '▼ Temario'}
                          </span>
                        </h4>
                      </div>

                      {/* Temario Expandible Inline */}
                      {expandedLessonId === String(lesson.id) && (
                        <div className="mb-6 bg-indigo-50/50 dark:bg-indigo-900/20 p-5 rounded-2xl border border-indigo-100/50 animate-in slide-in-from-top-2 duration-200">
                          <p className="text-[10px] font-black text-indigo-400 uppercase mb-3 tracking-widest">Temas a estudiar hoy:</p>
                          {isFetchingInlineTopics ? (
                            <div className="space-y-2">
                              {[1,2].map(i => <div key={i} className="h-4 bg-indigo-100 dark:bg-indigo-800/50 rounded animate-pulse w-3/4"></div>)}
                            </div>
                          ) : inlineTopics.length > 0 ? (
                            <ul className="space-y-2">
                              {inlineTopics.map((topic, i) => (
                                <li key={topic.id} className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-start">
                                  <span className="text-amber-500 mr-2 mt-0.5">•</span> 
                                  <span>{topic.titulo}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-indigo-400 italic">No se encontraron temas detallados.</p>
                          )}
                        </div>
                      )}
                      
                      {/* Detalles adicionales de la lección - Cuadrícula 2x2 */}
                      <div className="grid grid-cols-2 gap-3 mb-6 text-center">
                        <div className="bg-indigo-50/50 dark:bg-indigo-900/30 p-2 rounded-2xl border border-indigo-100/50 flex flex-col justify-center">
                          <p className="text-[8px] font-black text-indigo-400 uppercase leading-none mb-1">Estatus</p>
                          <p className={`text-[10px] font-black uppercase ${ui.color.replace('bg-', 'text-')}`}>
                            {status}
                          </p>
                        </div>
                        <div className="bg-indigo-50/50 dark:bg-indigo-900/30 p-2 rounded-2xl border border-indigo-100/50 flex flex-col justify-center">
                          <p className="text-[8px] font-black text-indigo-400 uppercase leading-none mb-1">Tiempo</p>
                          <p className="text-[10px] font-black text-indigo-900 dark:text-white">
                            {Math.floor((lesson.elapsedSeconds || 0) / 60)}:{String((lesson.elapsedSeconds || 0) % 60).padStart(2, '0')}s / {lesson.durationMinutes}:00
                          </p>
                        </div>
                        <div className="bg-indigo-50/50 dark:bg-indigo-900/30 p-2 rounded-2xl border border-indigo-100/50 flex flex-col justify-center">
                          <p className="text-[8px] font-black text-indigo-400 uppercase leading-none mb-1">Temas</p>
                          <p className="text-[10px] font-black text-indigo-900 dark:text-white">
                            {lesson.completedTopicsCount || 0} / 10
                          </p>
                        </div>
                        <div className="bg-indigo-50/50 dark:bg-indigo-900/30 p-2 rounded-2xl border border-indigo-100/50 flex flex-col justify-center">
                          <p className="text-[8px] font-black text-indigo-400 uppercase leading-none mb-1">Créditos</p>
                          <p className="text-[10px] font-black text-indigo-900 dark:text-white">{lesson.grade || 0}/10</p>
                        </div>
                      </div>

                      <button 
                        onClick={() => onHandleLessonClick(lesson)} 
                        disabled={ui.disabled}
                        className={`w-full py-4 rounded-2xl font-black text-xs shadow-xl active:scale-95 ${ui.color} ${ui.textColor} uppercase transition-all ${ui.disabled ? 'opacity-50 grayscale cursor-not-allowed shadow-none' : 'hover:brightness-110'}`}
                      >
                        {ui.btnText}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] border-4 border-amber-100 flex items-center space-x-6">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center text-4xl">🏦</div>
            <div><p className="text-xs font-black text-amber-600 uppercase mb-1">Saldo Bancario</p><p className="text-4xl font-black text-amber-500">MXN ${currentBalance.toFixed(2)}</p></div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Formulario de transferencia bancaria */}
            {!isAdminView && (
              <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] border-4 border-indigo-50 shadow-sm">
                  <h3 className="text-xl font-black text-indigo-900 dark:text-white uppercase mb-6">Transferir Fondos 💸</h3>
                  <form onSubmit={handleFundsTransfer} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <select value={transferTo} onChange={e=>setTransferTo(e.target.value)} className="p-3 bg-indigo-50 dark:bg-indigo-950 rounded-xl font-bold dark:text-white" required>
                          <option value="">Destino...</option><option value={ADMIN_UUID}>🏦 BANCO (ADMIN)</option>
                          {otherStudents.map(s => <option key={s.id || s.username} value={s.id || s.username}>👨‍🎓 {s.username.toUpperCase()}</option>)}
                      </select>
                      <input type="number" step="0.01" min="0.01" value={transferAmount} onChange={e=>setTransferAmount(e.target.value)} placeholder="0.00" className="p-3 bg-indigo-50 dark:bg-indigo-950 rounded-xl font-bold dark:text-white" required />
                      <input type="text" value={transferConcept} onChange={e=>setTransferConcept(e.target.value)} placeholder="Concepto..." className="md:col-span-2 p-3 bg-indigo-50 dark:bg-indigo-950 rounded-xl font-bold dark:text-white" required />
                      <button type="submit" disabled={isTransferringFunds} className="md:col-span-2 py-4 bg-amber-500 text-white font-black rounded-2xl shadow-xl uppercase disabled:opacity-50">Transferir Fondos</button>
                  </form>
              </div>
            )}

            {/* Historial de Transacciones */}
            <div className={`bg-white dark:bg-indigo-900 p-8 rounded-[3rem] border-4 border-indigo-50 shadow-sm ${isAdminView ? 'lg:col-span-2' : ''}`}>
              <h3 className="text-xl font-black text-indigo-900 dark:text-white uppercase mb-6">Historial de Movimientos 📑</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b-4 border-indigo-50 dark:border-indigo-800">
                    <tr className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                      <th className="pb-4 pr-4">Fecha</th>
                      <th className="pb-4 pr-4">Destino</th>
                      <th className="pb-4 pr-4">Monto</th>
                      <th className="pb-4">Concepto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-50 dark:divide-indigo-800">
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-indigo-300 italic uppercase text-xs">No hay movimientos registrados.</td>
                      </tr>
                    ) : (
                      transactions.map(tx => {
                        const isOutgoing = tx.from_account === (user.id || user.username);
                        const otherParty = isOutgoing ? tx.to_account : tx.from_account;
                        return (
                          <tr key={tx.id} className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200">
                            <td className="py-4 pr-4">{new Date(tx.created_at).toLocaleDateString()}</td>
                            <td className="py-4 pr-4 truncate max-w-[100px]">{userMap[otherParty] || otherParty}</td>
                            <td className={`py-4 pr-4 font-black ${isOutgoing ? 'text-red-500' : 'text-green-500'}`}>
                              {isOutgoing ? '-' : '+'} ${tx.amount.toFixed(2)}
                            </td>
                            <td className="py-4 truncate max-w-[150px]">{tx.concept}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {showClassroom && pendingLesson && (
        <VirtualClassroom 
          lesson={pendingLesson} 
          user={user}
          onClose={() => { setShowClassroom(false); setPendingLesson(null); fetchData(); }} 
          onLessonAccredited={(grade) => {
            fetchData();
          }}
        />
      )}

      {showAISettings && (
        <div className="fixed inset-0 bg-indigo-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-indigo-950 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-black text-indigo-900 dark:text-white uppercase mb-4 text-center">Configurar Llave IA (Gemini)</h3>
            <p className="text-xs text-indigo-500 text-center mb-6 font-bold">Si deseas utilizar tu propia cuenta de Google Gemini para procesar las clases, ingresa tu API Key aquí. Se guardará localmente en tu navegador.</p>
            
            <div className="relative mb-4">
              <input 
                type="password"
                placeholder="Pega tu API Key principal de Gemini..."
                className="w-full bg-indigo-50 dark:bg-indigo-900/30 border-2 border-indigo-100 dark:border-indigo-800 rounded-2xl px-5 py-3 text-sm font-bold text-indigo-900 dark:text-white focus:outline-none focus:border-indigo-400"
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
              />
              {localStorage.getItem('student_gemini_api_key') && (
                <p className="text-[10px] text-green-600 dark:text-green-400 font-bold mt-1 px-2">✅ Llave guardada en tu navegador</p>
              )}
            </div>
            
            <div className="relative mb-4">
              <input 
                type="password"
                placeholder="Pega tu API Key de Respaldo (OpenRouter / Groq)..."
                className="w-full bg-orange-50 dark:bg-orange-900/30 border-2 border-orange-100 dark:border-orange-800 rounded-2xl px-5 py-3 text-sm font-bold text-orange-900 dark:text-white focus:outline-none focus:border-orange-400"
                value={customFallbackApiKey}
                onChange={(e) => setCustomFallbackApiKey(e.target.value)}
              />
              {localStorage.getItem('student_fallback_api_key') && (
                <p className="text-[10px] text-green-600 dark:text-green-400 font-bold mt-1 px-2">✅ Llave guardada en tu navegador</p>
              )}
            </div>

            <div className="relative mb-6">
              <input 
                type="password"
                placeholder="Pega tu API Key de Cerebras (Fallback Extra)..."
                className="w-full bg-red-50 dark:bg-red-900/30 border-2 border-red-100 dark:border-red-800 rounded-2xl px-5 py-3 text-sm font-bold text-red-900 dark:text-white focus:outline-none focus:border-red-400"
                value={customCerebrasApiKey}
                onChange={(e) => setCustomCerebrasApiKey(e.target.value)}
              />
              {localStorage.getItem('student_cerebras_api_key') && (
                <p className="text-[10px] text-green-600 dark:text-green-400 font-bold mt-1 px-2">✅ Llave guardada en tu navegador</p>
              )}
            </div>
            
            <div className="flex gap-4">
              <button 
                onClick={() => setShowAISettings(false)}
                className="flex-1 py-3 rounded-2xl font-black text-xs uppercase text-indigo-400 hover:bg-indigo-50 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  if (customApiKey.trim()) {
                    localStorage.setItem('student_gemini_api_key', customApiKey.trim());
                  } else {
                    localStorage.removeItem('student_gemini_api_key');
                  }
                  
                  if (customFallbackApiKey.trim()) {
                    localStorage.setItem('student_fallback_api_key', customFallbackApiKey.trim());
                  } else {
                    localStorage.removeItem('student_fallback_api_key');
                  }
                  
                  if (customCerebrasApiKey.trim()) {
                    localStorage.setItem('student_cerebras_api_key', customCerebrasApiKey.trim());
                  } else {
                    localStorage.removeItem('student_cerebras_api_key');
                  }
                  
                  alert('Configuración guardada en tu navegador.');
                  setShowAISettings(false);
                }}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase shadow-md transition-colors"
              >
                Guardar Llave
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default StudentDashboard;