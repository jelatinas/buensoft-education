import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action, payload } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    switch (action) {
      case 'generateTeacherResponse': {
        const response = await ai.models.generateContent({
          model: 'gemini-1.5-flash-latest',
          contents: payload.contents,
          config: payload.config
        });
        return res.status(200).json({ text: response.text });
      }
      
      case 'generateExam':
      case 'generateMCQBatch':
      case 'generateQuestionBank':
      case 'evaluateStudentAnswer':
      case 'validateOpenAnswer': {
        const response = await ai.models.generateContent({
          model: 'gemini-1.5-flash-latest',
          contents: payload.contents,
          config: payload.config
        });
        return res.status(200).json({ text: response.text });
      }
      
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error: any) {
    console.error("Vercel API Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
