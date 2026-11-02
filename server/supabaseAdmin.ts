import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL || 'https://crlsswzqjjmhqokswgej.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!key || key.startsWith('sb_publishable')) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el servidor. Está en Supabase → Project Settings → API. No uses la clave publishable.');
  }
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
