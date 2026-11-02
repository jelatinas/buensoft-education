import { createClient } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | null = null;

function isJwt(value: string) {
  return value.split('.').length === 3;
}

/** Las claves sb_secret_ no son JWT. Si van en Authorization, Supabase las rechaza. */
function fetchWithApiKey(key: string) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set('apikey', key);
    const authorization = headers.get('Authorization') || '';
    if (!isJwt(key) && authorization === `Bearer ${key}`) {
      headers.delete('Authorization');
    }
    return fetch(input, { ...init, headers });
  };
}

export function getAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL || 'https://crlsswzqjjmhqokswgej.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!key || key.startsWith('sb_publishable')) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el servidor. Está en Supabase → Project Settings → API. No uses la clave publishable.');
  }
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchWithApiKey(key) },
    });
  }
  return client;
}
