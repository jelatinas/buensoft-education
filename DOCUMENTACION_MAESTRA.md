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

---

## 3. Protocolo Pedagógico del Tutor de IA (La Muralla Académica)

Para garantizar la integridad educativa, el Tutor de IA opera bajo reglas de diseño instruccional inamovibles:

### A. Arquitectura de Evaluación y Densidad
*   **Regla del 70% (Densidad Académica):** Las interacciones válidas requeridas para acreditar la lección son exactamente el 70% de la meta de tiempo (Ej: 20 min = 14 interacciones).
*   **Regla 60/40:** 60% de preguntas de Opción Múltiple (MCQ) y 40% de preguntas abiertas (WRITTEN) durante la lección.

### B. Optimización Cognitiva (Temporizadores)
*   **Preguntas Abiertas (WRITTEN):** 120 segundos para fomentar el análisis profundo.
*   **Preguntas de Opción Múltiple (MCQ):** Tiempo basado en conteo de palabras + 20 segundos de bonificación.

### C. Protocolo MCQ (Anti-Patrones)
*   **Estructura Fija:** Exactamente 4 opciones (A, B, C, D) por pregunta.
*   **Homogeneidad:** Todas las opciones deben tener una longitud y estructura gramatical similar para eliminar pistas visuales.

---

## 4. Seguridad y Propiedad Intelectual
El sistema implementa capas de protección para evitar la extracción de contenido educativo:
1.  **Bloqueo de Selección:** CSS `user-select: none` activo en toda el área de lección.
2.  **Bloqueo de Interacción:** Inhabilitación de comandos de copiado (Ctrl+C/Cmd+C) y menú contextual.

---

## 5. Sistema de Gamificación y Economía (EdFi)
El sistema motiva el rendimiento académico mediante una conversión directa de esfuerzo en recompensa:
1.  **Calificaciones (0-10):** Cada lección termina con un examen de 10 preguntas.
2.  **Créditos (Estrellas):** Cada punto de calificación equivale a 1 estrella/crédito.
3.  **Saldo Real:** El banco virtual representa liquidez real gestionada por los padres.

---

## 6. Calendario Escolar Integrado
El sistema reconoce automáticamente el **Calendario Escolar SEP Quintana Roo 2025-2026**, omitiendo fines de semana, días festivos y periodos de Consejo Técnico (CTE).

---

## 7. Comandos de Control (Modo Admin)
Comandos especiales ocultos en el chat:
*   `$Admin: salir` -> Guarda y cierra sesión.
*   `$Admin: examen` -> Salta a la evaluación final.
*   `$Admin: >N` / `$Admin: <N` -> Ajuste manual de cronómetro.

---
*Buensoft Education: Transformando el tiempo de pantalla en tiempo de crecimiento.*