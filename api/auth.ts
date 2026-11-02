import { handleAuth } from '../server/http.ts';

export default async function handler(req: any, res: any) {
  try {
    return await handleAuth(req, res);
  } catch (error: any) {
    const body = JSON.stringify({ error: error?.message || 'Error del servidor' });
    if (typeof res?.status === 'function') return res.status(500).json(JSON.parse(body));
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(body);
  }
}
