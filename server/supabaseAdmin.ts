type Row = Record<string, unknown>;

class RestQuery implements PromiseLike<{ data: any; error: { message: string } | null; count: number | null }> {
  private table: string;
  private method = 'GET';
  private payload: unknown;
  private columns = '*';
  private filters: string[] = [];
  private orderBy: string | null = null;
  private maxRows: number | null = null;
  private shape: 'many' | 'single' | 'maybe' = 'many';
  private prefer = new Set<string>();
  private headOnly = false;
  private conflict: string | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns?: string, options?: { count?: 'exact'; head?: boolean }) {
    this.columns = columns || '*';
    if (options?.count) this.prefer.add('count=exact');
    if (options?.head) this.headOnly = true;
    if (this.method !== 'GET') this.prefer.add('return=representation');
    return this;
  }

  insert(values: unknown) {
    this.method = 'POST';
    this.payload = values;
    this.prefer.add('return=representation');
    return this;
  }

  update(values: unknown) {
    this.method = 'PATCH';
    this.payload = values;
    return this;
  }

  delete() {
    this.method = 'DELETE';
    return this;
  }

  upsert(values: unknown, options?: { onConflict?: string }) {
    this.method = 'POST';
    this.payload = values;
    this.prefer.add('resolution=merge-duplicates');
    this.prefer.add('return=representation');
    this.conflict = options?.onConflict || null;
    return this;
  }

  eq(column: string, value: unknown) { return this.add(`${column}=eq.${encodeFilterValue(value)}`); }
  ilike(column: string, value: unknown) { return this.add(`${column}=ilike.${encodeFilterValue(value)}`); }
  gte(column: string, value: unknown) { return this.add(`${column}=gte.${encodeFilterValue(value)}`); }
  gt(column: string, value: unknown) { return this.add(`${column}=gt.${encodeFilterValue(value)}`); }
  lt(column: string, value: unknown) { return this.add(`${column}=lt.${encodeFilterValue(value)}`); }
  lte(column: string, value: unknown) { return this.add(`${column}=lte.${encodeFilterValue(value)}`); }
  in(column: string, value: unknown[]) {
    const list = (value || []).map((item) => encodeFilterValue(item)).join(',');
    return this.add(`${column}=in.(${list})`);
  }
  or(value: string) { return this.add(`or=${encodeURIComponent(`(${value})`)}`); }
  not(column: string, operator: string, value: unknown) {
    return this.add(`${column}=not.${operator}.${encodeFilterValue(value)}`);
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = `${column}.${options?.ascending === false ? 'desc' : 'asc'}`;
    return this;
  }
  limit(count: number) { this.maxRows = count; return this; }
  single() { this.shape = 'single'; return this; }
  maybeSingle() { this.shape = 'maybe'; return this; }

  private add(filter: string) {
    this.filters.push(filter);
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: { message: string } | null; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run() {
    const { url, key } = requireConfig();
    const params = [`select=${encodeURIComponent(this.columns)}`];
    if (this.orderBy) params.push(`order=${encodeURIComponent(this.orderBy)}`);
    if (this.maxRows != null) params.push(`limit=${encodeURIComponent(String(this.maxRows))}`);
    if (this.conflict) params.push(`on_conflict=${encodeURIComponent(this.conflict)}`);
    for (const filter of this.filters) params.push(filter);

    const headers: Record<string, string> = {
      apikey: key,
      Accept: 'application/json',
    };
    if (isJwt(key)) headers.Authorization = `Bearer ${key}`;
    if (this.prefer.size) headers.Prefer = Array.from(this.prefer).join(',');
    if (this.payload !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${url}/rest/v1/${this.table}?${params.join('&')}`, {
      method: this.headOnly ? 'HEAD' : this.method,
      headers,
      body: this.payload === undefined || this.headOnly ? undefined : JSON.stringify(this.payload),
    });

    if (this.headOnly) {
      return { data: null, error: response.ok ? null : { message: response.statusText }, count: readCount(response) };
    }

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }
    if (!response.ok) {
      const message = (parsed as any)?.message || (parsed as any)?.error || text || response.statusText;
      return { data: null, error: { message: String(message) }, count: readCount(response) };
    }
    if ((this.shape === 'single' || this.shape === 'maybe') && Array.isArray(parsed) && parsed.length > 1) {
      return { data: null, error: { message: 'La consulta devolvió más de un registro.' }, count: readCount(response) };
    }
    return { data: shapeRows(parsed, this.shape), error: null, count: readCount(response) };
  }
}

function shapeRows(parsed: unknown, shape: 'many' | 'single' | 'maybe') {
  if (shape === 'many') return parsed;
  const rows = Array.isArray(parsed) ? parsed : parsed == null ? [] : [parsed];
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) return shape === 'maybe' ? null : undefined;
  return rows[0];
}

function readCount(response: Response) {
  const range = response.headers.get('content-range') || '';
  const match = range.match(/\/(\d+|\*)$/);
  if (!match || match[1] === '*') return null;
  return Number(match[1]);
}

function encodeFilterValue(value: unknown) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = String(value);
  if (text !== '' && /^[A-Za-z0-9_-]+$/.test(text)) return text;
  const reserved = /[,"():]/.test(text);
  const literal = reserved ? `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : text;
  return encodeURIComponent(literal).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function isJwt(value: string) {
  return value.split('.').length === 3;
}

function requireConfig() {
  const url = (process.env.SUPABASE_URL || 'https://crlsswzqjjmhqokswgej.supabase.co').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!key || key.startsWith('sb_publishable')) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el servidor. Está en Supabase → Project Settings → API. No uses la clave publishable.');
  }
  return { url, key };
}

export function getAdmin() {
  return {
    from(table: string) {
      return new RestQuery(table);
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      const { url, key } = requireConfig();
      const headers: Record<string, string> = {
        apikey: key,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      if (isJwt(key)) headers.Authorization = `Bearer ${key}`;
      const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(args || {}),
      });
      const text = await response.text();
      let parsed: unknown = null;
      if (text) {
        try { parsed = JSON.parse(text); } catch { parsed = text; }
      }
      if (!response.ok) {
        const message = (parsed as any)?.message || text || response.statusText;
        return { data: null, error: { message: String(message) } };
      }
      return { data: parsed, error: null };
    },
  };
}

export type { Row };
