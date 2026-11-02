import crypto from 'crypto';

const COOKIE = 'edu_session';
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  username: string;
  role: string;
  email?: string | null;
};

function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.');
  return crypto.createHash('sha256').update(`edu-session:${key}`).digest('hex');
}

export function signSession(user: SessionUser): string {
  const body = Buffer.from(JSON.stringify({
    ...user,
    exp: Date.now() + TWELVE_HOURS_MS,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function readSession(token: string | undefined | null): SessionUser | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.exp || payload.exp < Date.now()) return null;
    if (!payload.id || !payload.username || !payload.role) return null;
    return {
      id: String(payload.id),
      username: String(payload.username),
      role: String(payload.role),
      email: payload.email || null,
    };
  } catch {
    return null;
  }
}

export function tokenFromRequest(req: any): string {
  const header = String(req.headers?.authorization || '');
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const raw = String(req.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export function sessionCookie(token: string, req: any): string {
  const proto = String(req.headers?.['x-forwarded-proto'] || '');
  const secure = proto === 'https' || process.env.VERCEL === '1';
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${TWELVE_HOURS_MS / 1000}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(req: any): string {
  const proto = String(req.headers?.['x-forwarded-proto'] || '');
  const secure = proto === 'https' || process.env.VERCEL === '1';
  return `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`;
}
