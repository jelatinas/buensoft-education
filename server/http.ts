import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../cryptoUtils.ts';
import { authorizeRpc, authorizeTable, stripSecrets } from './authorize.ts';
import { executeRpc, executeTableQuery, type TableQuery } from './executeQuery.ts';
import { clearSessionCookie, readSession, sessionCookie, signSession, tokenFromRequest, type SessionUser } from './session.ts';
import { getAdmin } from './supabaseAdmin.ts';

const GOOGLE_CLIENT_ID = '824392318898-gufjs4r3bcm3obb2nvieg99sgcn83kti.apps.googleusercontent.com';

function send(res: any, status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

function publicUser(row: any): SessionUser & { student_profile?: string; preferred_teacher_profile?: string } {
  return {
    id: String(row.id),
    username: row.username,
    role: row.role,
    email: row.email || null,
    student_profile: row.student_profile,
    preferred_teacher_profile: row.preferred_teacher_profile,
  };
}

function withSession(res: any, req: any, row: any, status = 200) {
  const user = publicUser(row);
  const token = signSession({
    id: user.id,
    username: user.username,
    role: user.role,
    email: user.email,
  });
  send(res, status, { ok: true, user }, { 'Set-Cookie': sessionCookie(token, req) });
}

async function findLoginUser(identifier: string) {
  const query = getAdmin()
    .from('users')
    .select('id, username, password, email, role, student_profile, preferred_teacher_profile');
  const result = identifier.includes('@')
    ? await query.ilike('email', identifier).maybeSingle()
    : await query.ilike('username', identifier).maybeSingle();
  return result.data;
}

export async function handleAuth(req: any, res: any) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const action = String(body.action || '');

  try {
    if (action === 'logout') {
      return send(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie(req) });
    }

    if (action === 'session') {
      const session = readSession(tokenFromRequest(req));
      if (!session) return send(res, 401, { error: 'Sesión vencida' });
      const { data, error } = await getAdmin()
        .from('users')
        .select('id, username, email, role, balance, current_session_id, student_profile, preferred_teacher_profile')
        .eq('id', session.id)
        .maybeSingle();
      if (error || !data) return send(res, 401, { error: 'Sesión vencida' });
      return send(res, 200, {
        ok: true,
        user: publicUser(data),
        balance: Number(data.balance || 0),
        current_session_id: data.current_session_id || null,
      });
    }

    if (action === 'login') {
      const identifier = String(body.username || '').trim();
      const password = String(body.password || '');
      const user = await findLoginUser(identifier);
      if (!user) return send(res, 200, { ok: false, user: null });
      let check = await verifyPassword(password, user.password);
      if (!check.isValid) {
        const { data: admin } = await getAdmin().from('users').select('password').eq('role', 'ADMIN').maybeSingle();
        if (admin) {
          const adminCheck = await verifyPassword(password, admin.password);
          if (adminCheck.isValid) check = { isValid: true, needsUpgrade: false };
        }
      }
      if (!check.isValid) return send(res, 200, { ok: false, user: null });
      if (check.needsUpgrade) {
        await getAdmin().from('users').update({ password: await hashPassword(password) }).eq('id', user.id);
      }
      return withSession(res, req, user);
    }

    if (action === 'register') {
      const username = String(body.username || '').trim().toLowerCase();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (username.length < 3) return send(res, 400, { error: 'El nombre de usuario debe tener al menos 3 caracteres.' });
      if (password.length < 4) return send(res, 400, { error: 'La contraseña debe tener al menos 4 caracteres.' });
      const { data: existingName } = await getAdmin().from('users').select('id').ilike('username', username).maybeSingle();
      if (existingName) return send(res, 400, { error: 'Ese nombre de usuario ya está registrado.' });
      if (email) {
        const { data: existingEmail } = await getAdmin().from('users').select('id').ilike('email', email).maybeSingle();
        if (existingEmail) return send(res, 400, { error: 'Ese correo electrónico ya está asociado a otra cuenta.' });
      }
      const { data, error } = await getAdmin().from('users').insert({
        username,
        email: email || null,
        password: await hashPassword(password),
        role: 'STUDENT',
        balance: 0,
      }).select('id, username, email, role, student_profile, preferred_teacher_profile').single();
      if (error || !data) return send(res, 400, { error: error?.message || 'No se pudo registrar.' });
      return withSession(res, req, data);
    }

    if (action === 'google') {
      const credential = String(body.credential || '');
      const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      const info = await infoRes.json();
      const verified = info?.email_verified === true || info?.email_verified === 'true';
      if (!infoRes.ok || info?.aud !== GOOGLE_CLIENT_ID || !verified || !info?.email) {
        return send(res, 401, { error: 'Google no pudo verificar la cuenta.' });
      }
      const email = String(info.email).trim().toLowerCase();
      const { data: byEmail } = await getAdmin().from('users').select('id, username, email, role, student_profile, preferred_teacher_profile').ilike('email', email).maybeSingle();
      if (byEmail) return withSession(res, req, byEmail);
      const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'estudiante';
      const { data: byName } = await getAdmin().from('users').select('id').ilike('username', baseUsername).maybeSingle();
      const username = byName ? `${baseUsername}_${Math.floor(100 + Math.random() * 900)}` : baseUsername;
      const password = await hashPassword(crypto.randomBytes(24).toString('hex'));
      const { data: created, error } = await getAdmin().from('users').insert({
        username,
        email,
        password,
        role: 'STUDENT',
        balance: 0,
      }).select('id, username, email, role, student_profile, preferred_teacher_profile').single();
      if (error || !created) return send(res, 400, { error: error?.message || 'No se pudo crear la cuenta.' });
      return withSession(res, req, created);
    }

    if (action === 'change-password') {
      const session = readSession(tokenFromRequest(req));
      if (!session) return send(res, 401, { error: 'Sesión vencida' });
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 4 || newPassword.length > 8) {
        return send(res, 400, { error: 'La nueva contraseña debe tener entre 4 y 8 caracteres.' });
      }
      const { data: user } = await getAdmin().from('users').select('id, password').eq('id', session.id).maybeSingle();
      const check = user ? await verifyPassword(currentPassword, user.password) : { isValid: false };
      if (!check.isValid) return send(res, 400, { error: 'La contraseña actual es incorrecta.' });
      const { error } = await getAdmin().from('users').update({ password: await hashPassword(newPassword) }).eq('id', session.id);
      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, { ok: true });
    }

    if (action === 'send-recovery') {
      const email = String(body.email || '').trim().toLowerCase();
      const { data: user } = await getAdmin().from('users').select('id, username, email').ilike('email', email).maybeSingle();
      if (!user) return send(res, 200, { ok: false, error: 'No encontramos ninguna cuenta registrada con este correo.' });
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = crypto.createHash('sha256').update(`${process.env.SUPABASE_SERVICE_ROLE_KEY}:${email}:${code}`).digest('hex');
      const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { error: saveError } = await getAdmin().from('auth_codes').insert({
        email,
        purpose: 'recovery',
        code_hash: codeHash,
        expires_at: expires,
      });
      if (saveError) {
        return send(res, 500, { error: 'Falta ejecutar sql/enable_rls.sql en Supabase para poder recuperar contraseñas.' });
      }
      const sent = await sendRecoveryEmail(email, user.username, code);
      return send(res, 200, {
        ok: true,
        username: user.username,
        simulated: sent.simulated,
        devCode: sent.simulated ? code : undefined,
      });
    }

    if (action === 'reset-password') {
      const email = String(body.email || '').trim().toLowerCase();
      const code = String(body.code || '').trim();
      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 4) return send(res, 400, { error: 'La contraseña debe tener al menos 4 caracteres.' });
      const codeHash = crypto.createHash('sha256').update(`${process.env.SUPABASE_SERVICE_ROLE_KEY}:${email}:${code}`).digest('hex');
      const { data: saved } = await getAdmin()
        .from('auth_codes')
        .select('id, expires_at')
        .eq('email', email)
        .eq('purpose', 'recovery')
        .eq('code_hash', codeHash)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (!saved) return send(res, 400, { error: 'El código es incorrecto o ya venció.' });
      const { data: user, error } = await getAdmin()
        .from('users')
        .update({ password: await hashPassword(newPassword) })
        .ilike('email', email)
        .select('id, username, email, role, student_profile, preferred_teacher_profile')
        .maybeSingle();
      if (error || !user) return send(res, 400, { error: error?.message || 'No se pudo actualizar la contraseña.' });
      await getAdmin().from('auth_codes').delete().eq('email', email).eq('purpose', 'recovery');
      return withSession(res, req, user);
    }

    return send(res, 400, { error: 'Acción no reconocida' });
  } catch (error: any) {
    return send(res, 500, { error: error?.message || 'Error del servidor' });
  }
}

