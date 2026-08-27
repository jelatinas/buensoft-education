const fs = require('fs');

// 1. Patch VirtualClassroom.tsx
let vc = fs.readFileSync('components/VirtualClassroom.tsx', 'utf8');

// Fix '...' to 'El profesor está escribiendo...'
vc = vc.replace(
  /const displayText = msg\.isStreaming && !explanation\.trim\(\) \? '\.\.\.' : explanation;/g,
  "const displayText = msg.isStreaming && !explanation.trim() ? 'El profesor está escribiendo...' : explanation;"
);

// Fix flicker by not showing the spinner if there's a streaming message
const originalSpinner = `{isLoading && (
              <div className="flex justify-start w-full mb-6">`;
const newSpinner = `{isLoading && !messages.some(m => m.isStreaming) && (
              <div className="flex justify-start w-full mb-6">`;
vc = vc.replace(originalSpinner, newSpinner);

// Update error handling in VirtualClassroom to include timeouts
vc = vc.replace(
  /const isNotFound = errStr\.includes\('404'\) \|\| errStr\.includes\('Model does not exist'\);/g,
  `const isNotFound = errStr.includes('404') || errStr.includes('Model does not exist');\n        const isTimeout = errStr.includes('aborted') || errStr.includes('AbortError');`
);
vc = vc.replace(
  /else if \(isNotFound\) errorText = "Cerebras reporta que el modelo seleccionado no existe o no tienes acceso \(Error 404\)\.";/g,
  `else if (isNotFound) errorText = "Cerebras reporta que el modelo seleccionado no existe o no tienes acceso (Error 404).";\n        else if (isTimeout) errorText = "El modelo de IA tardó demasiado en responder (Error de Tiempo de Espera).";`
);
vc = vc.replace(
  /String\(err\)\.includes\('404'\) \? "Error: Cerebras reporta modelo inexistente \(404\)\." :/g,
  `String(err).includes('404') ? "Error: Cerebras reporta modelo inexistente (404)." : String(err).includes('aborted') || String(err).includes('AbortError') ? "Error: El modelo de IA tardó demasiado en responder." :`
);

fs.writeFileSync('components/VirtualClassroom.tsx', vc);

// 2. Patch geminiService2.ts to add AbortController
let gs2 = fs.readFileSync('geminiService2.ts', 'utf8');

const originalFetch = `      const aiRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': \`Bearer \${apiKey}\`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: temp,
          response_format: config?.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined
        })
      });`;

const newFetch = `      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      let aiRes;
      try {
        aiRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': \`Bearer \${apiKey}\`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: temp,
            response_format: config?.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined
          }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }`;

gs2 = gs2.replace(originalFetch, newFetch);

// Also patch the fallback loop timeout in api/gemini.ts? Wait, the user specifically mentioned fallback to Gemini in the frontend, which is what VirtualClassroom does automatically when it catches an error. 
// However, api/gemini.ts also does a fetch. I should patch that too.
let ag = fs.readFileSync('api/gemini.ts', 'utf8');
const originalServerFetch = `      const aiRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': \`Bearer \${apiKey}\`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: config?.temperature ?? 0.7,
          response_format: config?.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined
        })
      });`;

const newServerFetch = `      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      let aiRes;
      try {
        aiRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': \`Bearer \${apiKey}\`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: config?.temperature ?? 0.7,
            response_format: config?.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined
          }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }`;

ag = ag.replace(originalServerFetch, newServerFetch);
fs.writeFileSync('api/gemini.ts', ag);
fs.writeFileSync('geminiService2.ts', gs2);

console.log("Patched timeout and streaming text.");
