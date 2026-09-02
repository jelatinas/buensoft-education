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
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: payload.contents,
        config: payload.config
      });
      return res.status(200).json({ text: response.text });
      
    } else if (provider === 'openrouter' || provider === 'cerebras') {
      const isOpenrouter = provider === 'openrouter';
      const apiKey = isOpenrouter ? process.env.OPENROUTER_API_KEY : process.env.CEREBRAS_API_KEY;
      if (!apiKey) return res.status(500).json({ error: `${provider.toUpperCase()}_API_KEY is not configured.` });
      
      const endpoint = isOpenrouter ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.cerebras.ai/v1/chat/completions';
      const model = isOpenrouter ? 'google/gemini-2.5-flash-lite' : 'llama-3.3-70b';
      
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
      
      const body: any = {
        model,
        messages,
        temperature: payload.config?.temperature ?? 0.7,
      };
      
      if (payload.config?.maxOutputTokens) {
         body.max_tokens = payload.config.maxOutputTokens;
      }

      const aiRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://buensoft.com',
          'X-Title': 'Buensoft Education'
        },
        body: JSON.stringify(body)
      });
      
      if (!aiRes.ok) {
        const errText = await aiRes.text();
        throw new Error(`API Error ${aiRes.status}: ${errText}`);
      }
      
      const data = await aiRes.json();
      const text = data.choices?.[0]?.message?.content || '';
      return res.status(200).json({ text });
    }
    
    return res.status(400).json({ error: 'Unknown provider' });
    
  } catch (error: any) {
    console.error("Vercel API Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
