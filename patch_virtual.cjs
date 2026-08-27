const fs = require('fs');
let c = fs.readFileSync('components/VirtualClassroom.tsx', 'utf8');

const closeButtonCode = `<button onClick={async () => {
           if (!isAdminAudit) {
              await saveProgress(messages, completedTopics, secondsElapsed);
           }
           onClose();
        }} className="text-white hover:text-indigo-200 p-2 font-black text-xs md:text-sm bg-black/20 rounded-xl px-4 uppercase tracking-widest">✕ CERRAR</button>`;

const newCode = `<div className="flex items-center space-x-4">
            <select 
              value={aiProvider} 
              onChange={handleProviderChange} 
              className="px-2 py-1 bg-white/20 text-white rounded-lg text-[10px] font-black uppercase border border-white/30 outline-none"
            >
              <option value="gemini" className="text-indigo-900">Gemini</option>
              <option value="deepseek" className="text-indigo-900">DeepSeek</option>
              <option value="cerebras" className="text-indigo-900">Cerebras</option>
            </select>
            ${closeButtonCode}
        </div>`;

c = c.replace(closeButtonCode, newCode);
fs.writeFileSync('components/VirtualClassroom.tsx', c);
