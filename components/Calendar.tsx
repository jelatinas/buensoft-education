import React from 'react';
import { Lesson, ChatMessage } from '../types';
import { getSchoolDayStatus } from '../utils/schoolCalendar';

interface CalendarProps {
  lessons: Lesson[];
  selectedDate?: string | null;
  isAdmin?: boolean;
  onDayClick?: (date: string) => void;
  onDayDoubleClick?: (date: string) => void;
  onEditLesson?: (lesson: Lesson) => void;
  onDeleteLesson?: (lessonId: string) => void;
  weekStart?: Date;
  onWeekStartChange?: (date: Date) => void;
}

const Calendar: React.FC<CalendarProps> = ({ 
  lessons, 
  selectedDate,
  isAdmin, 
  onDayClick, 
  onDayDoubleClick,
  onEditLesson,
  onDeleteLesson,
  weekStart: propsWeekStart,
  onWeekStartChange
}) => {
  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0); 
    return monday;
  };

  const [internalWeekStart, setInternalWeekStart] = React.useState(() => getMonday(new Date()));
  const activeWeekStart = propsWeekStart || internalWeekStart;

  const updateWeekStart = (newDate: Date) => {
    if (onWeekStartChange) {
      onWeekStartChange(newDate);
    } else {
      setInternalWeekStart(newDate);
    }
  };

  const getWeekDays = (start: Date) => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const weekDays = getWeekDays(activeWeekStart);

  const prevWeek = () => {
    const newStart = new Date(activeWeekStart);
    newStart.setDate(activeWeekStart.getDate() - 7);
    updateWeekStart(newStart);
    
    // Navegación Inteligente: Seleccionar automáticamente el primer día de la nueva semana
    const firstDayStr = newStart.getFullYear() + '-' + 
                        String(newStart.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(newStart.getDate()).padStart(2, '0');
    onDayClick?.(firstDayStr);
  };

  const nextWeek = () => {
    const newStart = new Date(activeWeekStart);
    newStart.setDate(activeWeekStart.getDate() + 7);
    updateWeekStart(newStart);
    
    // Navegación Inteligente: Seleccionar automáticamente el primer día de la nueva semana
    const firstDayStr = newStart.getFullYear() + '-' + 
                        String(newStart.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(newStart.getDate()).padStart(2, '0');
    onDayClick?.(firstDayStr);
  };

  const handleGoToToday = () => {
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + 
                     String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(today.getDate()).padStart(2, '0');
    const newMonday = getMonday(today);
    updateWeekStart(newMonday);
    onDayClick?.(todayStr);
  };

  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  const getLessonVisuals = (lesson: Lesson) => {
    const status = (lesson.lesson_status || 'Pendiente').toLowerCase();
    const isTransfered = !!lesson.credits_transfered;
    const grade = lesson.grade !== undefined && lesson.grade !== null ? lesson.grade : null;
    
    // Default: Pendiente (Azul Primario: bg-blue-600)
    let colorClass = 'bg-blue-600'; 
    let label = 'Pte';
    let textColor = 'text-white';

    if (status === 'aprobada' || status === 'completada') {
      // Verde Primario: bg-green-600 / Verde Pagado: bg-green-800
      colorClass = isTransfered ? 'bg-green-800' : 'bg-green-600';
      label = isTransfered ? 'Pag' : 'Log';
      textColor = 'text-white';
    } else if (status === 'reprobada') {
      // Rojo Primario: bg-red-600
      colorClass = 'bg-red-600';
      label = 'Rep';
      textColor = 'text-white';
    } else if (status === 'en progreso') {
      // Naranja Primario: bg-orange-500
      colorClass = 'bg-orange-500';
      label = 'Prog';
      textColor = 'text-white';
    }

    return { colorClass, label, grade, textColor };
  };

  return (
    <div className="w-full font-fredoka transition-colors">
      <div className="flex justify-between items-center mb-6 px-1">
        <div className="flex flex-col">
          <h3 className="text-xl md:text-2xl font-black text-indigo-900 dark:text-white tracking-tight">
            Calendario de Actividades
          </h3>
          <p className="text-xs font-bold text-indigo-400 dark:text-indigo-500 uppercase tracking-widest">
            {monthNames[activeWeekStart.getMonth()]} {activeWeekStart.getFullYear()}
          </p>
        </div>
        <div className="flex space-x-2">
          <button onClick={prevWeek} className="w-10 h-10 rounded-xl bg-white dark:bg-indigo-800 border-2 border-indigo-50 dark:border-indigo-700 hover:bg-indigo-600 hover:text-white text-indigo-600 dark:text-indigo-200 font-black transition-all">←</button>
          <button onClick={handleGoToToday} className="px-4 h-10 rounded-xl bg-amber-400 border-2 border-amber-500 hover:bg-amber-500 text-indigo-900 font-black transition-all text-[11px] uppercase">HOY</button>
          <button onClick={nextWeek} className="w-10 h-10 rounded-xl bg-white dark:bg-indigo-900 border-2 border-indigo-50 dark:border-indigo-700 hover:bg-indigo-600 hover:text-white text-indigo-600 dark:text-indigo-200 font-black transition-all">→</button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-4 border-indigo-50 dark:border-indigo-800 rounded-[2.5rem] overflow-hidden shadow-sm bg-white dark:bg-indigo-900">
        {dayNames.map(day => (
          <div key={day} className="bg-indigo-600 text-white text-center py-2 text-[10px] font-black uppercase tracking-widest border-r border-indigo-500/30 last:border-r-0">
            {day}
          </div>
        ))}

        {weekDays.map((date) => {
          const dateStr = date.getFullYear() + '-' + 
                          String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                          String(date.getDate()).padStart(2, '0');
          
          const dayLessons = lessons.filter(l => l.date === dateStr);
          const todayObj = new Date();
          const todayStr = todayObj.getFullYear() + '-' + 
                           String(todayObj.getMonth() + 1).padStart(2, '0') + '-' + 
                           String(todayObj.getDate()).padStart(2, '0');
          
          const isToday = todayStr === dateStr;
          const isSelected = selectedDate === dateStr;
          const status = getSchoolDayStatus(dateStr);
          const dailyCredits = dayLessons.reduce((acc, curr) => acc + (curr.grade || 0), 0);

          let dayClasses = `min-h-[140px] md:min-h-[160px] border-r border-indigo-50 dark:border-indigo-800 p-2 last:border-r-0 cursor-pointer transition-all relative `;
          
          if (isSelected) {
            dayClasses += "bg-amber-50 dark:bg-amber-900/20 ring-4 ring-inset ring-amber-400 z-10 ";
          } else if (!status.isSchoolDay) {
            dayClasses += "bg-slate-50 dark:bg-indigo-950/50 ";
          } else {
            dayClasses += "bg-white dark:bg-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-800/50 ";
          }

          return (
            <div key={dateStr} onClick={() => onDayClick?.(dateStr)} className={dayClasses}>
              <div className="flex justify-between items-start mb-2">
                <span className={`w-7 h-7 flex items-center justify-center rounded-full text-[10px] font-black ${isToday ? 'bg-amber-400 text-indigo-900 shadow-md' : isSelected ? 'text-indigo-900 dark:text-amber-400' : 'text-indigo-300 dark:text-indigo-600'}`}>
                  {date.getDate()}
                </span>
                {dailyCredits > 0 && (
                  <span className="text-[8px] font-black text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/40 px-1 rounded border border-amber-200 dark:border-amber-900/30">
                    ⭐ {dailyCredits}
                  </span>
                )}
              </div>

              <div className="space-y-1 relative z-10">
                {dayLessons.map(lesson => {
                   const { colorClass, label, grade, textColor } = getLessonVisuals(lesson);

                   return (
                    <div key={lesson.id} className={`text-[8px] p-1.5 rounded-xl font-black flex flex-col border shadow-sm ${colorClass} ${textColor} border-black/5 transition-transform hover:scale-[1.02]`}>
                      <div className="flex justify-between items-center w-full">
                        <span className="truncate leading-tight uppercase flex-1">{lesson.subject}</span>
                        <span className="text-[6px] opacity-70 ml-1 font-black shrink-0">{label}</span>
                      </div>
                      {grade !== null && (
                        <div className="flex items-center justify-end mt-0.5 space-x-1 border-t border-white/10 pt-0.5">
                          <span className="text-[7px]">Créditos: {grade}/10</span>
                        </div>
                      )}
                    </div>
                   );
                })}
              </div>
              
              {!status.isSchoolDay && (
                <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none select-none">
                   <span className="text-[10px] font-black uppercase -rotate-45">{status.reason}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Calendar;
