const fs = require('fs');
let c = fs.readFileSync('geminiService2.ts', 'utf8');

const getAiProviderCode = `
export const getAiProvider = () => typeof window !== 'undefined' ? (localStorage.getItem('selected_ai_provider') || 'gemini') : 'gemini';
export const setAiProvider = (provider: string) => typeof window !== 'undefined' && localStorage.setItem('selected_ai_provider', provider);
`;

// Insert after imports
c = c.replace(/import \{ getCachedEvaluation, saveEvaluationToCache \} from "\.\/storage2";/, 
`import { getCachedEvaluation, saveEvaluationToCache } from "./storage2";\n${getAiProviderCode}`);

// Modify callGeminiApi to pass provider and handle local fetch for all providers
const newCallGeminiApi = `const callGeminiApi = async (action: string, contents: any[], config: any) => {
  const provider = getAiProvider();
  
  if (isLocal) {
    if (provider === 'gemini') {
      const ai = getAIInstance();
      return await ai.models.generateContent({ model: 'gemini-3.6-flash', contents, config });
    } else {
      // Local fallback for Deepseek/Cerebras (using the same fetch as the Vercel API)
      const isDeepseek = provider === 'deepseek';
      let apiKey = isDeepseek ? (import.meta as any).env?.VITE_DEEPSEEK_API_KEY : (import.meta as any).env?.VITE_CEREBRAS_API_KEY;
      
      // Fallback to process.env if VITE is not populated
      if (!apiKey) apiKey = isDeepseek ? process.env.DEEPSEEK_API_KEY : process.env.CEREBRAS_API_KEY;
      
      if (!apiKey) throw new Error(\`\${provider.toUpperCase()}_API_KEY no configurada localmente.\`);
      
      const endpoint = isDeepseek ? 'https://api.deepseek.com/v1/chat/completions' : 'https://api.cerebras.ai/v1/chat/completions';
      const model = isDeepseek ? 'deepseek-chat' : 'llama3.1-8b';
      
      const messages: any[] = [];
      if (config?.systemInstruction) {
        messages.push({ role: 'system', content: config.systemInstruction });
      }
      
      for (const item of (contents || [])) {
        let textContent = '';
        if (item.parts && Array.isArray(item.parts)) {
          textContent = item.parts.map((p: any) => p.text || '').join('');
        }
        const role = item.role === 'model' ? 'assistant' : 'user';
        if (textContent) messages.push({ role, content: textContent });
      }
      
      let temp = config?.temperature ?? 0.7;
      if (config?.responseMimeType === 'application/json') {
          messages.push({ role: 'system', content: 'You must respond ONLY with valid JSON matching the requested schema.'});
          if (isDeepseek) temp = 0.1; 
      }
      
      const aiRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${apiKey}\`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: temp,
          response_format: config?.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined
        })
      });
      
      if (!aiRes.ok) throw new Error(\`API Error \${aiRes.status}\`);
      const data = await aiRes.json();
      return { text: data.choices?.[0]?.message?.content || '' };
    }
  } else {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload: { provider, contents, config } })
    });
    if (!res.ok) {
       const errorData = await res.json().catch(() => ({}));
       throw new Error(errorData.error || \`API Error: \${res.statusText}\`);
    }
    return await res.json();
  }
};`;

c = c.replace(/const callGeminiApi = async \([\s\S]*?return await res\.json\(\);\s*\n\};/, newCallGeminiApi);

// Modify streamFn to use callGeminiApi internally if not gemini, simulating streaming
const newStreamFn = `
  const streamFn = async () => {
    let fullText = '';
    const contents = [{ role: 'user', parts: [{ text: prompt }] }];
    const provider = getAiProvider();
    
    if (isLocal && provider === 'gemini') {
      const ai = getAIInstance();
      const result = await ai.models.generateContentStream({
        model: 'gemini-3.5-flash-lite',
        contents,
        config: { systemInstruction }
      });
      for await (const chunk of result) {
        const chunkText = chunk.text || '';
        fullText += chunkText;
        if (onChunk && chunkText) onChunk(fullText);
      }
    } else {
      const response = await callGeminiApi('generateTeacherResponse', contents, { systemInstruction });
      fullText = response.text || '';
      // Simulate streaming for production proxy or non-gemini local
      for (let i = 0; i < fullText.length; i += 6) {
        if (onChunk) onChunk(fullText.substring(0, i));
        await new Promise(r => setTimeout(r, 10)); // fast typing simulation
      }
      if (onChunk) onChunk(fullText);
    }
    return fullText;
  };
`;

c = c.replace(/const streamFn = async \(\) => \{[\s\S]*?return fullText;\s*\n\s*\};/, newStreamFn);

fs.writeFileSync('geminiService2.ts', c);
