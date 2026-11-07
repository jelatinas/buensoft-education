import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action, payload } = req.body;
  const provider = payload.provider || 'gemini';
  
  try {
    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });
      const ai = new GoogleGenAI({ apiKey });
      
      const response = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-3.5-flash-lite',
          contents: payload.contents,
          config: payload.config
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AbortError: Gemini tardó más de 45s')), 45000))
      ]) as any;
      return res.status(200).json({ text: response.text });
      
    } else if (provider === 'openrouter' || provider === 'cerebras') {
      const isOpenrouter = provider === 'openrouter';
      const apiKey = isOpenrouter ? process.env.OPENROUTER_API_KEY : process.env.CEREBRAS_API_KEY;
      if (!apiKey) return res.status(500).json({ error: `${provider.toUpperCase()}_API_KEY is not configured.` });
      
      const endpoint = isOpenrouter ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.cerebras.ai/v1/chat/completions';
      const openRouterFreeModels = [
        'google/gemma-4-26b-a4b-it:free',
        'google/gemma-4-31b-it:free',
        'openrouter/free',
      ];
      const model = isOpenrouter ? openRouterFreeModels[0] : 'llama-3.3-70b';
      
      // Convert Gemini contents to OpenAI messages
      const messages: any[] = [];
      if (payload.config?.systemInstruction) {
        messages.push({ role: 'system', content: payload.config.systemInstruction });
      }
      
      for (const item of (payload.contents || [])) {
        let textContent = '';
        if (item.parts && Array.isArray(item.parts)) {
          textContent = item.parts.map((p: any) => p.text || '').join('');
        }
        // Gemini uses 'model' and 'user'. OpenAI uses 'assistant' and 'user'.
        const role = item.role === 'model' ? 'assistant' : 'user';
        if (textContent) {
          messages.push({ role, content: textContent });
        }
      }
      
      let temperature = payload.config?.temperature ?? 0.7;
      if (payload.config?.responseMimeType === 'application/json') {
        messages.push({ role: 'system', content: 'You must respond ONLY with valid JSON matching the requested schema.' });
        if (isOpenrouter) temperature = 0.1;
      }

      const wantsJson = payload.config?.responseMimeType === 'application/json';
      const requestedTokens = payload.config?.maxOutputTokens || (wantsJson ? 2000 : 1200);
      const attempts = isOpenrouter
        ? [
            { model: openRouterFreeModels[0], reasoning: { effort: 'none' }, maxTokens: requestedTokens },
            { model: openRouterFreeModels[1], reasoning: { effort: 'none' }, maxTokens: requestedTokens },
            { model: openRouterFreeModels[2], reasoning: { effort: 'low' }, maxTokens: Math.max(requestedTokens, 4000) },
          ]
        : [{ model, reasoning: undefined as any, maxTokens: payload.config?.maxOutputTokens }];

      const visibleText = (message: any): string => {
        const content = message?.content;
        if (typeof content === 'string' && content.trim()) return content;
        if (Array.isArray(content)) {
          const joined = content.map((part: any) => (typeof part === 'string' ? part : part?.text || '')).join('');
          if (joined.trim()) return joined;
        }
        return '';
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), action === 'generateTeacherResponse' ? 28000 : 45000);
      let lastError = 'OpenRouter no devolvió texto.';
      try {
        for (const attempt of attempts) {
          const body: any = {
            model: attempt.model,
            messages,
            temperature,
          };
          if (attempt.reasoning) body.reasoning = attempt.reasoning;
          if (wantsJson) body.response_format = { type: 'json_object' };
          if (attempt.maxTokens) body.max_tokens = attempt.maxTokens;

          const aiRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': 'https://buensoft.com',
              'X-Title': 'Buensoft Education'
            },
            body: JSON.stringify(body),
            signal: controller.signal
          });

          if (!aiRes.ok) {
            lastError = `API Error ${aiRes.status}: ${await aiRes.text()}`;
            continue;
          }

          const data = await aiRes.json();
          const text = visibleText(data.choices?.[0]?.message);
          const cutOff = data.choices?.[0]?.finish_reason === 'length' && text.trim().length < 80;
          if (text.trim() && !cutOff) return res.status(200).json({ text });
          lastError = 'El modelo gratuito respondió vacío.';
        }
      } finally {
        clearTimeout(timeoutId);
      }

      throw new Error(lastError);
    }
    
    return res.status(400).json({ error: 'Unknown provider' });
    
  } catch (error: any) {
    console.error("Vercel API Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
