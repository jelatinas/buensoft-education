const fs = require('fs');
let c = fs.readFileSync('geminiService2.ts', 'utf8');

const originalFunc = `const callGeminiApi = async (action: string, contents: any[], config: any) => {
  if (isLocal) {
    const ai = getAIInstance();
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents,
      config
    });
    return response;
  } else {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload: { contents, config } })
    });
    if (!res.ok) {
       const errorData = await res.json().catch(() => ({}));
       throw new Error(errorData.error || \`API Error: \${res.statusText}\`);
    }
    return await res.json();
  }
};`;

const newFunc = `const callGeminiApi = async (action: string, contents: any[], config: any) => {
  const provider = getAiProvider();
  
  if (isLocal) {
    if (provider === 'gemini') {
      const ai = getAIInstance();
      return await ai.models.generateContent({ model: 'gemini-3.5-flash-lite', contents, config });
    } else {
      const isDeepseek = provider === 'deepseek';
      let apiKey = isDeepseek ? (import.meta as any).env?.VITE_DEEPSEEK_API_KEY : (import.meta as any).env?.VITE_CEREBRAS_API_KEY;
      if (!apiKey) apiKey = isDeepseek ? process.env.DEEPSEEK_API_KEY : process.env.CEREBRAS_API_KEY;
      if (!apiKey) throw new Error(\`\${provider.toUpperCase()}_API_KEY no configurada localmente.\`);
      
      const endpoint = isDeepseek ? 'https://api.deepseek.com/v1/chat/completions' : 'https://api.cerebras.ai/v1/chat/completions';
      const model = isDeepseek ? 'deepseek-chat' : 'llama3.1-8b';
      
      const messages: any[] = [];
      if (config?.systemInstruction) messages.push({ role: 'system', content: config.systemInstruction });
      
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
      
      if (!aiRes.ok) throw new Error(\`API Error \${aiRes.status}: \${await aiRes.text()}\`);
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

c = c.replace(originalFunc, newFunc);
fs.writeFileSync('geminiService2.ts', c);
