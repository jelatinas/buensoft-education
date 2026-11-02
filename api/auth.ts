import { handleAuth } from '../server/http.ts';

export default function handler(req: any, res: any) {
  return handleAuth(req, res);
}
