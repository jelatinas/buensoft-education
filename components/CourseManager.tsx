import React, { useState, useEffect } from 'react';
import { Course, Class, Topic } from '../types';
import { 
  getCourses, createCourse, updateCourse, deleteCourse,
  getClasses, createClass, updateClass, deleteClass,
  getTopics, createTopic, updateTopic, deleteTopic
} from '../storage2';
import { ChevronRight, ChevronDown, Edit, Trash2, Plus } from 'lucide-react';

const CourseManager: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [expandedCourse, setExpandedCourse] = useState<string | number | null>(null);
  const [classesByCourse, setClassesByCourse] = useState<Record<string, Class[]>>({});
  const [expandedClass, setExpandedClass] = useState<string | number | null>(null);
  const [topicsByClass, setTopicsByClass] = useState<Record<string, Topic[]>>({});

  const [showBulkAdd, setShowBulkAdd] = useState<string | number | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  const loadCourses = async () => {
    try {
      const data = await getCourses();
      setCourses(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const handleToggleCourse = async (courseId: string | number) => {
    if (expandedCourse === courseId) {
      setExpandedCourse(null);
    } else {
      setExpandedCourse(courseId);
      try {
        const data = await getClasses(courseId);
        setClassesByCourse(prev => ({ ...prev, [courseId]: data }));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleToggleClass = async (classId: string | number) => {
    if (expandedClass === classId) {
      setExpandedClass(null);
    } else {
      setExpandedClass(classId);
      try {
        const data = await getTopics(classId);
        setTopicsByClass(prev => ({ ...prev, [classId]: data }));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleCreateCourse = async () => {
    const name = prompt('Nombre del nuevo curso:');
    if (name) {
      await createCourse(name);
      loadCourses();
    }
  };

  const handleEditCourse = async (id: string | number, currentName: string) => {
    const newName = prompt('Editar nombre del curso:', currentName);
    if (newName && newName !== currentName) {
      await updateCourse(id, newName);
      loadCourses();
    }
  };

  const handleDeleteCourse = async (id: string | number) => {
    if (confirm('¿Eliminar curso y todo su contenido?')) {
      await deleteCourse(id);
      loadCourses();
    }
  };

  const handleCreateClass = async (courseId: string | number) => {
    const title = prompt('Título de la clase:');
    if (!title) return;
    const desc = prompt('Descripción (opcional):') || '';
    const time = prompt('Tiempo asignado en minutos (default 30):', '30');
    if (title) {
      await createClass(title, desc, courseId, parseInt(time || '30'));
      const data = await getClasses(courseId);
      setClassesByCourse(prev => ({ ...prev, [courseId]: data }));
    }
  };

  const handleDeleteClass = async (courseId: string | number, classId: string | number) => {
    if (confirm('¿Eliminar clase?')) {
      await deleteClass(classId);
      const data = await getClasses(courseId);
      setClassesByCourse(prev => ({ ...prev, [courseId]: data }));
    }
  };

  const handleCreateTopic = async (classId: string | number) => {
    const title = prompt('Título del tema:');
    if (!title) return;
    const content = prompt('Contenido de estudio (puedes editarlo después en la BD directamente por ahora):') || '';
    if (title) {
      await createTopic(title, content, classId, 0);
      const data = await getTopics(classId);
      setTopicsByClass(prev => ({ ...prev, [classId]: data }));
    }
  };

  const handleDeleteTopic = async (classId: string | number, topicId: string | number) => {
    if (confirm('¿Eliminar tema?')) {
      await deleteTopic(topicId);
      const data = await getTopics(classId);
      setTopicsByClass(prev => ({ ...prev, [classId]: data }));
    }
  };

  const handleProcessBulk = async (courseId: string | number) => {
    if (!bulkText.trim()) return;
    setIsProcessingBulk(true);
    try {
      const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      let currentClassId: string | number | null = null;
      let topicIndex = 0;

      for (const line of lines) {
        const classMatch = line.match(/^Clase\s*\d*[:\-]?\s*(.+)/i) || line.match(/^Clase[:\-]?\s*(.+)/i);
        const topicMatch = line.match(/^Tema\s*\d*[:\-]?\s*(.+)/i) || line.match(/^\d+[:\-]\s*(.+)/i) || line.match(/^Tema[:\-]?\s*(.+)/i);

        if (classMatch) {
          const classTitle = classMatch[1].trim();
          const newClass = await createClass(classTitle, '', courseId, 30); 
          if (newClass) {
             currentClassId = newClass.id;
             topicIndex = 0;
          }
        } else {
          let topicTitle = line;
          if (topicMatch) {
             topicTitle = topicMatch[1].trim();
          }
          if (currentClassId) {
             await createTopic(topicTitle, 'Contenido pendiente (edítalo luego en BD)', currentClassId, topicIndex);
             topicIndex++;
          }
        }
      }
      
      alert('¡Contenido importado correctamente!');
      setBulkText('');
      setShowBulkAdd(null);
      const data = await getClasses(courseId);
      setClassesByCourse(prev => ({ ...prev, [courseId]: data }));
    } catch(err: any) {
      alert("Error al importar: " + err.message);
    } finally {
      setIsProcessingBulk(false);
    }
  };

  return (
    <div className="bg-white dark:bg-indigo-900 p-6 rounded-[2.5rem] shadow-sm border-4 border-indigo-50 dark:border-indigo-800">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-indigo-900 dark:text-white uppercase">Gestor de Cursos</h2>
        <button onClick={handleCreateCourse} className="bg-indigo-600 text-white px-6 py-2 rounded-full font-black text-xs flex items-center gap-2">
          <Plus size={16} /> NUEVO CURSO
        </button>
      </div>

      <div className="space-y-4">
        {courses.map(course => (
          <div key={course.id} className="border-2 border-indigo-100 dark:border-indigo-800 rounded-2xl overflow-hidden">
            <div className="flex justify-between items-center bg-indigo-50 dark:bg-indigo-950 p-4">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleToggleCourse(course.id)}>
                {expandedCourse === course.id ? <ChevronDown size={24} className="text-indigo-600" /> : <ChevronRight size={24} className="text-indigo-600" />}
                <h3 className="font-black text-lg text-indigo-900 dark:text-indigo-200">{course.nombre}</h3>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleEditCourse(course.id, course.nombre)} className="text-indigo-500 p-2 hover:bg-indigo-50 rounded-xl" title="Editar Nombre"><Edit size={18} /></button>
                <button onClick={() => handleDeleteCourse(course.id)} className="text-red-500 p-2 hover:bg-red-50 rounded-xl" title="Eliminar Curso"><Trash2 size={18} /></button>
              </div>
            </div>

            {expandedCourse === course.id && (
              <div className="p-4 bg-white dark:bg-indigo-900 space-y-3">
                <div className="flex justify-between items-center mb-4 border-b pb-2 dark:border-indigo-800">
                  <h4 className="font-bold text-indigo-500 uppercase text-xs tracking-widest">Clases del Curso</h4>
                  <button onClick={() => setShowBulkAdd(showBulkAdd === course.id ? null : course.id)} className="text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-all shadow-md">
                    {showBulkAdd === course.id ? 'Cancelar' : '+ Agregar Clase(s)'}
                  </button>
                </div>

                {showBulkAdd === course.id && (
                  <div className="bg-indigo-50 dark:bg-indigo-950/40 p-5 rounded-2xl border-2 border-indigo-100 dark:border-indigo-800 mb-6 animate-in fade-in slide-in-from-top-2 shadow-inner">
                    <p className="text-sm font-black text-indigo-700 dark:text-indigo-300 uppercase mb-2">Creación Rápida</p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-4 font-medium leading-relaxed">
                      Escribe el nombre de tu clase o <strong>pega todo tu temario</strong> de golpe. Usa este formato:<br/>
                      <span className="font-mono bg-white dark:bg-indigo-900 px-2 py-1 rounded text-[10px] mt-2 inline-block">Clase 1: Título</span><br/>
                      <span className="font-mono bg-white dark:bg-indigo-900 px-2 py-1 rounded text-[10px] mt-1 inline-block">Tema 1: Título del tema</span>
                    </p>
                    <textarea 
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      placeholder={`Clase 1: Introducción\nTema 1: Qué es el pensamiento crítico\n2: La importancia de cuestionar\n\nClase 2: Cómo pensamos\n1: El proceso básico`}
                      className="w-full h-56 p-4 rounded-xl border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-indigo-900 text-sm font-mono outline-none focus:border-indigo-500 mb-4 shadow-sm resize-y"
                      disabled={isProcessingBulk}
                    />
                    <div className="flex justify-end gap-3">
                      <button 
                        onClick={() => setShowBulkAdd(null)} 
                        className="bg-transparent text-indigo-500 hover:bg-indigo-100 font-bold text-xs px-4 py-2 rounded-lg transition-all"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={() => handleProcessBulk(course.id)} 
                        disabled={isProcessingBulk || !bulkText.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-black text-xs px-8 py-3 rounded-lg transition-all shadow-lg hover:shadow-indigo-300 dark:hover:shadow-none"
                      >
                        {isProcessingBulk ? 'GUARDANDO...' : 'GUARDAR CLASES Y TEMAS 🚀'}
                      </button>
                    </div>
                  </div>
                )}
                
                {(classesByCourse[course.id] || []).map(cls => (
                  <div key={cls.id} className="ml-4 border border-indigo-50 dark:border-indigo-800 rounded-xl overflow-hidden">
                    <div className="flex justify-between items-center bg-slate-50 dark:bg-indigo-950/50 p-3">
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleToggleClass(cls.id)}>
                        {expandedClass === cls.id ? <ChevronDown size={18} className="text-indigo-400" /> : <ChevronRight size={18} className="text-indigo-400" />}
                        <span className="font-bold text-indigo-800 dark:text-indigo-200">{cls.titulo}</span>
                        <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-black">{cls.assigned_time_minutes} min</span>
                      </div>
                      <button onClick={() => handleDeleteClass(course.id, cls.id)} className="text-red-400 p-1 hover:bg-red-50 rounded-md"><Trash2 size={14} /></button>
                    </div>

                    {expandedClass === cls.id && (
                      <div className="p-3 bg-white dark:bg-indigo-900 border-t border-indigo-50 dark:border-indigo-800">
                         <div className="flex justify-between items-center mb-3">
                            <h5 className="font-bold text-indigo-400 uppercase text-[10px] tracking-widest">Temas de Estudio</h5>
                            <button onClick={() => handleCreateTopic(cls.id)} className="text-[10px] font-black bg-emerald-50 text-emerald-600 px-2 py-1 rounded-md">
                              + Agregar Tema
                            </button>
                          </div>
                          <div className="space-y-2 ml-4">
                            {(topicsByClass[cls.id] || []).map(topic => (
                              <div key={topic.id} className="flex justify-between items-center bg-sky-50 dark:bg-indigo-950/30 p-2 rounded-lg">
                                <div>
                                  <span className="font-bold text-sm text-indigo-700 dark:text-indigo-300">{topic.titulo}</span>
                                </div>
                                <button onClick={() => handleDeleteTopic(cls.id, topic.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                              </div>
                            ))}
                            {(!topicsByClass[cls.id] || topicsByClass[cls.id].length === 0) && (
                              <p className="text-xs text-indigo-300 italic">No hay temas agregados. Agrega uno manualmente.</p>
                            )}
                          </div>
                      </div>
                    )}
                  </div>
                ))}
                {(!classesByCourse[course.id] || classesByCourse[course.id].length === 0) && (
                  <p className="text-xs text-indigo-300 italic ml-4">No hay clases en este curso.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CourseManager;
