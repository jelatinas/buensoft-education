const fs = require('fs');
let gs2 = fs.readFileSync('geminiService2.ts', 'utf8');

// 1. Fix generateClassExamQuestions
const oldGenerateClass = `  for (let i = 0; i <= retries; i++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              preguntas: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    tipo: { type: Type.STRING, enum: ['open', 'multiple_choice', 'true_false'] },
                    pregunta: { type: Type.STRING },
                    respuesta_correcta: { type: Type.STRING },
                    explicacion: { type: Type.STRING },
                    opciones: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ['tipo', 'pregunta', 'respuesta_correcta']
                }
              }
            }
          }
        }
      });
      const cleaned = cleanJsonResponse(response.text || '');
      const examData = JSON.parse(cleaned);
      if (examData.preguntas) return examData.preguntas;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return [];
};`;

const newGenerateClass = `  for (let i = 0; i <= retries; i++) {
    try {
      const response = await callGeminiApi('generateClassExamQuestions', [{ role: 'user', parts: [{ text: prompt }] }], {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            preguntas: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  tipo: { type: Type.STRING, enum: ['open', 'multiple_choice', 'true_false'] },
                  pregunta: { type: Type.STRING },
                  respuesta_correcta: { type: Type.STRING },
                  explicacion: { type: Type.STRING },
                  opciones: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ['tipo', 'pregunta', 'respuesta_correcta']
              }
            }
          }
        }
      });
      const cleaned = cleanJsonResponse(response.text || '');
      const examData = JSON.parse(cleaned);
      if (examData.preguntas) return examData.preguntas;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return [];
};`;

gs2 = gs2.replace(oldGenerateClass, newGenerateClass);

// 2. Fix generateExam return statement (just in case it's used elsewhere)
gs2 = gs2.replace(
  `        return { ...q, options: shuffled, correct_answer: cleanStr(q.correct_answer) };
      });
    }
  } catch (e) { return { questions: [] }; }`,
  `        return { ...q, options: shuffled, correct_answer: cleanStr(q.correct_answer) };
      });
      return examData.questions || [];
    }
  } catch (e) { return { questions: [] }; }`
);

// 3. Fix the timeout fetch in geminiService2.ts
const oldFetchGs2 = `      const aiRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${apiKey}\`
        },
        body: JSON.stringify({`;

const newFetchGs2 = `      const controller = new AbortController();
      const timeoutMs = (action === 'generateTeacherResponse') ? 8000 : 45000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      let aiRes;
      try {
        aiRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${apiKey}\`
          },
          body: JSON.stringify({`;

gs2 = gs2.replace(oldFetchGs2, newFetchGs2);

// We need to add the finally block to clear the timeout
const oldFetchEndGs2 = `      });
      
      if (!aiRes.ok) throw new Error(\`API Error \${aiRes.status}: \${await aiRes.text()}\`);`;

const newFetchEndGs2 = `      }), signal: controller.signal });
      } finally { clearTimeout(timeoutId); }
      
      if (!aiRes.ok) throw new Error(\`API Error \${aiRes.status}: \${await aiRes.text()}\`);`;

gs2 = gs2.replace(oldFetchEndGs2, newFetchEndGs2);

fs.writeFileSync('geminiService2.ts', gs2);

// 4. Fix VirtualClassroom.tsx flicker
let vc = fs.readFileSync('components/VirtualClassroom.tsx', 'utf8');

// Remove setIsLoading(true) inside handleSend
vc = vc.replace(
  `    setIsLoading(true);
    setLoadingText('Escribiendo...');
    try {
      const currentMsgs = [...messages, userMsg];`,
  `    setLoadingText('Escribiendo...');
    try {
      const currentMsgs = [...messages, userMsg];`
);

fs.writeFileSync('components/VirtualClassroom.tsx', vc);

console.log("Patched everything!");
