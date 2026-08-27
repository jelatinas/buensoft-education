
import React, { useState, useEffect, useMemo } from 'react';
import { User, Role, StudentData, Lesson, SubjectGuide, Transaction } from '../types';
import { 
  getUsers, 
  saveUser, 
  updateUser, 
  deleteUser, 
  getStudentData, 
  addLessonToStudent, 
  deleteLessonFromStudent, 
  updateLessonInStudent,
  getSubjectsGuide,
  saveSubjectGuide,
  updateSubjectGuide,
  deleteSubjectGuide,
  deleteSubjectFromStudent,
  updateLessonsPromptByCriteria,
  getAccountBalance,
  getAllTransactions,
  executeManualTransfer,
  getCourses,
  getClasses
} from '../storage2';
import { getSchoolDayStatus } from '../utils/schoolCalendar';
import StudentDashboard from './StudentDashboard';
import AuditModal from './AuditModal';
import CourseManager from './CourseManager';

interface AdminDashboardProps {
  user: User;
}


const AdminDashboard: React.FC<AdminDashboardProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'students' | 'subjects' | 'dynamic' | 'removal' | 'promptUpdate' | 'banca'>('students');
  const [students, setStudents] = useState<User[]>([]);
  const [subjectsGuide, setSubjectsGuide] = useState<SubjectGuide[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [selectedUserObj, setSelectedUserObj] = useState<User | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);

  const getLocalDateStr = (d: Date = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalDateStr());
  const [isLoading, setIsLoading] = useState(false);

  const [adminBalance, setAdminBalance] = useState(0);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [manualAmount, setManualAmount] = useState<string>('');
  const [manualStudentId, setManualStudentId] = useState<string>('');
  const [manualConcept, setManualConcept] = useState<string>('');
  const [manualType, setManualType] = useState<'ingreso' | 'egreso'>('ingreso');
  const [isProcessingManual, setIsProcessingManual] = useState(false);

  const ADMIN_BALANCE_UUID = '6a6db323-6229-42e3-a8b8-3ccfa177dfd7';

  const [creditValue, setCreditValue] = useState<number>(2);
  const [isSavingSetting, setIsSavingSetting] = useState(false);

  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userName, setUserName] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userEmail, setUserEmail] = useState('');

  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<SubjectGuide | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const [subjectLessons, setSubjectLessons] = useState('');
  const [subjectPrompt, setSubjectPrompt] = useState('');

  const [showLessonModal, setShowLessonModal] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [lessonSubject, setLessonSubject] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonPrompt, setLessonPrompt] = useState('');
  const [lessonQuestions, setLessonQuestions] = useState('');
  const [lessonDuration, setLessonDuration] = useState(30);
  const [lessonDate, setLessonDate] = useState(selectedDate);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);

  const [viewingFullLesson, setViewingFullLesson] = useState<Lesson | null>(null);

  const [dynStudent, setDynStudent] = useState('');
  const [dynSubject, setDynSubject] = useState('');
  const [dynLessonsText, setDynLessonsText] = useState('');
  const [dynDays, setDynDays] = useState<boolean[]>([true, true, true, true, true, false, false]);
  const [dynDuration, setDynDuration] = useState(30);
  const [dynStartDate, setDynStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [dynAiPrompt, setDynAiPrompt] = useState('');
  
  const [courses, setCourses] = useState<any[]>([]);
  const [dynCourseId, setDynCourseId] = useState<string>('');
  const [dynExcludeHolidays, setDynExcludeHolidays] = useState<boolean>(true);

  const [remStudent, setRemStudent] = useState('');
  const [remSubject, setRemSubject] = useState('');
  const [remDays, setRemDays] = useState<boolean[]>([true, true, true, true, true, false, false]);
  const [remStartDate, setRemStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [remStudentSubjects, setRemStudentSubjects] = useState<string[]>([]);

  const [updStudent, setUpdStudent] = useState('');
  const [updSubject, setUpdSubject] = useState('');
  const [updDays, setUpdDays] = useState<boolean[]>([true, true, true, true, true, false, false]);
  const [updStartDate, setUpdStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [updPrompt, setUpdPrompt] = useState('');
  const [updStudentSubjects, setUpdStudentSubjects] = useState<string[]>([]);

  const dayNamesShort = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  // Mapeo de IDs a Nombres para el historial
  const userMap = useMemo(() => {
    const map: Record<string, string> = { 
      [ADMIN_BALANCE_UUID]: 'BANCO CENTRAL',
      'ADMIN': 'BANCO CENTRAL'
    };
    students.forEach(s => {
      if (s.id) map[s.id] = s.username.toUpperCase();
      map[s.username] = s.username.toUpperCase();
    });
    return map;
  }, [students, ADMIN_BALANCE_UUID]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [allUsers, allSubjects, balance, transactionsList, allCourses] = await Promise.all([
        getUsers(),
        getSubjectsGuide(),
        getAccountBalance(ADMIN_BALANCE_UUID),
        getAllTransactions(),
        getCourses()
      ]);
      setStudents(allUsers.filter(u => u.role === Role.STUDENT));
      setSubjectsGuide(allSubjects);
      setAdminBalance(balance);
      setAllTransactions(transactionsList);
      setCourses(allCourses);
      
      // Load Settings
      const { getSettings } = await import('../storage2');
      const settings = await getSettings();
      if (settings.credit_value_mxn) {
        setCreditValue(parseFloat(settings.credit_value_mxn));
      }
    } catch (err) {
      console.error("Error fetching initial data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (remStudent) {
      getStudentData(remStudent).then(data => {
        if (data) {
          const uniqueSubjects = Array.from(new Set(data.student_lessons.map(l => l.subject)));
          setRemStudentSubjects(uniqueSubjects);
        }
      });
    } else { setRemStudentSubjects([]); }
  }, [remStudent]);

  useEffect(() => {
    if (updStudent) {
      getStudentData(updStudent).then(data => {
        if (data) {
          const uniqueSubjects = Array.from(new Set(data.student_lessons.map(l => l.subject)));
          setUpdStudentSubjects(uniqueSubjects);
        }
      });
    } else { setUpdStudentSubjects([]); }
  }, [updStudent]);

  useEffect(() => {
    if (selectedStudent) {
      const u = students.find(s => s.username === selectedStudent);
      if (u) setSelectedUserObj(u);
      refreshStudentLessons();
    } else {
      setStudentData(null);
      setSelectedUserObj(null);
    }
  }, [selectedStudent, students]);

  const refreshStudentLessons = async () => {
    if (selectedStudent) {
      setIsLoading(true);
      try {
        const data = await getStudentData(selectedStudent);
        setStudentData(data);
      } catch (err) {
        console.error("Error al cargar lecciones:", err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName || !userPassword) return;
    setIsLoading(true);
    try {
      const userData: User = { username: userName, password: userPassword, email: userEmail, role: Role.STUDENT };
      if (editingUser) await updateUser(editingUser.username, userData);
      else await saveUser(userData);
      await fetchData();
      setShowUserModal(false);
    } catch (err) { alert("Error al guardar estudiante."); } finally { setIsLoading(false); }
  };

  const handleDeleteStudent = async (username: string) => {
    if (!confirm(`¿Eliminar a ${username}?`)) return;
    setIsLoading(true);
    try {
      await deleteUser(username);
      if (selectedStudent === username) setSelectedStudent('');
      await fetchData();
    } catch (err) { alert("Error al eliminar."); } finally { setIsLoading(false); }
  };

  const handleSaveSubjectGuide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectName || !subjectLessons) return;
    setIsLoading(true);
    try {
      if (editingSubject) await updateSubjectGuide(editingSubject.id, subjectName, subjectLessons, subjectPrompt);
      else await saveSubjectGuide(subjectName, subjectLessons, subjectPrompt);
      await fetchData();
      setShowSubjectModal(false);
    } catch (err) { alert("Error al guardar materia."); } finally { setIsLoading(false); }
  };

  const handleDeleteSubjectFromGuide = async (id: string) => {
    if (!confirm("¿Eliminar materia de la guía?")) return;
    setIsLoading(true);
    try {
      await deleteSubjectGuide(id);
      await fetchData();
    } catch (err) { alert("Error al eliminar."); } finally { setIsLoading(false); }
  };

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !lessonSubject || !lessonTitle) return;

    let parsedQuestions = null;
    if (lessonQuestions.trim()) {
      try {
        parsedQuestions = JSON.parse(lessonQuestions);
      } catch (err) {
        alert("¡Error de formato! El campo 'Questions' debe ser un JSON válido. Revisa paréntesis y comas.");
        return;
      }
    }

    setIsLoading(true);
    try {
      const lessonData: Lesson = {
        id: editingLessonId || 'temp-' + Date.now(),
        subject: lessonSubject,
        title: lessonTitle,
        learningPrompt: lessonPrompt,
        durationMinutes: lessonDuration,
        date: lessonDate,
        completed: editingLessonId ? (studentData?.student_lessons.find(l => l.id === editingLessonId)?.completed || false) : false,
        questions: parsedQuestions
      };
      if (editingLessonId && !editingLessonId.startsWith('temp-')) {
        const original = studentData?.student_lessons.find(l => l.id === editingLessonId);
        await updateLessonInStudent(selectedStudent, { ...original, ...lessonData });
      } else {
        await addLessonToStudent(selectedStudent, lessonData);
      }
      await refreshStudentLessons();
      setShowLessonModal(false);
    } catch (err) { alert("Error al guardar lección."); } finally { setIsLoading(false); }
  };

  const handleDynSubjectChange = (name: string) => {
    setDynSubject(name);
    const selected = subjectsGuide.find(s => s.name === name);
    if (selected) {
      setDynLessonsText(selected.lessons_list);
      setDynAiPrompt(selected.learning_prompt || '');
    }
  };

  const handleDynamicAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dynStudent || !dynCourseId) return;
    
    setIsLoading(true);
    try {
      const courseClasses = await getClasses(dynCourseId);
      if (!courseClasses || courseClasses.length === 0) {
        alert('Este curso no tiene clases creadas.');
        setIsLoading(false);
        return;
      }
      
      const courseObj = courses.find(c => String(c.id) === String(dynCourseId));
      const courseName = courseObj ? courseObj.nombre : 'Curso Asignado';

      let currentDate = new Date(dynStartDate + 'T12:00:00');
      let assignedCount = 0;
      
      while (assignedCount < courseClasses.length) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayOfWeek = (currentDate.getDay() + 6) % 7;
        
        const dayStatus = getSchoolDayStatus(dateStr);
        const isDaySelected = dynDays[dayOfWeek];
        const isValidDay = isDaySelected && (!dynExcludeHolidays || dayStatus.isSchoolDay);

        if (isValidDay) {
          const currentClass = courseClasses[assignedCount];
          await addLessonToStudent(dynStudent, {
            id: 'temp-' + Date.now() + '-' + assignedCount,
            subject: courseName,
            title: currentClass.titulo,
            learningPrompt: dynAiPrompt || '',
            durationMinutes: dynDuration || currentClass.assigned_time_minutes || 30,
            date: dateStr,
            completed: false
          });
          assignedCount++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
        if (currentDate.getFullYear() > 2028) break;
      }
      alert(`¡Se asignaron ${assignedCount} lecciones con éxito!`);
      if (selectedStudent === dynStudent) refreshStudentLessons();
    } catch (err) { alert("Error en asignación masiva."); } finally { setIsLoading(false); }
  };

  const handleDynamicRemoval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remStudent || !remSubject) return;
    if (!confirm(`¿Estás seguro de eliminar "${remSubject}" a partir del ${remStartDate} para ${remStudent}?`)) return;
    setIsLoading(true);
    try {
      await deleteSubjectFromStudent(remStudent, remSubject, remStartDate);
      alert("Lecciones eliminadas correctamente.");
      if (selectedStudent === remStudent) refreshStudentLessons();
    } catch (err) { alert("Error al eliminar."); } finally { setIsLoading(false); }
  };

  const handlePromptUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updStudent || !updSubject || !updPrompt) return;
    setIsLoading(true);
    try {
      await updateLessonsPromptByCriteria(updStudent, updSubject, updPrompt);
      alert("Prompts actualizados correctamente.");
      if (selectedStudent === updStudent) refreshStudentLessons();
    } catch (err) { alert("Error al actualizar."); } finally { setIsLoading(false); }
  };

  const handleManualTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(manualAmount);
    if (!manualStudentId || isNaN(amount) || amount <= 0 || !manualConcept) {
      alert("Por favor completa todos los campos correctamente.");
      return;
    }
    const confirmMsg = manualType === 'ingreso' ? `¿Confirmas el ingreso de $${amount}?` : `¿Confirmas el egreso de $${amount}?`;
    if (!confirm(confirmMsg)) return;
    setIsProcessingManual(true);
    try {
      const isIncome = manualType === 'ingreso';
      await executeManualTransfer(manualStudentId, amount, manualConcept, isIncome);
      alert("Transacción realizada con éxito.");
      setManualAmount(''); setManualConcept('');
      fetchData();
    } catch (err: any) { alert(`Error: ${err.message}`); } finally { setIsProcessingManual(false); }
  };

  const openLessonEditor = (lesson: Lesson) => {
    setEditingLessonId(String(lesson.id));
    setLessonSubject(lesson.subject);
    setLessonTitle(lesson.title);
    setLessonPrompt(lesson.learningPrompt || '');
    setLessonQuestions(lesson.questions ? JSON.stringify(lesson.questions, null, 2) : '');
    setLessonDuration(lesson.durationMinutes);
    setLessonDate(lesson.date);
    setShowLessonModal(true);
  };

  return (
    <div className="space-y-8 pb-20 font-fredoka">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b-4 border-indigo-50 dark:border-indigo-800">
        <div className="flex flex-wrap gap-2">
            {[
              { id: 'students', label: '👨‍🎓 Estudiantes', color: 'indigo' },
              { id: 'courses', label: '📖 Cursos (Nuevo)', color: 'emerald' },
              { id: 'dynamic', label: '⚡ Asignación', color: 'indigo' },
            { id: 'promptUpdate', label: '🪄 Act. Prompt', color: 'amber' },
            { id: 'removal', label: '🧹 Desasignación', color: 'red' },
            { id: 'banca', label: 'Banca Central 🏦', color: 'amber' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 md:px-8 py-3 md:py-4 font-black text-xs md:text-sm uppercase transition-all rounded-t-3xl ${
                activeTab === tab.id 
                ? `bg-${tab.color === 'red' ? 'red-600' : tab.color === 'amber' ? 'amber-500' : 'indigo-600'} text-white shadow-lg` 
                : `bg-white dark:bg-indigo-900/50 text-${tab.color === 'red' ? 'red-400' : tab.color === 'amber' ? 'amber-500' : 'indigo-400'} hover:text-${tab.color === 'red' ? 'red-600' : tab.color === 'amber' ? 'amber-600' : 'indigo-600'}`
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'students' && (
        <section className="space-y-8 animate-in fade-in duration-500">
          <div className="bg-white dark:bg-indigo-900 p-6 rounded-[2.5rem] shadow-sm border-4 border-indigo-50 dark:border-indigo-800">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-indigo-900 dark:text-white uppercase">Lista de Estudiantes</h2>
              <button 
                onClick={() => { setEditingUser(null); setUserName(''); setUserPassword(''); setUserEmail(''); setShowUserModal(true); }}
                className="bg-indigo-600 text-white px-6 py-3 rounded-full font-black text-xs shadow-lg hover:bg-indigo-700 transition-all"
              >
                + NUEVO ESTUDIANTE
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {students.map(s => (
                <div key={s.username} className={`p-4 rounded-2xl border-4 transition-all flex items-center justify-between ${selectedStudent === s.username ? 'bg-indigo-50 dark:bg-indigo-800 border-indigo-200 dark:border-indigo-700' : 'bg-white dark:bg-indigo-950 border-indigo-50 hover:border-indigo-100'}`}>
                  <button onClick={() => setSelectedStudent(s.username)} className="flex-1 text-left">
                    <p className={`font-black uppercase text-lg ${selectedStudent === s.username ? 'text-indigo-900 dark:text-white' : 'text-indigo-400'}`}>{s.username}</p>
                  </button>
                  <div className="flex space-x-1">
                    <button onClick={() => { setEditingUser(s); setUserName(s.username); setUserPassword(s.password || ''); setUserEmail(s.email || ''); setShowUserModal(true); }} className="p-2 hover:bg-indigo-100 rounded-lg">✏️</button>
                    <button onClick={() => handleDeleteStudent(s.username)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selectedStudent && selectedUserObj && (
            <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] shadow-sm border-4 border-indigo-50 dark:border-indigo-800 animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center mb-6 border-b-4 border-indigo-50 dark:border-indigo-800 pb-4">
                <div>
                  <h2 className="text-3xl font-black text-indigo-900 dark:text-white uppercase tracking-tight leading-tight">MODO ESPEJO: {selectedStudent}</h2>
                  <p className="text-xs font-bold text-indigo-400 dark:text-indigo-500">Visualizando réplica exacta de la interfaz del estudiante (Modo Gestión)</p>
                </div>
                <div className="flex space-x-3">
                  <button 
                    onClick={() => { setEditingLessonId(null); setLessonSubject(''); setLessonTitle(''); setLessonPrompt(''); setLessonQuestions(''); setLessonDate(selectedDate); setShowLessonModal(true); }}
                    className="bg-amber-400 text-indigo-900 px-6 py-3 rounded-full font-black text-xs shadow-lg hover:bg-amber-500 transition-all"
                  >
                    + ASIGNAR LECCIÓN
                  </button>
                  <button onClick={() => setSelectedStudent('')} className="bg-slate-100 dark:bg-indigo-800 text-indigo-400 px-6 py-3 rounded-full font-black text-xs uppercase">Cerrar Espejo</button>
                </div>
              </div>
              <StudentDashboard 
                user={selectedUserObj} 
                isAdminView={true}
                onAuditLesson={(lesson) => setViewingFullLesson(lesson)}
                onBalanceUpdate={fetchData}
                onEditLessonDetails={openLessonEditor}
              />
            </div>
          )}
        </section>
      )}

      {activeTab === 'courses' && (
        <section className="animate-in fade-in duration-500">
          <CourseManager />
        </section>
      )}

      {activeTab === 'dynamic' && (
        <section className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] shadow-sm border-4 border-indigo-50 dark:border-indigo-800 animate-in fade-in duration-500">
          <h2 className="text-2xl font-black text-indigo-900 dark:text-white uppercase mb-6">Asignación Masiva Inteligente ⚡</h2>
          <form onSubmit={handleDynamicAssignment} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Estudiante</label>
                <select value={dynStudent} onChange={e => setDynStudent(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none" required>
                  <option value="">Seleccionar Estudiante...</option>
                  {students.map(s => <option key={s.username} value={s.username}>{s.username.toUpperCase()}</option>)}
                </select>
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Curso a Asignar</label>
                <select value={dynCourseId} onChange={e => setDynCourseId(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none" required>
                  <option value="">Seleccionar Curso...</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.nombre.toUpperCase()}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Duración (min)</label>
                <input type="number" value={dynDuration} onChange={e => setDynDuration(parseInt(e.target.value))} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold" required />
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Fecha de Inicio</label>
                <input type="date" value={dynStartDate} onChange={e => setDynStartDate(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold" required />
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Días de Clase</label>
                <div className="flex justify-between bg-indigo-50 dark:bg-indigo-950 p-3 rounded-2xl">
                  {dayNamesShort.map((day, idx) => (
                    <button key={idx} type="button" onClick={() => {
                      const newDays = [...dynDays];
                      newDays[idx] = !newDays[idx];
                      setDynDays(newDays);
                    }} className={`w-8 h-8 rounded-full text-[10px] font-black transition-all ${dynDays[idx] ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-indigo-800 text-indigo-300'}`}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col space-y-2 bg-indigo-50/50 dark:bg-indigo-950/30 p-4 rounded-2xl">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={dynExcludeHolidays}
                  onChange={(e) => setDynExcludeHolidays(e.target.checked)}
                  className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-indigo-300"
                />
                <span className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                  Excluir días festivos y vacaciones (SEP 2026-2027)
                </span>
              </label>
              <p className="text-xs text-indigo-400 pl-8">El sistema se saltará automáticamente estos días al programar las clases del curso.</p>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Prompt de IA (Opcional)</label>
              <textarea rows={2} value={dynAiPrompt} onChange={e => setDynAiPrompt(e.target.value)} placeholder="Instrucciones específicas para el AI en este curso..." className="w-full p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl font-bold border-2 border-amber-100 italic outline-none" />
            </div>

            <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 text-white font-black py-5 rounded-[2rem] shadow-xl uppercase tracking-widest disabled:opacity-50">
              {isLoading ? 'Asignando...' : 'Iniciar Asignación Masiva 🚀'}
            </button>
          </form>
        </section>
      )}

      {activeTab === 'promptUpdate' && (
        <section className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] shadow-sm border-4 border-amber-100 animate-in fade-in duration-500">
          <h2 className="text-2xl font-black text-amber-600 dark:text-amber-500 uppercase mb-6">Actualizar Prompts Masivamente 🪄</h2>
          <form onSubmit={handlePromptUpdate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Estudiante</label>
                <select value={updStudent} onChange={e => setUpdStudent(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none" required>
                  <option value="">Seleccionar Estudiante...</option>
                  {students.map(s => <option key={s.username} value={s.username}>{s.username.toUpperCase()}</option>)}
                </select>
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Materia</label>
                <select value={updSubject} onChange={e => setUpdSubject(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none" required>
                  <option value="">Seleccionar Materia...</option>
                  {updStudentSubjects.map(sub => <option key={sub} value={sub}>{sub.toUpperCase()}</option>)}
                </select>
              </div>
            </div>

            </div>

            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Nuevo Prompt de IA</label>
              <textarea rows={4} value={updPrompt} onChange={e => setUpdPrompt(e.target.value)} placeholder="Escribe el nuevo prompt..." className="w-full p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl font-bold border-2 border-amber-100 italic outline-none" required />
            </div>

            <button type="submit" disabled={isLoading} className="w-full bg-amber-500 text-white font-black py-5 rounded-[2rem] shadow-xl uppercase tracking-widest disabled:opacity-50">
              {isLoading ? 'Actualizando...' : 'Actualizar Prompts ✨'}
            </button>
          </form>
        </section>
      )}

      {activeTab === 'removal' && (
        <section className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] shadow-sm border-4 border-red-100 animate-in fade-in duration-500">
          <h2 className="text-2xl font-black text-red-600 uppercase mb-6">Desasignación Masiva 🧹</h2>
          <form onSubmit={handleDynamicRemoval} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Estudiante</label>
                <select value={remStudent} onChange={e => setRemStudent(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none" required>
                  <option value="">Seleccionar Estudiante...</option>
                  {students.map(s => <option key={s.username} value={s.username}>{s.username.toUpperCase()}</option>)}
                </select>
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Materia a Eliminar</label>
                <select value={remSubject} onChange={e => setRemSubject(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none" required>
                  <option value="">Seleccionar Materia...</option>
                  {remStudentSubjects.map(sub => <option key={sub} value={sub}>{sub.toUpperCase()}</option>)}
                </select>
              </div>
            </div>
            
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Eliminar a partir de:</label>
              <input type="date" value={remStartDate} onChange={e => setRemStartDate(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold" required />
            </div>

            <button type="submit" disabled={isLoading} className="w-full bg-red-600 text-white font-black py-5 rounded-[2rem] shadow-xl uppercase tracking-widest disabled:opacity-50 mt-6">
              {isLoading ? 'Eliminando...' : 'Eliminar Lecciones Seleccionadas 🗑️'}
            </button>
          </form>
        </section>
      )}

      {activeTab === 'banca' && (
        <section className="space-y-8 animate-in fade-in duration-500">
          <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] border-4 border-amber-100 flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center text-4xl">🏦</div>
              <div>
                <p className="text-xs font-black text-amber-600 uppercase mb-1">Fondo de Reserva Central</p>
                <p className="text-4xl font-black text-amber-500">MXN ${adminBalance.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
               <div className="flex flex-col items-end">
                 <label className="text-[10px] font-black text-amber-600 uppercase mb-1">Valor por Crédito (MXN)</label>
                 <div className="flex space-x-2">
                    <input 
                      type="number" 
                      step="0.1"
                      value={creditValue}
                      onChange={(e) => setCreditValue(parseFloat(e.target.value))}
                      className="w-24 p-2 rounded-xl border-2 border-amber-200 text-amber-700 font-bold"
                    />
                    <button 
                      onClick={async () => {
                        setIsSavingSetting(true);
                        const { updateSetting } = await import('../storage2');
                        await updateSetting('credit_value_mxn', creditValue.toString());
                        setIsSavingSetting(false);
                        alert("Valor del crédito actualizado");
                      }}
                      disabled={isSavingSetting}
                      className="bg-amber-500 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase"
                    >
                      Guardar
                    </button>
                 </div>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] border-4 border-indigo-50 shadow-sm h-fit">
              <h3 className="text-xl font-black text-indigo-900 dark:text-white uppercase mb-6">Movimiento Manual 💸</h3>
              <form onSubmit={handleManualTransfer} className="space-y-4">
                <div className="flex flex-col space-y-1">
                  <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Destinatario</label>
                  <select value={manualStudentId} onChange={e => setManualStudentId(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold outline-none" required>
                    <option value="">Seleccionar Estudiante...</option>
                    {students.map(s => <option key={s.id || s.username} value={s.id || s.username}>{s.username.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Monto (MXN)</label>
                  <input type="number" step="0.01" value={manualAmount} onChange={e => setManualAmount(e.target.value)} placeholder="0.00" className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold" required />
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Tipo de Operación</label>
                  <div className="flex bg-indigo-50 dark:bg-indigo-950 p-2 rounded-2xl">
                    <button type="button" onClick={() => setManualType('ingreso')} className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${manualType === 'ingreso' ? 'bg-green-500 text-white shadow-md' : 'text-indigo-400'}`}>Ingreso</button>
                    <button type="button" onClick={() => setManualType('egreso')} className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${manualType === 'egreso' ? 'bg-red-500 text-white shadow-md' : 'text-indigo-400'}`}>Egreso</button>
                  </div>
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Concepto</label>
                  <input type="text" value={manualConcept} onChange={e => setManualConcept(e.target.value)} placeholder="Ej: Premio, Multa..." className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold" required />
                </div>
                <button type="submit" disabled={isProcessingManual} className="w-full bg-indigo-600 text-white font-black py-5 rounded-[2rem] shadow-xl uppercase tracking-widest disabled:opacity-50">
                  {isProcessingManual ? 'Procesando...' : 'Confirmar Operación ✅'}
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 bg-white dark:bg-indigo-900 p-8 rounded-[3rem] border-4 border-indigo-50 shadow-sm overflow-hidden">
              <h3 className="text-xl font-black text-indigo-900 dark:text-white uppercase mb-6">Historial Global de Transacciones 📑</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b-4 border-indigo-50 dark:border-indigo-800">
                    <tr className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                      <th className="pb-4 pr-4">Fecha</th>
                      <th className="pb-4 pr-4">De</th>
                      <th className="pb-4 pr-4">Para</th>
                      <th className="pb-4 pr-4">Monto</th>
                      <th className="pb-4">Concepto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-50 dark:divide-indigo-800">
                    {allTransactions.map(tx => (
                      <tr key={tx.id} className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200">
                        <td className="py-4 pr-4">{new Date(tx.created_at).toLocaleDateString()}</td>
                        <td className="py-4 pr-4 truncate max-w-[80px]">{userMap[tx.from_account] || tx.from_account}</td>
                        <td className="py-4 pr-4 truncate max-w-[80px]">{userMap[tx.to_account] || tx.to_account}</td>
                        <td className={`py-4 pr-4 font-black ${tx.from_account === ADMIN_BALANCE_UUID ? 'text-red-500' : 'text-green-500'}`}>
                          ${tx.amount.toFixed(2)}
                        </td>
                        <td className="py-4 truncate max-w-[150px]">{tx.concept}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* MODALS */}
      {showLessonModal && (
        <div className="fixed inset-0 bg-indigo-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] w-full max-w-xl shadow-2xl border-8 border-indigo-50 overflow-y-auto max-h-[95vh] custom-scrollbar">
            <h2 className="text-3xl font-black text-indigo-900 dark:text-white mb-6 uppercase tracking-tight">{editingLessonId ? 'Editar Lección' : 'Asignar Lección'}</h2>
            <form onSubmit={handleSaveLesson} className="space-y-4">
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Materia</label>
                <div className="flex space-x-2">
                  <input type="text" value={lessonSubject} onChange={e=>setLessonSubject(e.target.value)} placeholder="Materia" className="flex-1 p-4 bg-indigo-50 rounded-2xl font-bold outline-none" required />
                  <button type="button" onClick={() => setShowSubjectPicker(true)} className="bg-indigo-600 text-white w-14 rounded-2xl font-black">⋯</button>
                </div>
              </div>
              
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Lección</label>
                <textarea rows={3} value={lessonTitle} onChange={e=>setLessonTitle(e.target.value)} placeholder="Descripción de la lección" className="w-full p-4 bg-indigo-50 rounded-2xl font-bold outline-none resize-y min-h-[80px]" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col space-y-1">
                  <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Minutos</label>
                  <input type="number" value={lessonDuration} onChange={e=>setLessonDuration(parseInt(e.target.value))} placeholder="Minutos" className="w-full p-4 bg-indigo-50 rounded-2xl font-bold" required />
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Fecha</label>
                  <input type="date" value={lessonDate} onChange={e=>setLessonDate(e.target.value)} className="w-full p-4 bg-indigo-50 rounded-2xl font-bold" required />
                </div>
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Prompt</label>
                <textarea rows={3} value={lessonPrompt} onChange={e=>setLessonPrompt(e.target.value)} placeholder="Guía IA..." className="w-full p-4 bg-indigo-50 rounded-2xl font-bold outline-none resize-y min-h-[80px]" />
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Questions (JSON)</label>
                <textarea rows={3} value={lessonQuestions} onChange={e=>setLessonQuestions(e.target.value)} placeholder='[{"type": "multiple_choice", "question": "...", "correct_answer": "..."}]' className="w-full p-4 bg-indigo-50 rounded-2xl font-mono text-xs outline-none border-2 border-dashed border-indigo-200 resize-y min-h-[80px]" />
              </div>

              <div className="flex space-x-3 pt-4 pb-2">
                <button type="button" onClick={()=>setShowLessonModal(false)} className="flex-1 font-black text-indigo-400 text-xs uppercase tracking-widest">CANCELAR</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-lg uppercase text-xs tracking-widest">CONFIRMAR</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSubjectPicker && (
        <div className="fixed inset-0 bg-indigo-900/80 backdrop-blur-md z-[300] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] w-full max-w-lg shadow-2xl border-8 border-white">
            <h2 className="text-2xl font-black text-indigo-900 dark:text-white mb-6 uppercase text-center">Elegir de Guía</h2>
            <div className="grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto pr-2">
              {subjectsGuide.map(s => (
                <button key={s.id} onClick={() => { setLessonSubject(s.name); setLessonPrompt(s.learning_prompt || ''); setShowSubjectPicker(false); }} className="p-4 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-600 hover:text-white rounded-2xl text-left font-black transition-all">
                  {s.name}
                </button>
              ))}
            </div>
            <button onClick={()=>setShowSubjectPicker(false)} className="w-full mt-6 font-black text-indigo-400 uppercase text-xs tracking-widest">CERRAR</button>
          </div>
        </div>
      )}

      {/* AUDIT MODAL */}
      {viewingFullLesson && (
        <AuditModal 
          lesson={viewingFullLesson}
          studentUsername={selectedStudent}
          studentId={students.find(u => u.username === selectedStudent)?.id || ''}
          onClose={() => setViewingFullLesson(null)}
        />
      )}

      {/* MODAL PARA MATERIA GUÍA */}
      {showSubjectModal && (
        <div className="fixed inset-0 bg-indigo-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] w-full max-w-xl shadow-2xl border-8 border-indigo-50 overflow-y-auto max-h-[95vh] custom-scrollbar">
            <h2 className="text-3xl font-black text-indigo-900 dark:text-white mb-6 uppercase tracking-tight">{editingSubject ? 'Editar Materia' : 'Nueva Materia'}</h2>
            <form onSubmit={handleSaveSubjectGuide} className="space-y-4">
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Nombre de la Materia</label>
                <input type="text" value={subjectName} onChange={e=>setSubjectName(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold" required />
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Lista de Lecciones</label>
                <textarea rows={8} value={subjectLessons} onChange={e=>setSubjectLessons(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold resize-none" required />
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Prompt de IA Sugerido</label>
                <textarea rows={4} value={subjectPrompt} onChange={e=>setSubjectPrompt(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold" />
              </div>
              <div className="flex space-x-3 pt-4">
                <button type="button" onClick={()=>setShowSubjectModal(false)} className="flex-1 font-black text-indigo-400 text-xs uppercase tracking-widest">CANCELAR</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-lg uppercase text-xs tracking-widest">GUARDAR</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PARA ESTUDIANTE */}
      {showUserModal && (
        <div className="fixed inset-0 bg-indigo-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] w-full max-w-md shadow-2xl border-8 border-indigo-50">
            <h2 className="text-3xl font-black text-indigo-900 dark:text-white mb-6 uppercase tracking-tight">{editingUser ? 'Editar Estudiante' : 'Nuevo Estudiante'}</h2>
            <form onSubmit={handleSaveUser} className="space-y-4">
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Nombre de Usuario</label>
                <input type="text" value={userName} onChange={e=>setUserName(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold" required />
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Contraseña</label>
                <input type="text" value={userPassword} onChange={e=>setUserPassword(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold" required />
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-2">Email (Opcional)</label>
                <input type="email" value={userEmail} onChange={e=>setUserEmail(e.target.value)} className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold" />
              </div>
              <div className="flex space-x-3 pt-4">
                <button type="button" onClick={()=>setShowUserModal(false)} className="flex-1 font-black text-indigo-400 text-xs uppercase tracking-widest">CANCELAR</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-lg uppercase text-xs tracking-widest">CONFIRMAR</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
