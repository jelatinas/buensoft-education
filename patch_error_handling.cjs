const fs = require('fs');

// 1. Patch geminiService2.ts model string
let geminiService = fs.readFileSync('geminiService2.ts', 'utf8');
geminiService = geminiService.replace(/'llama3\.1-8b'/g, "'llama-3.3-70b'");
fs.writeFileSync('geminiService2.ts', geminiService);

// 2. Patch api/gemini.ts model string
if (fs.existsSync('api/gemini.ts')) {
  let apiGemini = fs.readFileSync('api/gemini.ts', 'utf8');
  apiGemini = apiGemini.replace(/'llama3\.1-8b'/g, "'llama-3.3-70b'");
  fs.writeFileSync('api/gemini.ts', apiGemini);
}

// 3. Patch VirtualClassroom.tsx error messages in initChat and handleSend/handleMCQSelect
let vClass = fs.readFileSync('components/VirtualClassroom.tsx', 'utf8');

const originalInitError = `        const isQuotaError = String(err).includes('429') || String(err).includes('quota');
        const errorMsg: ChatMessage = { 
          role: 'model',
          parts: [{ text: isQuotaError ? "Has agotado tu límite de mensajes gratuitos en Gemini o el servidor está saturado (Error 429). Por favor, agrega tu propia API Key en 'Llave IA ⚙️' desde el inicio o espera unos minutos." : "Ocurrió un error al iniciar la clase con el modelo de IA. El servidor puede estar saturado." }], `;

const newInitError = `        const errStr = String(err);
        const isQuotaError = errStr.includes('429') || errStr.includes('quota');
        const isBalanceError = errStr.includes('402') || errStr.includes('Insufficient Balance');
        const isNotFound = errStr.includes('404') || errStr.includes('Model does not exist');
        
        let errorText = "Ocurrió un error al iniciar la clase con el modelo de IA. El servidor puede estar saturado.";
        if (isQuotaError) errorText = "Has agotado tu límite de mensajes gratuitos o el servidor está saturado (Error 429).";
        else if (isBalanceError) errorText = "DeepSeek reporta saldo insuficiente (Error 402). Por favor, recarga tu cuenta.";
        else if (isNotFound) errorText = "Cerebras reporta que el modelo seleccionado no existe o no tienes acceso (Error 404).";
        
        const errorMsg: ChatMessage = { 
          role: 'model',
          parts: [{ text: errorText }], `;

vClass = vClass.replace(originalInitError, newInitError);

// Replace general error text in handleMCQSelect and handleSend
vClass = vClass.replace(
  /text: "Ocurrió un error con el modelo de IA \(503\)\. Los servidores están saturados\."/g,
  `text: String(err).includes('402') ? "Error: DeepSeek reporta saldo insuficiente (402)." : String(err).includes('404') ? "Error: Cerebras reporta modelo inexistente (404)." : "Ocurrió un error con el modelo de IA. Los servidores están saturados."`
);
vClass = vClass.replace(
  /text: "Ocurrió un error con el modelo de IA \(503 Service Unavailable\)\. Los servidores están saturados\."/g,
  `text: String(err).includes('402') ? "Error: DeepSeek reporta saldo insuficiente (402)." : String(err).includes('404') ? "Error: Cerebras reporta modelo inexistente (404)." : "Ocurrió un error con el modelo de IA (503 Service Unavailable). Los servidores están saturados."`
);

fs.writeFileSync('components/VirtualClassroom.tsx', vClass);
