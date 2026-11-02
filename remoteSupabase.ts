type Filter = { op: string; column?: string; value?: any; operator?: string };

type TableQuery = {
  kind: 'table';
  table: string;
  action: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  returning?: string;
  count?: 'exact';
  head?: boolean;
  values?: any;
  onConflict?: string;
  filters: Filter[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  single?: 'single' | 'maybeSingle' | null;
};

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.error || `Error ${response.status}`);
  }
  return payload;
}

export async function authRequest(body: Record<string, unknown>) {
  return postJson('/api/auth', body);
}

function sendQuery(query: TableQuery) {
  return postJson('/api/data', query);
}

class QueryBuilder implements PromiseLike<any> {
  private query: TableQuery;

  constructor(table: string) {
    this.query = { kind: 'table', table, action: 'select', filters: [], returning: '*' };
  }

  select(columns?: string, options?: { count?: 'exact'; head?: boolean }) {
    this.query.returning = columns || '*';
    if (options?.count) this.query.count = options.count;
    if (options?.head) this.query.head = true;
    return this;
  }

  insert(values: any) {
    this.query.action = 'insert';
    this.query.values = values;
    return this;
  }

  update(values: any) {
    this.query.action = 'update';
    this.query.values = values;
    return this;
  }

  delete() {
    this.query.action = 'delete';
    return this;
  }

  upsert(values: any, options?: { onConflict?: string }) {
    this.query.action = 'upsert';
    this.query.values = values;
    this.query.onConflict = options?.onConflict;
    return this;
  }

  eq(column: string, value: any) { this.query.filters.push({ op: 'eq', column, value }); return this; }
  ilike(column: string, value: any) { this.query.filters.push({ op: 'ilike', column, value }); return this; }
  gte(column: string, value: any) { this.query.filters.push({ op: 'gte', column, value }); return this; }
  gt(column: string, value: any) { this.query.filters.push({ op: 'gt', column, value }); return this; }
  lt(column: string, value: any) { this.query.filters.push({ op: 'lt', column, value }); return this; }
  lte(column: string, value: any) { this.query.filters.push({ op: 'lte', column, value }); return this; }
  in(column: string, value: any[]) { this.query.filters.push({ op: 'in', column, value }); return this; }
  or(value: string) { this.query.filters.push({ op: 'or', value }); return this; }
  not(column: string, operator: string, value: any) {
    this.query.filters.push({ op: 'not', column, operator, value });
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.query.order = { column, ascending: options?.ascending };
    return this;
  }
  limit(count: number) { this.query.limit = count; return this; }
  single() { this.query.single = 'single'; return this; }
  maybeSingle() { this.query.single = 'maybeSingle'; return this; }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return sendQuery(this.query).then(onfulfilled, onrejected);
  }
}

export const supabase = {
  from(table: string) {
    return new QueryBuilder(table);
  },
  async rpc(fn: string, args?: Record<string, unknown>) {
    return postJson('/api/data', { kind: 'rpc', fn, args: args || {} });
  },
};
