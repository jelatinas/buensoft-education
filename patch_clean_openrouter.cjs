const fs = require('fs');

// Clean up isDeepseek to isOpenrouter in geminiService2.ts
let gs2 = fs.readFileSync('geminiService2.ts', 'utf8');
gs2 = gs2.replace(/isDeepseek/g, 'isOpenrouter');
// Also clean up any lingering 'deepseek' text in error messages
gs2 = gs2.replace(/DeepSeek reporta saldo insuficiente/g, 'OpenRouter reporta saldo insuficiente');
fs.writeFileSync('geminiService2.ts', gs2);

// Clean up isDeepseek to isOpenrouter in api/gemini.ts
if (fs.existsSync('api/gemini.ts')) {
  let ag = fs.readFileSync('api/gemini.ts', 'utf8');
  ag = ag.replace(/isDeepseek/g, 'isOpenrouter');
  fs.writeFileSync('api/gemini.ts', ag);
}

// Update error messages in VirtualClassroom.tsx
let vc = fs.readFileSync('components/VirtualClassroom.tsx', 'utf8');
vc = vc.replace(/DeepSeek reporta saldo insuficiente/g, 'OpenRouter reporta fallo o saldo insuficiente');
fs.writeFileSync('components/VirtualClassroom.tsx', vc);
