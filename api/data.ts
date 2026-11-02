import { handleData } from '../server/http.ts';

export default function handler(req: any, res: any) {
  return handleData(req, res);
}
