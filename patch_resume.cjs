const fs = require('fs');
let c = fs.readFileSync('components/VirtualClassroom.tsx', 'utf8');

const originalCall = `const responseText = await generateTeacherResponse(
                  lesson, user.username, currentTopic,
                  topicsCount < 10 ? topicsCount : 9, 
                  isReviewMode, 
                  "El estudiante acaba de retomar la clase tras una pausa. Dale una breve y entusiasta bienvenida de vuelta y hazle directamente una nueva pregunta sobre este tema para continuar.",
                  (partial) => {
                    setMessages([...history, { ...streamingMsg, parts: [{ text: partial }] }]);
                  }
               );`;

const newCall = `let responseText = "";
               let currentProvider = aiProvider;
               let providerIndex = FALLBACK_CHAIN.indexOf(currentProvider);
               if (providerIndex === -1) providerIndex = 0;
               
               for (let attempt = 0; attempt < FALLBACK_CHAIN.length; attempt++) {
                  try {
                    responseText = await generateTeacherResponse(
                       lesson, user.username, currentTopic,
                       topicsCount < 10 ? topicsCount : 9, 
                       isReviewMode, 
                       "El estudiante acaba de retomar la clase tras una pausa. Dale una breve y entusiasta bienvenida de vuelta y hazle directamente una nueva pregunta sobre este tema para continuar.",
                       (partial) => {
                         setMessages(prev => {
                            const m = [...prev];
                            if (m.length > 0 && m[m.length-1].isStreaming) {
                              m[m.length-1] = { ...m[m.length-1], parts: [{ text: partial }] };
                            }
                            return m;
                         });
                       }
                    );
                    break;
                  } catch (err) {
                    console.warn(\`\${currentProvider} failed in resume init, attempting fallback...\`, err);
                    const nextIndex = (providerIndex + 1) % FALLBACK_CHAIN.length;
                    currentProvider = FALLBACK_CHAIN[nextIndex];
                    providerIndex = nextIndex;
                    setFallbackMessage(\`Problema de conexión. Cambiando a \${currentProvider.toUpperCase()}...\`);
                    setLocalAiProvider(currentProvider);
                    setAiProvider(currentProvider);
                    if (attempt === FALLBACK_CHAIN.length - 1) {
                       setFallbackMessage(null);
                       throw err;
                    }
                    await new Promise(r => setTimeout(r, 2000));
                  }
               }
               setTimeout(() => setFallbackMessage(null), 4000);`;

if (c.includes(originalCall)) {
  c = c.replace(originalCall, newCall);
  fs.writeFileSync('components/VirtualClassroom.tsx', c);
  console.log("Patched line 301 successfully");
} else {
  console.log("Could not find line 301 call in VirtualClassroom.tsx");
}
