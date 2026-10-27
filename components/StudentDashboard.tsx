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
  getPublicUsers, 
  executeStudentTransfer, 
  checkAuditStatus, 
  getAuditStatusesBulk, 
  getCourses, 
  getClasses, 
  getTopics,
  assignDemoCourseToStudent,
  getDemoLessonDates
} from '../storage2';
import { getAiProvider, setAiProvider } from '../geminiService2';
import Calendar from './Calendar';
import VirtualClassroom from './VirtualClassroom';
import AuditModal from './AuditModal';

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
  const [activeSubTab, setActiveSubTab] = useState<'aula' | 'banco' | 'cursos'>('aula');
  const [data, setData] = useState<StudentData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransferring, setIsTransferring] = useState(false);
  const [quickEditLessonId, setQuickEditLessonId] = useState<string | null>(null);
  const [quickEditDraft, setQuickEditDraft] = useState<{
    lesson_status: Lesson['lesson_status'];
    completedTopicsCount: number;
    grade: number;
  } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [auditStatuses, setAuditStatuses] = useState<Record<string, { hasGeminiLesson: boolean, hasExamAttempts: boolean }>>({});

  // Cursos y Catálogo
  const [coursesList, setCoursesList] = useState<any[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [courseClassesMap, setCourseClassesMap] = useState<Record<string, any[]>>({});
  const [loadingCourseClasses, setLoadingCourseClasses] = useState<Record<string, boolean>>({});
  const [expandedClassTopics, setExpandedClassTopics] = useState<Record<string, any[]>>({});
  const [loadingClassTopics, setLoadingClassTopics] = useState<Record<string, boolean>>({});

  // Modal de Asignación Demo para Nuevos Estudiantes
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [selectedDemoCourseId, setSelectedDemoCourseId] = useState<string>('');
  const [isAssigningDemo, setIsAssigningDemo] = useState(false);

  // Estados para el Interceptor de Ruta
  const [pendingLesson, setPendingLesson] = useState<Lesson | null>(null);
  const [showClassroom, setShowClassroom] = useState(false);
  const [auditLesson, setAuditLesson] = useState<Lesson | null>(null);

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
  const [aiProvider, setLocalAiProvider] = useState(getAiProvider());
  
  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProv = e.target.value;
    setLocalAiProvider(newProv);
    setAiProvider(newProv);
  };
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('student_gemini_api_key') || '');
  const [customFallbackApiKey, setCustomFallbackApiKey] = useState(() => localStorage.getItem('student_fallback_api_key') || '');
  const [customCerebrasApiKey, setCustomCerebrasApiKey] = useState(() => localStorage.getItem('student_cerebras_api_key') || '');

  const [studentProfile, setStudentProfile] = useState('');
  const [teacherProfile, setTeacherProfile] = useState('');
  const [showProfileSettings, setShowProfileSettings] = useState(false);

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

  // Fechas Demo calculadas
  const demoDates = useMemo(() => getDemoLessonDates(), []);

  const formatFriendlyDate = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      const dayName = date.toLocaleDateString('es-ES', { weekday: 'long' });
      const formatted = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
      return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} (${formatted})`;
    } catch {
      return dateStr;
    }
  };

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
      const [studentData, history, balance, allUsers, allCourses] = await Promise.all([
        getStudentData(user.username),
        getTransactions(ownerId),
        getAccountBalance(ownerId),
        getPublicUsers(),
        getCourses()
      ]);
      setData(studentData);
      setTransactions(history);
      setCurrentBalance(balance);
      setOtherStudents(allUsers.filter(u => (u.id || u.username) !== ownerId && u.role === Role.STUDENT));
      setCoursesList(allCourses || []);

      const currentUserData = allUsers.find(u => u.username === user.username);
      if (currentUserData) {
        setStudentProfile(currentUserData.student_profile || '');
        setTeacherProfile(currentUserData.preferred_teacher_profile || '');
      }

      // Si es un nuevo usuario sin clases asignadas, abrir automáticamente la pantalla de bienvenida y Demo
      if (!isAdminView && (!studentData?.student_lessons || studentData.student_lessons.length === 0)) {
        setShowDemoModal(true);
      } else {
        setShowDemoModal(false);
      }
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
      await executeCreditTransfer(user.id || user.username, realSum, pending.map(l => String(l.id)));
      await fetchData();
      if (onBalanceUpdate) onBalanceUpdate();
      alert("¡Transferencia completada!");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Error al transferir.");
    } finally {
      setIsTransferring(false);
    }
  };

  const handleFundsTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(transferAmount);
    if (!transferTo || isNaN(amountNum) || amountNum <= 0) {
      alert("Ingresa un destinatario y monto válido.");
      return;
    }
    if (amountNum > currentBalance) {
      alert("Saldo insuficiente.");
      return;
    }
    if (!transferConcept.trim()) {
      alert("Ingresa un concepto.");
      return;
    }

    setIsTransferringFunds(true);
    try {
      await executeStudentTransfer(user.id || user.username, transferTo, amountNum, transferConcept.trim());
      await fetchData();
      if (onBalanceUpdate) onBalanceUpdate();
      setTransferTo('');
      setTransferAmount('');
      setTransferConcept('');
      alert("¡Transferencia enviada con éxito!");
    } catch (err: any) {
      alert(err.message || "Error al procesar transferencia.");
    } finally {
      setIsTransferringFunds(false);
    }
  };

  // Función para activar la materia Demo
  const handleAssignDemo = async () => {
    if (!selectedDemoCourseId) {
      alert("Por favor selecciona una materia de la lista para tu demostración.");
      return;
    }

    setIsAssigningDemo(true);
    try {
      const res = await assignDemoCourseToStudent(user.username, selectedDemoCourseId);
      setShowDemoModal(false);
      await fetchData();
      setActiveSubTab('aula');
      alert(`🎉 ¡Felicidades! Se ha activado tu materia DEMO: "${res.courseName}".\nSe programaron tus 3 clases gratuitas para los días:\n${res.dates.map(d => formatFriendlyDate(d)).join('\n')}`);
    } catch (err: any) {
      alert(err?.message || "Ocurrió un error al asignar tu materia demo.");
    } finally {
      setIsAssigningDemo(false);
    }
  };

  // Funciones para el Catálogo de Cursos
  const toggleExpandCourse = async (courseId: string) => {
    if (expandedCourseId === courseId) {
      setExpandedCourseId(null);
      return;
    }
    setExpandedCourseId(courseId);
    if (!courseClassesMap[courseId]) {
      setLoadingCourseClasses(prev => ({ ...prev, [courseId]: true }));
      try {
        const classes = await getClasses(courseId);
        setCourseClassesMap(prev => ({ ...prev, [courseId]: classes || [] }));
      } catch (err) {
        console.error("Error al cargar clases del curso:", err);
      } finally {
        setLoadingCourseClasses(prev => ({ ...prev, [courseId]: false }));
      }
    }
  };

  const toggleExpandClassTopics = async (classId: string) => {
    if (expandedClassTopics[classId]) {
      setExpandedClassTopics(prev => {
        const copy = { ...prev };
        delete copy[classId];
        return copy;
      });
      return;
    }
    setLoadingClassTopics(prev => ({ ...prev, [classId]: true }));
    try {
      const topics = await getTopics(classId);
      setExpandedClassTopics(prev => ({ ...prev, [classId]: topics || [] }));
    } catch (err) {
      console.error("Error al cargar temas de la clase:", err);
    } finally {
      setLoadingClassTopics(prev => ({ ...prev, [classId]: false }));
    }
  };

  const onHandleLessonClick = async (lesson: Lesson) => {
    if (isAdminView) {
      if (auditStatuses[lesson.id]?.hasGeminiLesson) {
        setAuditLesson(lesson);
      } else {
        alert("El estudiante aún no genera contenido para esta lección.");
      }
      return;
    }
    setPendingLesson(lesson);
    setShowClassroom(true);
  };

  const getLessonUIConfig = (status: string, creditsTransfered: boolean, lessonId: string) => {
    const canAudit = isAdminView ? !!auditStatuses[lessonId]?.hasGeminiLesson : false;
    let config = {
      color: 'bg-indigo-600',
      label: 'PENDIENTE',
      btnText: isAdminView ? 'AUDITAR LECCIÓN' : 'INICIAR CLASE 🚀',
      textColor: 'text-white',
      disabled: isAdminView ? !canAudit : false
    };

    if (creditsTransfered) {
      config = { 
        color: 'bg-slate-400', 
        label: 'CRÉDITOS TRANSFERIDOS', 
        btnText: isAdminView ? 'AUDITAR LECCIÓN' : 'REVISAR CLASE 📖', 
        textColor: 'text-white',
        disabled: isAdminView ? !canAudit : false
      };
    } else if (status === 'Aprobada' || status === 'Completada') {
      config = { 
        color: 'bg-green-600', 
        label: 'APROBADA', 
        btnText: isAdminView ? 'AUDITAR LECCIÓN' : 'REPASAR CLASE 🔄', 
        textColor: 'text-white',
        disabled: isAdminView ? !canAudit : false
      };
    } else if (status === 'Reprobada') {
      config = { 
        color: 'bg-red-600', 
        label: 'REPROBADA', 
        btnText: isAdminView ? 'AUDITAR LECCIÓN' : 'REINTENTAR CLASE ⚠️', 
        textColor: 'text-white',
        disabled: isAdminView ? !canAudit : false
      };
    } else if (status === 'En Progreso') {
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

  const openQuickEdit = (lesson: Lesson) => {
    setQuickEditLessonId(String(lesson.id));
    setQuickEditDraft({
      lesson_status: lesson.lesson_status || 'Pendiente',
      completedTopicsCount: lesson.completedTopicsCount || 0,
      grade: lesson.grade || 0
    });
  };

  const handleSaveQuickEdit = async (lesson: Lesson) => {
    if (!quickEditDraft || isUpdating) return;
    const temas = Math.max(0, Math.min(10, Number(quickEditDraft.completedTopicsCount) || 0));
    const creditos = Math.max(0, Math.min(10, Number(quickEditDraft.grade) || 0));
    const status = quickEditDraft.lesson_status || 'Pendiente';
    setIsUpdating(true);
    try {
      await updateLessonInStudent(user.username, {
        ...lesson,
        lesson_status: status,
        completedTopicsCount: temas,
        grade: creditos,
        completed: status === 'Aprobada' || status === 'Completada'
      });
      await fetchData();
      setQuickEditLessonId(null);
      setQuickEditDraft(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUpdating(false);
    }
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

  const filteredCatalogCourses = coursesList.filter(c => 
    c.nombre.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  const hasNoLessons = !data?.student_lessons || data.student_lessons.length === 0;

  return (
    <div className="space-y-6 font-fredoka animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center bg-white dark:bg-indigo-900 p-2 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 shadow-sm gap-2">
        <div className="flex bg-indigo-50 dark:bg-indigo-950 p-1 rounded-2xl border-2 border-indigo-100 dark:border-indigo-800 overflow-x-auto">
          <button 
            onClick={() => setActiveSubTab('aula')} 
            className={`px-4 md:px-6 py-2 rounded-xl font-black text-[10px] md:text-xs uppercase transition-all whitespace-nowrap ${
              activeSubTab === 'aula' ? 'bg-indigo-600 text-white shadow-md' : 'text-indigo-400 hover:text-indigo-600'
            }`}
          >
            Aula Virtual 📚
          </button>
          <button 
            onClick={() => setActiveSubTab('banco')} 
            className={`px-4 md:px-6 py-2 rounded-xl font-black text-[10px] md:text-xs uppercase transition-all whitespace-nowrap ${
              activeSubTab === 'banco' ? 'bg-amber-500 text-white shadow-md' : 'text-amber-500 hover:text-amber-600'
            }`}
          >
            Estado de Cuenta 🏦
          </button>
          <button 
            onClick={() => setActiveSubTab('cursos')} 
            className={`px-4 md:px-6 py-2 rounded-xl font-black text-[10px] md:text-xs uppercase transition-all whitespace-nowrap ${
              activeSubTab === 'cursos' ? 'bg-purple-600 text-white shadow-md' : 'text-purple-500 hover:text-purple-600'
            }`}
          >
            Cursos Disponibles 📖
          </button>
        </div>

        <div className="flex items-center justify-end space-x-1">
          {!isAdminView && hasNoLessons && (
            <button 
              onClick={() => setShowDemoModal(true)} 
              className="px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-[10px] md:text-xs font-black uppercase shadow-md hover:scale-105 transition-transform flex items-center gap-1 animate-pulse"
            >
              🎁 Materia Demo Gratis
            </button>
          )}

          <select 
            value={aiProvider} 
            onChange={handleProviderChange} 
            className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 rounded-xl text-[10px] md:text-xs font-black uppercase border-2 border-indigo-100 dark:border-indigo-800 outline-none"
          >
            <option value="gemini">Gemini</option>
            <option value="openrouter">OpenRouter (Auto)</option>
            <option value="cerebras">Llama 3.1 8B</option>
          </select>
          <button onClick={() => setShowProfileSettings(true)} className="px-3 py-2 rounded-xl font-black text-[10px] md:text-xs uppercase text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
            Perfil 👤
          </button>
          <button onClick={() => setShowAISettings(true)} className="px-3 py-2 rounded-xl font-black text-[10px] md:text-xs uppercase text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
            Llave IA ⚙️
          </button>
        </div>
      </div>

      {activeSubTab === 'aula' ? (
        <div className="space-y-6">
          {hasNoLessons && !isAdminView && (
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-6 rounded-[2.5rem] shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">🎉 ¡Aún no tienes clases asignadas!</h3>
                <p className="text-xs font-bold text-indigo-100 mt-1">
                  Activa tu <span className="underline">Materia DEMO Gratis</span> de 3 clases por una semana (un día sí y un día no) para comenzar de inmediato.
                </p>
              </div>
              <button
                onClick={() => setShowDemoModal(true)}
                className="bg-white text-indigo-900 font-black px-6 py-3 rounded-2xl shadow-md text-xs uppercase tracking-wider hover:bg-indigo-50 transition-all shrink-0"
              >
                Elegir Materia Demo 🚀
              </button>
            </div>
          )}

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
                  
                  return (
                    <div key={lesson.id} className={`p-6 rounded-[2.5rem] border-4 bg-white dark:bg-indigo-950 border-indigo-50 dark:border-indigo-800 relative ${isSelected ? 'ring-4 ring-amber-400' : ''}`}>
                      {isAdminView && isSelected && quickEditDraft && (
                        <div className="absolute inset-0 bg-white/95 dark:bg-indigo-900/95 z-50 flex flex-col p-4 space-y-2 rounded-[2.5rem] overflow-y-auto">
                           <div className="flex justify-between items-center"><span className="text-[10px] font-black text-indigo-400">ADMIN</span><button onClick={()=>{setQuickEditLessonId(null); setQuickEditDraft(null);}} className="text-red-500">✕</button></div>
                           <label className="text-[8px] font-black text-indigo-400 uppercase">Estatus</label>
                           <select value={quickEditDraft.lesson_status} onChange={(e)=>setQuickEditDraft({...quickEditDraft, lesson_status: e.target.value as Lesson['lesson_status']})} className="bg-indigo-50 dark:bg-indigo-950 p-2 rounded-xl text-[10px] font-black border-2 border-indigo-100">
                              <option value="Pendiente">Pendiente</option><option value="En Progreso">En Progreso</option><option value="Aprobada">Aprobada</option><option value="Reprobada">Reprobada</option><option value="Completada">Completada</option>
                           </select>
                           <div className="grid grid-cols-2 gap-2">
                             <div>
                               <label className="text-[8px] font-black text-indigo-400 uppercase">Temas</label>
                               <input type="number" min="0" max="10" value={quickEditDraft.completedTopicsCount} onChange={(e)=>setQuickEditDraft({...quickEditDraft, completedTopicsCount: Number(e.target.value)})} className="w-full bg-indigo-50 dark:bg-indigo-950 p-2 rounded-xl text-[10px] font-black border-2 border-indigo-100" />
                             </div>
                             <div>
                               <label className="text-[8px] font-black text-indigo-400 uppercase">Créditos</label>
                               <input type="number" min="0" max="10" value={quickEditDraft.grade} onChange={(e)=>setQuickEditDraft({...quickEditDraft, grade: Number(e.target.value)})} className="w-full bg-indigo-50 dark:bg-indigo-950 p-2 rounded-xl text-[10px] font-black border-2 border-indigo-100" />
                             </div>
                           </div>
                           <div className="flex space-x-2 pt-2">
                             <button onClick={()=>handleSaveQuickEdit(lesson)} className="flex-1 bg-green-600 text-white font-black text-[10px] py-2 rounded-xl uppercase">Guardar</button>
                             <button onClick={()=>handleClearHistory(lesson)} className="bg-orange-500 text-white font-black text-[10px] px-3 py-2 rounded-xl uppercase" title="Reiniciar chat y reprobar">Reiniciar</button>
                             <button onClick={()=>handleDeleteLesson(lesson.id)} className="bg-red-600 text-white font-black text-[10px] px-3 py-2 rounded-xl uppercase" title="Eliminar lección">Borrar</button>
                           </div>
                        </div>
                      )}

                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center space-x-2">
                          <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${ui.color} ${ui.textColor}`}>
                            {ui.label}
                          </span>
                          {isAdminView && (
                            <button onClick={()=>openQuickEdit(lesson)} className="text-[10px] bg-indigo-50 dark:bg-indigo-900 border border-indigo-200 dark:border-indigo-700 px-2 py-1 rounded-lg text-indigo-600 dark:text-indigo-300 font-black hover:bg-indigo-100">
                              ⚙️
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] font-black text-indigo-300 uppercase">
                          {lesson.durationMinutes || 30} MIN
                        </span>
                      </div>

                      <p className="text-[10px] font-black text-indigo-400 dark:text-indigo-300 uppercase tracking-widest mb-1">
                        {lesson.subject}
                      </p>
                      <h4 className="text-xl font-black text-indigo-950 dark:text-white uppercase leading-tight mb-2">
                        {lesson.title}
                      </h4>
                      {lesson.learningPrompt && (
                        <p className="text-xs text-indigo-600 dark:text-indigo-300 font-bold mb-4 line-clamp-2">
                          {lesson.learningPrompt}
                        </p>
                      )}

                      {/* Botón para ver Microtemas de la Clase */}
                      <div className="mb-4">
                        <button
                          onClick={async () => {
                            if (expandedLessonId === lesson.id) {
                              setExpandedLessonId(null);
                              setInlineTopics([]);
                              return;
                            }
                            setExpandedLessonId(lesson.id);
                            setIsFetchingInlineTopics(true);
                            try {
                              const courses = await getCourses();
                              const course = courses.find((c: any) => c.nombre.toLowerCase() === (lesson.subject || '').toLowerCase());
                              if (course) {
                                const classes = await getClasses(course.id);
                                const foundCls = classes.find((cl: any) => cl.titulo.toLowerCase() === lesson.title.toLowerCase());
                                if (foundCls) {
                                  const topics = await getTopics(foundCls.id);
                                  setInlineTopics(topics);
                                } else {
                                  setInlineTopics([]);
                                }
                              } else {
                                setInlineTopics([]);
                              }
                            } catch (e) {
                              console.error(e);
                              setInlineTopics([]);
                            } finally {
                              setIsFetchingInlineTopics(false);
                            }
                          }}
                          className="text-[10px] font-black uppercase text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1"
                        >
                          {expandedLessonId === lesson.id ? '▲ Ocultar Temas' : '▼ Ver Temas de esta Clase'}
                        </button>

                        {expandedLessonId === lesson.id && (
                          <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-900/50 rounded-2xl border border-indigo-100 dark:border-indigo-800 space-y-2 animate-in fade-in">
                            <p className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Temario de la lección:</p>
                            {isFetchingInlineTopics ? (
                              <p className="text-[10px] text-indigo-400 italic">Cargando temas...</p>
                            ) : inlineTopics.length === 0 ? (
                              <p className="text-[10px] text-indigo-400 italic">No hay temas desglosados registrados para esta lección.</p>
                            ) : (
                              <ul className="space-y-1.5">
                                {inlineTopics.map((top, idx) => (
                                  <li key={top.id || idx} className="text-[10px] font-bold text-indigo-900 dark:text-indigo-200 flex items-start gap-1.5">
                                    <span className="text-indigo-500 font-black">•</span>
                                    <span>{top.titulo}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="bg-indigo-50/50 dark:bg-indigo-900/30 p-2 rounded-2xl border border-indigo-100/50 flex flex-col justify-center">
                          <p className="text-[8px] font-black text-indigo-400 uppercase leading-none mb-1">Temas</p>
                          <p className="text-[10px] font-black text-indigo-900 dark:text-white">{lesson.completedTopicsCount || 0}/10</p>
                        </div>
                        <div className="bg-indigo-50/50 dark:bg-indigo-900/30 p-2 rounded-2xl border border-indigo-100/50 flex flex-col justify-center">
                          <p className="text-[8px] font-black text-indigo-400 uppercase leading-none mb-1">Créditos</p>
                          <p className="text-[10px] font-black text-indigo-900 dark:text-white">{lesson.grade || 0}/10</p>
                        </div>
                      </div>

                      { (status === 'Aprobada' || status === 'Completada') && !isAdminView ? (
                         <div className="grid grid-cols-2 gap-2">
                           <button 
                             onClick={() => onHandleLessonClick(lesson)}
                             disabled={ui.disabled}
                             className={`w-full ${ui.color} ${ui.textColor} text-[10px] md:text-sm font-black py-4 rounded-2xl uppercase tracking-widest shadow-xl transition-all disabled:opacity-50`}
                           >
                             {ui.btnText}
                           </button>
                           <button 
                             onClick={() => setAuditLesson(lesson)}
                             className="w-full bg-slate-800 text-white text-[10px] md:text-sm font-black py-4 rounded-2xl uppercase tracking-widest shadow-xl transition-all hover:bg-slate-700 flex items-center justify-center gap-1"
                           >
                             AUDITAR 🔍
                           </button>
                         </div>
                      ) : (
                         <button 
                           onClick={() => onHandleLessonClick(lesson)}
                           disabled={ui.disabled}
                           className={`w-full ${ui.color} ${ui.textColor} font-black py-4 rounded-2xl uppercase tracking-widest shadow-xl transition-all disabled:opacity-50`}
                         >
                           {ui.btnText}
                         </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : activeSubTab === 'banco' ? (
        <div className="space-y-6">
          <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] border-4 border-amber-100 flex items-center space-x-6">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center text-4xl">🏦</div>
            <div><p className="text-xs font-black text-amber-600 uppercase mb-1">Saldo Bancario</p><p className="text-4xl font-black text-amber-500">MXN ${currentBalance.toFixed(2)}</p></div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
      ) : (
        /* PESTAÑA: CATÁLOGO DE CURSOS DISPONIBLES (MODO SOLO LECTURA / EXPLORACIÓN) */
        <div className="space-y-6">
          <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] border-4 border-purple-100 dark:border-indigo-800 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-2xl font-black text-indigo-950 dark:text-white uppercase tracking-tight">
                  Catálogo de Cursos Disponibles 📖
                </h3>
                <p className="text-xs font-bold text-indigo-400 dark:text-indigo-300 uppercase tracking-widest mt-1">
                  Explora las materias y clases diseñadas para tu formación
                </p>
              </div>

              <div className="w-full md:w-72">
                <input 
                  type="text" 
                  value={catalogSearch} 
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Buscar materia o curso..." 
                  className="w-full px-5 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950 border-2 border-indigo-100 dark:border-indigo-800 text-xs font-bold text-indigo-900 dark:text-white outline-none focus:border-purple-500 transition-colors placeholder:text-indigo-300"
                />
              </div>
            </div>

            {/* Aviso de Asignación por el Administrador */}
            <div className="bg-purple-50 dark:bg-purple-950/40 border-2 border-purple-200 dark:border-purple-800 p-5 rounded-3xl flex items-start gap-3 mb-6">
              <span className="text-2xl shrink-0">🔒</span>
              <div className="text-xs">
                <p className="font-black text-purple-900 dark:text-purple-200 uppercase tracking-wide mb-1">
                  Cursos Asignados por la Administración
                </p>
                <p className="font-semibold text-purple-700 dark:text-purple-300 leading-relaxed">
                  Los estudiantes pueden consultar aquí los contenidos y temarios de todas las materias. Las materias completas son programadas y asignadas exclusivamente por el profesor o la administración escolar. Si te interesa cursar una materia completa, solicítalo con tu administrador.
                </p>
              </div>
            </div>

            {/* Grid de Cursos */}
            {filteredCatalogCourses.length === 0 ? (
              <p className="text-center py-12 text-indigo-300 italic uppercase text-xs">
                No se encontraron cursos disponibles con ese nombre.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredCatalogCourses.map(course => {
                  const isExpanded = expandedCourseId === String(course.id);
                  const classes = courseClassesMap[String(course.id)] || [];
                  const isLoadingClasses = !!loadingCourseClasses[String(course.id)];

                  return (
                    <div 
                      key={course.id}
                      className="bg-white dark:bg-indigo-950 p-6 rounded-[2.5rem] border-4 border-indigo-50 dark:border-indigo-800 shadow-sm flex flex-col justify-between transition-all"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-[10px] font-black uppercase rounded-full">
                            Materia Oficial
                          </span>
                          {!isAdminView && hasNoLessons && (
                            <button
                              onClick={() => {
                                setSelectedDemoCourseId(String(course.id));
                                setShowDemoModal(true);
                              }}
                              className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900 px-3 py-1 rounded-full border border-indigo-200 hover:bg-indigo-100 transition-colors"
                            >
                              🎁 Elegir en Demo
                            </button>
                          )}
                        </div>

                        <h4 className="text-xl font-black text-indigo-900 dark:text-white uppercase leading-tight mb-2">
                          {course.nombre}
                        </h4>

                        {course.descripcion && (
                          <p className="text-xs text-indigo-600 dark:text-indigo-300 font-semibold mb-4">
                            {course.descripcion}
                          </p>
                        )}
                      </div>

                      <div className="pt-4 border-t-2 border-indigo-50 dark:border-indigo-900/60 mt-4">
                        <button
                          onClick={() => toggleExpandCourse(String(course.id))}
                          className="w-full py-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 rounded-2xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                        >
                          <span>{isExpanded ? 'Ocultar Clases ▲' : 'Explorar Clases y Temas ▼'}</span>
                        </button>

                        {/* Desglose de Clases y Microtemas */}
                        {isExpanded && (
                          <div className="mt-4 pt-3 space-y-3 animate-in fade-in">
                            {isLoadingClasses ? (
                              <p className="text-center text-xs text-indigo-400 italic py-4">Cargando clases...</p>
                            ) : classes.length === 0 ? (
                              <p className="text-center text-xs text-indigo-400 italic py-4">Este curso aún no tiene clases dadas de alta.</p>
                            ) : (
                              <div className="space-y-3">
                                <p className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">
                                  Clases del Curso ({classes.length}):
                                </p>
                                {classes.map((cls: any, index: number) => {
                                  const isClassExpanded = !!expandedClassTopics[String(cls.id)];
                                  const topics = expandedClassTopics[String(cls.id)] || [];
                                  const isLoadingTopics = !!loadingClassTopics[String(cls.id)];

                                  return (
                                    <div 
                                      key={cls.id || index}
                                      className="p-4 bg-white dark:bg-indigo-900 rounded-2xl border-2 border-indigo-100 dark:border-indigo-800"
                                    >
                                      <div className="flex justify-between items-start gap-2">
                                        <div>
                                          <p className="text-[9px] font-black text-purple-500 uppercase">Clase {index + 1}</p>
                                          <h5 className="text-sm font-black text-indigo-900 dark:text-white uppercase leading-snug">
                                            {cls.titulo}
                                          </h5>
                                          {cls.descripcion && (
                                            <p className="text-[11px] text-indigo-600 dark:text-indigo-300 font-medium mt-1">
                                              {cls.descripcion}
                                            </p>
                                          )}
                                        </div>
                                        <span className="text-[9px] font-black text-indigo-400 shrink-0 uppercase bg-indigo-50 dark:bg-indigo-950 px-2.5 py-1 rounded-xl">
                                          ⏱️ {cls.assigned_time_minutes || 30} min
                                        </span>
                                      </div>

                                      <div className="mt-3 pt-2 border-t border-indigo-50 dark:border-indigo-800/50 flex justify-between items-center">
                                        <button
                                          onClick={() => toggleExpandClassTopics(String(cls.id))}
                                          className="text-[10px] font-black uppercase text-indigo-500 hover:text-indigo-700 dark:text-indigo-300"
                                        >
                                          {isClassExpanded ? '▲ Ocultar microtemas' : '▼ Ver microtemas'}
                                        </button>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">
                                          🔒 Solo lectura
                                        </span>
                                      </div>

                                      {isClassExpanded && (
                                        <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-950 rounded-xl space-y-1.5 animate-in fade-in">
                                          {isLoadingTopics ? (
                                            <p className="text-[10px] text-indigo-400 italic">Cargando microtemas...</p>
                                          ) : topics.length === 0 ? (
                                            <p className="text-[10px] text-indigo-400 italic">No hay microtemas detallados para esta clase.</p>
                                          ) : (
                                            <ul className="space-y-1">
                                              {topics.map((t: any, tidx: number) => (
                                                <li key={t.id || tidx} className="text-[10px] font-bold text-indigo-800 dark:text-indigo-200 flex items-start gap-1.5">
                                                  <span className="text-purple-500 font-black">•</span>
                                                  <span>{t.titulo}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: SELECCIÓN DE MATERIA DEMO GRATIS (3 CLASES) */}
      {showDemoModal && (
        <div className="fixed inset-0 bg-indigo-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-indigo-900 w-full max-w-2xl rounded-[3rem] p-8 shadow-2xl border-8 border-indigo-50 dark:border-indigo-800 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="text-center mb-6">
              <span className="text-5xl mb-2 block">🎁</span>
              <h3 className="text-2xl md:text-3xl font-black text-indigo-900 dark:text-white uppercase tracking-tight">
                ¡Bienvenido a Buensoft Education!
              </h3>
              <p className="text-xs md:text-sm font-bold text-indigo-500 dark:text-indigo-300 uppercase tracking-wide mt-2">
                Selecciona una materia para tu demostración gratis de 3 clases por una semana
              </p>
            </div>

            {/* Tarjeta Explicativa de Fechas Alternadas */}
            <div className="bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-200 dark:border-amber-800 p-5 rounded-3xl mb-6">
              <p className="text-[11px] font-black uppercase text-amber-800 dark:text-amber-300 tracking-wider mb-2">
                📅 Calendario de tu Demo (Un día sí y un día no):
              </p>
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-200 mb-3 leading-relaxed">
                Tus 3 clases gratis se programarán durante la semana alternando días hábiles de estudio (saltando fines de semana):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {demoDates.map((dateStr, idx) => (
                  <div key={idx} className="bg-white dark:bg-amber-900/50 p-3 rounded-2xl border border-amber-200 text-center">
                    <p className="text-[9px] font-black text-amber-500 uppercase">Clase {idx + 1}</p>
                    <p className="text-xs font-black text-amber-900 dark:text-white mt-0.5">
                      {formatFriendlyDate(dateStr)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Selector de Cursos Disponibles */}
            <div className="space-y-4 mb-6">
              <label className="block text-xs font-black text-indigo-600 dark:text-indigo-300 uppercase tracking-wider ml-1">
                Selecciona la materia que deseas probar:
              </label>

              {coursesList.length === 0 ? (
                <p className="text-xs text-indigo-400 italic text-center py-4">Cargando materias disponibles...</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1">
                  {coursesList.map(c => {
                    const isSelected = selectedDemoCourseId === String(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => setSelectedDemoCourseId(String(c.id))}
                        className={`p-4 rounded-2xl border-4 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/80 shadow-md scale-[1.02]'
                            : 'border-indigo-50 dark:border-indigo-800 hover:border-indigo-200 bg-white dark:bg-indigo-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-black text-indigo-950 dark:text-white uppercase">
                            {c.nombre}
                          </h4>
                          {isSelected && <span className="text-indigo-600 font-black text-base">✓</span>}
                        </div>
                        {c.descripcion && (
                          <p className="text-[10px] text-indigo-500 dark:text-indigo-300 line-clamp-2 mt-1">
                            {c.descripcion}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Acciones */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDemoModal(false)}
                className="py-3 px-6 rounded-2xl font-black text-xs uppercase text-indigo-400 hover:bg-indigo-50 transition-colors"
                disabled={isAssigningDemo}
              >
                Decidir más tarde
              </button>

              <button
                type="button"
                onClick={handleAssignDemo}
                disabled={!selectedDemoCourseId || isAssigningDemo}
                className={`flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all ${
                  !selectedDemoCourseId || isAssigningDemo
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-indigo-700 hover:scale-[1.02] active:scale-95'
                }`}
              >
                {isAssigningDemo ? 'Asignando 3 clases...' : 'ACTIVAR MI DEMO GRATIS (3 CLASES) 🚀'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showClassroom && pendingLesson && (
        <VirtualClassroom 
          lesson={pendingLesson} 
          user={{ ...user, student_profile: studentProfile, preferred_teacher_profile: teacherProfile }}
          onClose={() => { setShowClassroom(false); setPendingLesson(null); fetchData(); }} 
          onLessonAccredited={(grade) => {
            fetchData();
          }}
        />
      )}

      {auditLesson && (
        <AuditModal 
          lesson={auditLesson} 
          studentId={String(user.id || user.username)} 
          studentUsername={user.username}
          onClose={() => setAuditLesson(null)} 
        />
      )}

      {showProfileSettings && (
        <div className="fixed inset-0 bg-indigo-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-indigo-950 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-black text-indigo-900 dark:text-white uppercase mb-4 text-center">Perfil del Estudiante</h3>
            <p className="text-xs text-indigo-500 text-center mb-6 font-bold">Describe cómo eres y cómo te gustaría que fuera tu maestro para personalizar tus clases con IA.</p>
            
            <div className="relative mb-4">
              <label className="text-[10px] uppercase font-bold text-indigo-400 mb-1 block">Acerca de ti</label>
              <textarea 
                placeholder="Nombre, edad, género, gustos, hobbies..."
                className="w-full bg-indigo-50 dark:bg-indigo-900/30 border-2 border-indigo-100 dark:border-indigo-800 rounded-2xl px-5 py-3 text-sm font-bold text-indigo-900 dark:text-white focus:outline-none focus:border-indigo-400 min-h-[100px] resize-none"
                value={studentProfile}
                onChange={(e) => setStudentProfile(e.target.value)}
              />
            </div>
            
            <div className="relative mb-6">
              <label className="text-[10px] uppercase font-bold text-indigo-400 mb-1 block">Maestro Ideal</label>
              <textarea 
                placeholder="¿Cómo te gustaría que fuera la personalidad de tu maestro de IA?"
                className="w-full bg-orange-50 dark:bg-orange-900/30 border-2 border-orange-100 dark:border-orange-800 rounded-2xl px-5 py-3 text-sm font-bold text-orange-900 dark:text-white focus:outline-none focus:border-orange-400 min-h-[100px] resize-none"
                value={teacherProfile}
                onChange={(e) => setTeacherProfile(e.target.value)}
              />
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setShowProfileSettings(false)}
                className="flex-1 py-3 rounded-2xl font-black text-xs uppercase text-indigo-400 hover:bg-indigo-50 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  try {
                    const { updateUser } = await import('../storage2');
                    await updateUser(user.username, { 
                      username: user.username,
                      email: user.email,
                      student_profile: studentProfile, 
                      preferred_teacher_profile: teacherProfile 
                    } as any);
                    alert('Perfil guardado exitosamente.');
                  } catch (e) {
                    console.error(e);
                    alert('Error al guardar el perfil.');
                  }
                  setShowProfileSettings(false);
                }}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase shadow-md transition-colors"
              >
                Guardar Perfil
              </button>
            </div>
          </div>
        </div>
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
