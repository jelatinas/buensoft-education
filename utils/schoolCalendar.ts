
export interface DayStatus {
  isSchoolDay: boolean;
  reason?: string;
  type: 'holiday' | 'vacation' | 'cte' | 'weekend' | 'out_of_range' | 'regular';
}

export const getSchoolDayStatus = (dateStr: string): DayStatus => {
  const date = new Date(dateStr + 'T12:00:00');
  const day = date.getDay(); // 0: Dom, 6: Sáb
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11
  const dayOfMonth = date.getDate();

  // Fines de semana
  if (day === 0 || day === 6) {
    return { isSchoolDay: false, type: 'weekend', reason: 'Fin de Semana' };
  }

  // Rango Escolar 2026-2027 (Aprox. 24 Ago 2026 - 16 Jul 2027)
  const schoolStart = new Date('2026-08-24T00:00:00');
  const schoolEnd = new Date('2027-07-16T23:59:59');
  
  if (date < schoolStart || date > schoolEnd) {
    return { isSchoolDay: false, type: 'out_of_range', reason: 'Fuera de Ciclo Escolar' };
  }

  // Días Festivos Oficiales y Suspensión de Labores (Quintana Roo 2026-2027)
  const holidays: Record<string, string> = {
    '2026-09-16': 'Independencia de México',
    '2026-10-08': 'Creación del Estado de Q. Roo',
    '2026-11-02': 'Día de Muertos',
    '2026-11-16': 'Revolución Mexicana (Obs.)',
    '2026-12-25': 'Navidad',
    '2027-01-01': 'Año Nuevo',
    '2027-02-01': 'Constitución Mexicana (Obs.)',
    '2027-03-15': 'Natalicio Benito Juárez (Obs.)',
    '2027-05-01': 'Día del Trabajo',
    '2027-05-05': 'Batalla de Puebla',
    '2027-05-15': 'Día del Maestro'
  };

  if (holidays[dateStr]) {
    return { isSchoolDay: false, type: 'holiday', reason: holidays[dateStr] };
  }

  // Periodos Vacacionales
  // Invierno: 21 Dic 2026 al 8 Ene 2027
  if ((year === 2026 && month === 11 && dayOfMonth >= 21) || 
      (year === 2027 && month === 0 && dayOfMonth <= 8)) {
    return { isSchoolDay: false, type: 'vacation', reason: 'Vacaciones de Invierno' };
  }

  // Semana Santa: 22 Mar al 2 Abr 2027
  if ((year === 2027 && month === 2 && dayOfMonth >= 22) || 
      (year === 2027 && month === 3 && dayOfMonth <= 2)) {
    return { isSchoolDay: false, type: 'vacation', reason: 'Vacaciones de Semana Santa' };
  }

  // Consejo Técnico Escolar (Último viernes de cada mes, excepto meses de inicio/vacaciones)
  const cteDates = [
    '2026-09-25', '2026-10-30', '2026-11-27',
    '2027-01-29', '2027-02-26', '2027-03-26',
    '2027-05-28', '2027-06-25'
  ];
  if (cteDates.includes(dateStr)) {
    return { isSchoolDay: false, type: 'cte', reason: 'Consejo Técnico Escolar' };
  }

  return { isSchoolDay: true, type: 'regular' };
};