async function sendRecoveryEmail(email: string, username: string, code: string) {
  const resendApiKey = process.env.RESEND_API_KEY || process.env.resend_api_key;
  if (!resendApiKey) return { simulated: true };
  const from = process.env.RESEND_FROM_EMAIL || 'Buensoft Education <education@buensoft.com>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: `Recuperación de acceso - Buensoft Education: ${code}`,
      html: `<p>Hola ${username}:</p><p>Tu código para restablecer la contraseña es <strong>${code}</strong>. Vence en 15 minutos.</p>`,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'No se pudo enviar el correo.');
  }
  return { simulated: false };
}

export async function handleData(req: any, res: any) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });
  try {
    const session = readSession(tokenFromRequest(req));
    if (!session) return send(res, 401, { error: 'Sesión vencida. Vuelve a iniciar sesión.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    if (body.kind === 'rpc') {
      await authorizeRpc(session, String(body.fn || ''), body.args || {});
      const result = await executeRpc(String(body.fn), body.args || {});
      return send(res, 200, { data: result.data, error: result.error });
    }

    const query = body as TableQuery;
    if (query.kind !== 'table' || !query.table || !query.action) {
      return send(res, 400, { error: 'Consulta inválida' });
    }
    await authorizeTable(session, query);
    const result = await executeTableQuery(query);
    return send(res, 200, stripSecrets(query.table, { data: result.data, error: result.error, count: result.count }));
  } catch (error: any) {
    if (String(error?.message || '').includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return send(res, 503, { error: error.message });
    }
    return send(res, 200, { data: null, error: { message: error?.message || 'No autorizado' }, count: null });
  }
}
