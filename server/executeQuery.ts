import { getAdmin } from './supabaseAdmin.ts';

export type QueryFilter = {
  op: string;
  column?: string;
  value?: any;
  operator?: string;
};

export type TableQuery = {
  kind: 'table';
  table: string;
  action: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  returning?: string;
  count?: 'exact';
  head?: boolean;
  values?: any;
  onConflict?: string;
  filters: QueryFilter[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  single?: 'single' | 'maybeSingle' | null;
};

export async function executeTableQuery(query: TableQuery) {
  const db = getAdmin();
  let request: any = db.from(query.table);

  if (query.action === 'select') {
    request = query.count
      ? request.select(query.returning || '*', { count: query.count, head: !!query.head })
      : request.select(query.returning || '*');
  } else if (query.action === 'insert') {
    request = request.insert(query.values);
    if (query.returning) request = request.select(query.returning);
  } else if (query.action === 'update') {
    request = request.update(query.values);
    if (query.returning && query.returning !== '*') request = request.select(query.returning);
  } else if (query.action === 'delete') {
    request = request.delete();
  } else if (query.action === 'upsert') {
    request = request.upsert(query.values, query.onConflict ? { onConflict: query.onConflict } : undefined);
    if (query.returning && query.returning !== '*') request = request.select(query.returning);
  }

  for (const filter of query.filters || []) {
    if (filter.op === 'or') request = request.or(String(filter.value || ''));
    else if (filter.op === 'not') request = request.not(filter.column, filter.operator, filter.value);
    else if (filter.op === 'in') request = request.in(filter.column, filter.value);
    else request = request[filter.op](filter.column, filter.value);
  }

  if (query.order?.column) {
    request = request.order(query.order.column, { ascending: query.order.ascending !== false });
  }
  if (query.limit) request = request.limit(query.limit);
  if (query.single === 'single') request = request.single();
  if (query.single === 'maybeSingle') request = request.maybeSingle();

  return request;
}

export async function executeRpc(fn: string, args: Record<string, unknown>) {
  return getAdmin().rpc(fn, args);
}
