const fs = require('fs');
let c = fs.readFileSync('components/StudentDashboard.tsx', 'utf8');

if (!c.includes('getAiProvider')) {
  c = c.replace(/import \{ \n  getStudentData,/, 
\`import { getAiProvider, setAiProvider } from '../geminiService2';
import { 
  getStudentData,\`);
}

// Insert state
if (!c.includes('setLocalAiProvider')) {
  c = c.replace(/const \[showAISettings, setShowAISettings\] = useState\(false\);/, 
\`const [showAISettings, setShowAISettings] = useState(false);
  const [aiProvider, setLocalAiProvider] = useState(getAiProvider());
  
  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProv = e.target.value;
    setLocalAiProvider(newProv);
    setAiProvider(newProv);
  };\`);
}

// Insert UI
const uiToInsert = \`<select 
          value={aiProvider} 
          onChange={handleProviderChange} 
          className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 rounded-xl text-[10px] md:text-xs font-black uppercase border-2 border-indigo-100 dark:border-indigo-800 outline-none mr-2"
        >
          <option value="gemini">Gemini</option>
          <option value="deepseek">DeepSeek V4 Flash</option>
          <option value="cerebras">Llama 3.1 8B</option>
        </select>\`;

c = c.replace(/<button onClick=\{\(\) => setShowAISettings\(true\)\} className="px-4 py-2 rounded-xl/, 
\`\${uiToInsert}
        <button onClick={() => setShowAISettings(true)} className="px-4 py-2 rounded-xl\`);

fs.writeFileSync('components/StudentDashboard.tsx', c);
