# 📘 Documentación Maestra: Buensoft Education

## 1. Identidad del Proyecto
**Buensoft Education** es un ecosistema de aprendizaje digital diseñado para niños, que combina la potencia de la Inteligencia Artificial Generativa (Gemini 3 Flash) con una estructura pedagógica estricta y un sistema de economía virtual gamificado.

---

## 2. Roles del Sistema

### 👨‍👩‍👧‍👦 Administrador (Padre/Tutor)
*   **Gestión de Usuarios:** Creación y control de perfiles de estudiantes.
*   **Guía de Materias:** Repositorio central de currículos con prompts personalizados por materia.
*   **Asignación Dinámica:** Capacidad de distribuir bloques de lecciones masivas (texto plano a lecciones individuales) respetando el calendario escolar.
*   **Modo Espejo:** Capacidad de visualizar la interfaz exacta del alumno para auditar su progreso.
*   **Banca Central:** Supervisión de la liquidez del sistema y transferencias.

### 🎓 Estudiante (Hijo)
*   **Aula Virtual:** Acceso a lecciones programadas mediante un calendario interactivo.
*   **Aprendizaje Guiado:** Interacción uno a uno con el Tutor de IA.
*   **Economía Personal:** Gestión de su propio "Banco" donde acumula dinero real (MXN) basado en sus calificaciones académicas.

### 🤖 Tutor de IA (Tutor Académico Especializado)
*   **Personalidad:** Firme, profesional, motivador y estrictamente académico.
*   **Misión:** Guiar al estudiante a través del tema, evaluando constantemente su comprensión antes de permitirle avanzar al examen final.

---

## 3. Protocolo Pedagógico del Tutor de IA (La Muralla Académica)

Para garantizar la integridad educativa, el Tutor de IA opera bajo reglas de diseño instruccional inamovibles:

### A. Arquitectura de Evaluación (Regla 60/40)
*   **60% Preguntas de Opción Múltiple (MCQ):** Enfocadas en el reconocimiento de conceptos y precisión técnica.
*   **40% Preguntas Abiertas (WRITTEN):** Enfocadas en el análisis crítico, síntesis y capacidad de expresión del estudiante.

### B. Bloqueo de Simplificación
El Tutor tiene prohibido ceder ante la presión del estudiante por facilitar la clase. Cualquier intento de pedir respuestas de "Sí/No" o reducir el rigor académico es bloqueado con el mensaje:
> *"Para garantizar tu aprendizaje, debemos seguir el formato de evaluación establecido. Continuemos con el tema."*

### C. Protocolo de Opción Múltiple (Anti-Patrones Psicométricos)
Para evitar que el estudiante adivine la respuesta sin conocimiento real:
*   **Estructura Fija:** Exactamente 4 opciones (A, B, C, D) por pregunta.
*   **Homogeneidad:** Todas las opciones deben tener una longitud y estructura gramatical similar.
*   **Aleatoriedad:** La respuesta correcta se asigna al azar; no hay patrones de posición.

---

## 4. Sistema de Gamificación y Economía (EdFi)

El sistema motiva el rendimiento académico mediante una conversión directa de esfuerzo en recompensa:

1.  **Calificaciones (0-10):** Cada lección termina con un examen de 10 preguntas.
2.  **Créditos (Estrellas):** Cada punto de calificación equivale a 1 estrella/crédito.
3.  **Transferencia Bancaria:** Los créditos acumulados en la semana pueden ser "transferidos" por el estudiante a su cuenta bancaria virtual.
4.  **Saldo Real:** El saldo en el banco representa dinero real gestionado por los padres, permitiendo al niño ver el valor tangible de su estudio.

---

## 5. Especificaciones de Diseño (UI/UX)

*   **Tipografía:** *Fredoka* (amigable y legible).
*   **Estética:** Bordes ultra-redondeados (`rounded-[3rem]`), sombras suaves y contrastes altos.
*   **Paleta de Colores de Estatus:**
    *   🔵 **Azul (Pendiente):** Lección programada sin iniciar.
    *   🟠 **Naranja (En Progreso):** Sesión iniciada o en pausa.
    *   🟢 **Verde (Aprobada/Completada):** Nota ≥ 6/10.
    *   🔴 **Rojo (Reprobada):** Nota < 6/10.

---

## 6. Calendario Escolar Integrado
El sistema de asignación masiva reconoce automáticamente el **Calendario Escolar SEP Quintana Roo 2025-2026**, omitiendo:
*   Fines de semana.
*   Días Festivos (Ej. 16 de Sep, 1 de Mayo).
*   Consejos Técnicos Escolares (CTE).
*   Periodos Vacacionales (Navidad y Semana Santa).

---

## 7. Comandos de Control (Modo Admin)
Dentro del chat de lección, el Administrador puede enviar comandos especiales ocultos:
*   `$Admin: salir` -> Cierra y guarda la sesión inmediatamente.
*   `$Admin: examen` -> Salta directamente a la evaluación final.
*   `$Admin: >N` -> Suma N minutos al cronómetro.
*   `$Admin: <N` -> Resta N minutos al cronómetro.

---
*Buensoft Education: Transformando el tiempo de pantalla en tiempo de crecimiento.*