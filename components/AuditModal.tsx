import React, { useState, useEffect } from 'react';
import { Lesson, IntentoExamen } from '../types';
import { getClassChatHistory, getIntentosExamen, getIntentoDetails, getClassIdFromLesson } from '../storage2';
import ReactMarkdown from 'react-markdown';
import { BookOpen, FileText } from 'lucide-react';
import VirtualClassroom from './VirtualClassroom';
import { Role } from '../types';

interface AuditModalProps {
  lesson: Lesson;
  studentUsername: string;
  studentId: string;
  onClose: () => void;
}

const AuditModal: React.FC<AuditModalProps> = ({ lesson, studentUsername, studentId, onClose }) => {
  const [activeTab, setActiveTab] = useState<'leccion' | 'examen'>('leccion');
  const [lessonHistory, setLessonHistory] = useState<any | null>(null);
  const [intentos, setIntentos] = useState<IntentoExamen[]>([]);
  const [selectedIntento, setSelectedIntento] = useState<string | null>(null);
  const [intentoDetails, setIntentoDetails] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const leccionId = await getClassIdFromLesson(lesson);
        if (!leccionId) {
          setIsLoading(false);
          return;
        }

        const [history, examIntentos] = await Promise.all([
          getClassChatHistory(leccionId, studentUsername),
          getIntentosExamen(studentId, leccionId)
        ]);
        setLessonHistory(history);
        setIntentos(examIntentos);
        if (examIntentos.length > 0) {
          setSelectedIntento(String(examIntentos[0].id));
        }
      } catch (error) {
        console.error("Error fetching audit data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [lesson.id, studentUsername, studentId]);

  useEffect(() => {
    if (selectedIntento) {
      const fetchDetails = async () => {
        const details = await getIntentoDetails(selectedIntento);
        setIntentoDetails(details);
      };
      fetchDetails();
    }
  }, [selectedIntento]);

  const getResultLabel = (score: number, esCorrecta: boolean) => {
    // Si score es 1 o es_correcta es true, es Correcta
    if (score >= 1 || (score === 0 && esCorrecta)) return { label: 'Correcta', color: 'text-green-600 bg-green-50' };
    // Si score es entre 0 y 1, es Parcial
    if (score > 0 && score < 1) return { label: 'Parcial', color: 'text-orange-600 bg-orange-50' };
    // De lo contrario, Incorrecta
    return { label: 'Incorrecta', color: 'text-red-600 bg-red-50' };
  };

  return (
    <div className="fixed inset-0 bg-indigo-900/80 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-indigo-950 w-full max-w-5xl h-[90vh] rounded-[3rem] shadow-2xl flex flex-col border-8 border-white overflow-hidden font-fredoka">
        <header className="bg-indigo-600 p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Auditoría: {lesson.title}</h2>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Estudiante: {studentUsername} • {lesson.subject}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 text-2xl font-black hover:bg-white/20 transition-colors">✕</button>
        </header>

        <div className="flex bg-indigo-50 dark:bg-indigo-900/50 p-2 border-b border-indigo-100 dark:border-indigo-800">
          <button 
            onClick={() => setActiveTab('leccion')}
            className={`flex-1 py-3 rounded-2xl font-black text-xs uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'leccion' ? 'bg-white dark:bg-indigo-800 text-indigo-600 shadow-sm' : 'text-indigo-400'}`}
          >
            <BookOpen className="w-4 h-4" />
            Clase
          </button>
          <button 
            onClick={() => setActiveTab('examen')}
            className={`flex-1 py-3 rounded-2xl font-black text-xs uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'examen' ? 'bg-white dark:bg-indigo-800 text-indigo-600 shadow-sm' : 'text-indigo-400'}`}
          >
            <FileText className="w-4 h-4" />
            Resultados del examen
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-sky-50/30 dark:bg-indigo-950 custom-scrollbar">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-spin w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <>
              {activeTab === 'leccion' && (
                <div className="w-full">
                  <VirtualClassroom 
                    lesson={{ ...lesson, chatHistory: lessonHistory && lessonHistory.chat_history ? (typeof lessonHistory.chat_history === 'string' ? JSON.parse(lessonHistory.chat_history) : lessonHistory.chat_history) : [] }}
                    user={{ id: studentId, username: studentUsername, role: Role.STUDENT }}
                    onClose={() => {}}
                    isAdminAudit={true}
                    isEmbedded={true}
                  />
                </div>
              )}

              {activeTab === 'examen' && (
                <div className="space-y-8">
                  {intentos.length > 0 ? (
                    <>
                      <div className="flex items-center gap-4 bg-white dark:bg-indigo-900 p-4 rounded-2xl border-2 border-indigo-50 dark:border-indigo-800">
                        <label className="text-[10px] font-black text-indigo-400 uppercase">Seleccionar Intento:</label>
                        <select 
                          value={selectedIntento || ''} 
                          onChange={(e) => setSelectedIntento(e.target.value)}
                          className="flex-1 bg-indigo-50 dark:bg-indigo-950 p-2 rounded-xl text-xs font-bold outline-none border-2 border-transparent focus:border-indigo-300"
                        >
                          {intentos.map((int, idx) => (
                            <option key={int.id} value={int.id}>
                              Intento {intentos.length - idx} - {new Date(int.fecha_inicio).toLocaleString()} - Nota: {int.calificacion}%
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="bg-white dark:bg-indigo-900 rounded-[2rem] shadow-sm border-2 border-indigo-50 dark:border-indigo-800 overflow-hidden">
                         <div className="space-y-4">
                          {intentoDetails.map((det, idx) => {
                            const res = getResultLabel(det.score || 0, !!det.es_correcta);
                            return (
                              <div key={det.id} className="bg-indigo-50 dark:bg-indigo-950 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800">
                                <div className="flex items-start gap-2 mb-2">
                                  <span className="bg-indigo-200 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-200 text-[9px] font-black uppercase px-2 py-1 rounded mt-0.5 whitespace-nowrap">
                                    {det.preguntas?.tipo === 'multiple_choice' ? 'Opción Múltiple' : det.preguntas?.tipo === 'true_false' ? 'Falso/Verdadero' : det.preguntas?.tipo === 'open' ? 'Abierta' : 'Desconocido'}
                                  </span>
                                  <h4 className="text-sm font-black text-indigo-900 dark:text-white">{idx + 1}. {det.preguntas?.pregunta || 'Pregunta no disponible'}</h4>
                                </div>
                                <p className="text-xs text-indigo-600 dark:text-indigo-300 italic mb-3">Respuesta: "{det.respuesta}"</p>
                                <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${res.color}`}>
                                  {res.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {selectedIntento && (
                        <div className="flex justify-end">
                          <div className="bg-indigo-600 text-white px-8 py-4 rounded-2xl shadow-xl flex flex-col items-center">
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Calificación Final</span>
                            <span className="text-3xl font-black">{intentos.find(i => String(i.id) === selectedIntento)?.calificacion}%</span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-20 bg-white dark:bg-indigo-900 rounded-[2rem] border-2 border-dashed border-indigo-200">
                      <p className="text-indigo-400 font-bold uppercase tracking-widest">No hay intentos de examen registrados.</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditModal;
