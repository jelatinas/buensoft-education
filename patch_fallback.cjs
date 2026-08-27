const fs = require('fs');
let c = fs.readFileSync('components/VirtualClassroom.tsx', 'utf8');

if (!c.includes('const FALLBACK_CHAIN')) {
  c = c.replace(/const \[aiProvider, setLocalAiProvider\] = useState\(getAiProvider\(\)\);/, 
  `const [aiProvider, setLocalAiProvider] = useState(getAiProvider());
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const FALLBACK_CHAIN = ['gemini', 'deepseek', 'cerebras'];`);
}

// 1. Change '...' to 'El profesor está escribiendo...'
c = c.replace(/text: '\.\.\.'/g, "text: 'El profesor está escribiendo...'");

// 2. Wrap generateTeacherResponse in a retry loop inside generateAndAppendTeacherResponse
const originalGenCall = `const responseText = await generateTeacherResponse(
      lesson, user.username, currentTopic,
      newCompletedTopics < 10 ? newCompletedTopics : 9,
      isReviewMode, teacherContext,
      (partial) => {
        setMessages(prev => [
          ...prev.slice(0, -1),
          { ...streamingMsg, parts: [{ text: partial }] }
        ]);
      }
    );`;

const newGenCall = `let responseText = "";
    let currentProvider = aiProvider;
    let providerIndex = FALLBACK_CHAIN.indexOf(currentProvider);
    if (providerIndex === -1) providerIndex = 0;
    
    for (let attempt = 0; attempt < FALLBACK_CHAIN.length; attempt++) {
       try {
         responseText = await generateTeacherResponse(
           lesson, user.username, currentTopic,
           newCompletedTopics < 10 ? newCompletedTopics : 9,
           isReviewMode, teacherContext,
           (partial) => {
             setMessages(prev => {
               const idx = prev.findIndex(m => m.isStreaming);
               if (idx === -1) return prev;
               const newMsgs = [...prev];
               newMsgs[idx] = { ...newMsgs[idx], parts: [{ text: partial }] };
               return newMsgs;
             });
           }
         );
         break; // Success
       } catch (err) {
         console.warn(\`\${currentProvider} failed, attempting fallback...\`, err);
         const nextIndex = (providerIndex + 1) % FALLBACK_CHAIN.length;
         currentProvider = FALLBACK_CHAIN[nextIndex];
         providerIndex = nextIndex;
         setFallbackMessage(\`El modelo tardó demasiado. Cambiando a \${currentProvider.toUpperCase()}...\`);
         setLocalAiProvider(currentProvider);
         setAiProvider(currentProvider);
         
         if (attempt === FALLBACK_CHAIN.length - 1) {
            setFallbackMessage(null);
            throw err; // All failed
         }
         await new Promise(r => setTimeout(r, 2000));
       }
    }
    setTimeout(() => setFallbackMessage(null), 4000);
    `;

if (c.includes(originalGenCall)) {
  c = c.replace(originalGenCall, newGenCall);
}

// Same for the initial generateTeacherResponse inside initChat
const originalInitCall = `const responseText = await generateTeacherResponse(lesson, user.username, topic, 0, false, undefined, (partial) => {
               setMessages([{ ...streamingMsg, parts: [{ text: partial }] }]);
             });`;

const newInitCall = `let responseText = "";
             let currentProvider = aiProvider;
             let providerIndex = FALLBACK_CHAIN.indexOf(currentProvider);
             if (providerIndex === -1) providerIndex = 0;
             
             for (let attempt = 0; attempt < FALLBACK_CHAIN.length; attempt++) {
                try {
                  responseText = await generateTeacherResponse(lesson, user.username, topic, 0, false, undefined, (partial) => {
                    setMessages(prev => {
                       const m = [...prev];
                       if (m.length > 0 && m[m.length-1].isStreaming) {
                         m[m.length-1] = { ...m[m.length-1], parts: [{ text: partial }] };
                       }
                       return m;
                    });
                  });
                  break;
                } catch (err) {
                  console.warn(\`\${currentProvider} failed in init, attempting fallback...\`, err);
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

if (c.includes(originalInitCall)) {
  c = c.replace(originalInitCall, newInitCall);
}

// Add the legend UI
const headerCloseCode = `<header className="bg-indigo-600 text-white p-4 shadow-lg flex justify-between items-center z-10 shrink-0">`;
const newHeaderCode = `${headerCloseCode}
        {fallbackMessage && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-amber-500 text-white px-6 py-2 rounded-full font-black text-xs z-50 shadow-2xl animate-bounce">
             ⚠️ {fallbackMessage}
          </div>
        )}`;

if (!c.includes('fallbackMessage && (')) {
  c = c.replace(headerCloseCode, newHeaderCode);
}

fs.writeFileSync('components/VirtualClassroom.tsx', c);
