const fs = require('fs');

// 1. vite.config.ts
let vite = fs.readFileSync('vite.config.ts', 'utf8');
vite = vite.replace(/DEEPSEEK_API_KEY/g, 'OPENROUTER_API_KEY');
fs.writeFileSync('vite.config.ts', vite);

// 2. geminiService2.ts
let gs2 = fs.readFileSync('geminiService2.ts', 'utf8');
gs2 = gs2.replace(/deepseek/g, 'openrouter');
gs2 = gs2.replace(/DEEPSEEK/g, 'OPENROUTER');
gs2 = gs2.replace(/isOpenrouter = provider === 'openrouter'/g, "isOpenrouter = provider === 'openrouter'");
gs2 = gs2.replace(/https:\/\/api\.openrouter\.com\/v1\/chat\/completions/g, 'https://openrouter.ai/api/v1/chat/completions');
gs2 = gs2.replace(/'openrouter-chat'/g, "'openrouter/auto'");
gs2 = gs2.replace(/if \(isOpenrouter\) temp = 0\.1;/g, ""); // Remove the temp=0.1 override for deepseek since OpenRouter handles many models
fs.writeFileSync('geminiService2.ts', gs2);

// 3. api/gemini.ts
if (fs.existsSync('api/gemini.ts')) {
  let ag = fs.readFileSync('api/gemini.ts', 'utf8');
  ag = ag.replace(/deepseek/g, 'openrouter');
  ag = ag.replace(/DEEPSEEK/g, 'OPENROUTER');
  ag = ag.replace(/https:\/\/api\.openrouter\.com\/v1\/chat\/completions/g, 'https://openrouter.ai/api/v1/chat/completions');
  ag = ag.replace(/'openrouter-chat'/g, "'openrouter/auto'");
  fs.writeFileSync('api/gemini.ts', ag);
}

// 4. VirtualClassroom.tsx
let vc = fs.readFileSync('components/VirtualClassroom.tsx', 'utf8');
vc = vc.replace(/deepseek/g, 'openrouter');
vc = vc.replace(/DeepSeek/g, 'OpenRouter');
vc = vc.replace(/DEEPSEEK/g, 'OPENROUTER');
vc = vc.replace(/OpenRouter V4 Flash/g, 'OpenRouter (Auto)');
fs.writeFileSync('components/VirtualClassroom.tsx', vc);

// 5. StudentDashboard.tsx
let sd = fs.readFileSync('components/StudentDashboard.tsx', 'utf8');
sd = sd.replace(/deepseek/g, 'openrouter');
sd = sd.replace(/DeepSeek V4 Flash/g, 'OpenRouter (Auto)');
fs.writeFileSync('components/StudentDashboard.tsx', sd);

console.log("Replaced Deepseek with OpenRouter");
