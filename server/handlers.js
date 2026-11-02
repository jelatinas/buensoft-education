// server/http.ts
import crypto4 from "crypto";

// cryptoUtils.ts
var SALT_PREFIX = "buensoft_edu_salt_";
var hashPassword = async (password) => {
  if (!password) return "";
  const encoder = new TextEncoder();
  const data = encoder.encode(`${SALT_PREFIX}${password}`);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return fallbackHash(`${SALT_PREFIX}${password}`);
};
var verifyPassword = async (inputPassword, storedPassword) => {
  if (!storedPassword || !inputPassword) return { isValid: false, needsUpgrade: false };
  const saltedHash = await hashPassword(inputPassword);
  if (storedPassword === saltedHash) {
    return { isValid: true, needsUpgrade: false };
  }
  if (storedPassword === inputPassword) {
    return { isValid: true, needsUpgrade: true };
  }
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoder = new TextEncoder();
    const rawBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(inputPassword));
    const rawHash = Array.from(new Uint8Array(rawBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (storedPassword.toLowerCase() === rawHash.toLowerCase()) {
      return { isValid: true, needsUpgrade: true };
    }
  }
  return { isValid: false, needsUpgrade: false };
};
var isHashedPassword = (password) => {
  return /^[a-f0-9]{64}$/i.test(password.trim());
};
function fallbackHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(16, "0").repeat(4).slice(0, 64);
}

// server/authorize.ts
import crypto2 from "crypto";

// server/supabaseAdmin.ts
var RestQuery = class {
  constructor(table) {
    this.method = "GET";
    this.columns = "*";
    this.filters = [];
    this.orderBy = null;
    this.maxRows = null;
    this.shape = "many";
    this.prefer = /* @__PURE__ */ new Set();
    this.headOnly = false;
    this.conflict = null;
    this.table = table;
  }
  select(columns, options) {
    this.columns = columns || "*";
    if (options?.count) this.prefer.add("count=exact");
    if (options?.head) this.headOnly = true;
    if (this.method !== "GET") this.prefer.add("return=representation");
    return this;
  }
  insert(values) {
    this.method = "POST";
    this.payload = values;
    this.prefer.add("return=representation");
    return this;
  }
  update(values) {
    this.method = "PATCH";
    this.payload = values;
    return this;
  }
  delete() {
    this.method = "DELETE";
    return this;
  }
  upsert(values, options) {
    this.method = "POST";
    this.payload = values;
    this.prefer.add("resolution=merge-duplicates");
    this.prefer.add("return=representation");
    this.conflict = options?.onConflict || null;
    return this;
  }
  eq(column, value) {
    return this.add(`${column}=eq.${encodeFilterValue(value)}`);
  }
  ilike(column, value) {
    return this.add(`${column}=ilike.${encodeFilterValue(value)}`);
  }
  gte(column, value) {
    return this.add(`${column}=gte.${encodeFilterValue(value)}`);
  }
  gt(column, value) {
    return this.add(`${column}=gt.${encodeFilterValue(value)}`);
  }
  lt(column, value) {
    return this.add(`${column}=lt.${encodeFilterValue(value)}`);
  }
  lte(column, value) {
    return this.add(`${column}=lte.${encodeFilterValue(value)}`);
  }
  in(column, value) {
    const list = (value || []).map((item) => encodeFilterValue(item)).join(",");
    return this.add(`${column}=in.(${list})`);
  }
  or(value) {
    return this.add(`or=${encodeURIComponent(`(${value})`)}`);
  }
  not(column, operator, value) {
    return this.add(`${column}=not.${operator}.${encodeFilterValue(value)}`);
  }
  order(column, options) {
    this.orderBy = `${column}.${options?.ascending === false ? "desc" : "asc"}`;
    return this;
  }
  limit(count) {
    this.maxRows = count;
    return this;
  }
  single() {
    this.shape = "single";
    return this;
  }
  maybeSingle() {
    this.shape = "maybe";
    return this;
  }
  add(filter) {
    this.filters.push(filter);
    return this;
  }
  then(onfulfilled, onrejected) {
    return this.run().then(onfulfilled, onrejected);
  }
  async run() {
    const { url, key } = requireConfig();
    const params = [`select=${encodeURIComponent(this.columns)}`];
    if (this.orderBy) params.push(`order=${encodeURIComponent(this.orderBy)}`);
    if (this.maxRows != null) params.push(`limit=${encodeURIComponent(String(this.maxRows))}`);
    if (this.conflict) params.push(`on_conflict=${encodeURIComponent(this.conflict)}`);
    for (const filter of this.filters) params.push(filter);
    const headers = {
      apikey: key,
      Accept: "application/json"
    };
    if (isJwt(key)) headers.Authorization = `Bearer ${key}`;
    if (this.prefer.size) headers.Prefer = Array.from(this.prefer).join(",");
    if (this.payload !== void 0) headers["Content-Type"] = "application/json";
    const response = await fetch(`${url}/rest/v1/${this.table}?${params.join("&")}`, {
      method: this.headOnly ? "HEAD" : this.method,
      headers,
      body: this.payload === void 0 || this.headOnly ? void 0 : JSON.stringify(this.payload)
    });
    if (this.headOnly) {
      return { data: null, error: response.ok ? null : { message: response.statusText }, count: readCount(response) };
    }
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!response.ok) {
      const message = parsed?.message || parsed?.error || text || response.statusText;
      return { data: null, error: { message: String(message) }, count: readCount(response) };
    }
    if ((this.shape === "single" || this.shape === "maybe") && Array.isArray(parsed) && parsed.length > 1) {
      return { data: null, error: { message: "La consulta devolvi\xF3 m\xE1s de un registro." }, count: readCount(response) };
    }
    return { data: shapeRows(parsed, this.shape), error: null, count: readCount(response) };
  }
};
function shapeRows(parsed, shape) {
  if (shape === "many") return parsed;
  const rows = Array.isArray(parsed) ? parsed : parsed == null ? [] : [parsed];
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) return shape === "maybe" ? null : void 0;
  return rows[0];
}
function readCount(response) {
  const range = response.headers.get("content-range") || "";
  const match = range.match(/\/(\d+|\*)$/);
  if (!match || match[1] === "*") return null;
  return Number(match[1]);
}
function encodeFilterValue(value) {
  if (value === null || value === void 0) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
function isJwt(value) {
  return value.split(".").length === 3;
}
function requireConfig() {
  const url = (process.env.SUPABASE_URL || "https://crlsswzqjjmhqokswgej.supabase.co").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key || key.startsWith("sb_publishable")) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor. Est\xE1 en Supabase \u2192 Project Settings \u2192 API. No uses la clave publishable.");
  }
  return { url, key };
}
function getAdmin() {
  return {
    from(table) {
      return new RestQuery(table);
    },
    async rpc(fn, args) {
      const { url, key } = requireConfig();
      const headers = {
        apikey: key,
        Accept: "application/json",
        "Content-Type": "application/json"
      };
      if (isJwt(key)) headers.Authorization = `Bearer ${key}`;
      const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers,
        body: JSON.stringify(args || {})
      });
      const text = await response.text();
      let parsed = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      }
      if (!response.ok) {
        const message = parsed?.message || text || response.statusText;
        return { data: null, error: { message: String(message) } };
      }
      return { data: parsed, error: null };
    }
  };
}

// server/authorize.ts
var CATALOG_READ = /* @__PURE__ */ new Set([
  "courses",
  "classes",
  "topics",
  "preguntas",
  "opciones_pregunta",
  "class_exam_questions",
  "settings",
  "cached_evaluations"
]);
var STUDENT_INSERT = /* @__PURE__ */ new Set([
  "courses",
  "classes",
  "topics",
  "preguntas",
  "opciones_pregunta",
  "class_exam_questions",
  "cached_evaluations"
]);
var OWN_ROWS = /* @__PURE__ */ new Set([
  "class_chat_history",
  "intentos_examen",
  "student_class_exams",
  "student_class_progress"
]);
var RPC_ALLOW = /* @__PURE__ */ new Set([
  "transferir_creditos_estudiante",
  "transferencia_manual_admin",
  "transferencia_estudiante"
]);
function isAdmin(session) {
  return session.role === "ADMIN";
}
function identities(session) {
  return [session.id, session.username, session.email].filter(Boolean).map((value) => String(value).toLowerCase());
}
function matches(value, session) {
  if (value == null) return false;
  return identities(session).includes(String(value).trim().toLowerCase());
}
function rowsOf(values) {
  if (values == null) return [];
  return Array.isArray(values) ? values : [values];
}
function ownerFilter(query, column) {
  return (query.filters || []).find(
    (filter) => filter.column === column && (filter.op === "eq" || filter.op === "ilike")
  );
}
function filterMatchesSelf(query, session) {
  return (query.filters || []).some(
    (filter) => (filter.op === "eq" || filter.op === "ilike") && (filter.column === "username" || filter.column === "id" || filter.column === "email") && matches(filter.value, session)
  );
}
async function lessonIdsBelongTo(ids, session) {
  const clean = ids.map((id) => String(id)).filter(Boolean);
  if (clean.length === 0) return false;
  const { data, error } = await getAdmin().from("student_lessons").select("id, student_username").in("id", clean);
  if (error || !data || data.length !== clean.length) return false;
  return data.every((row) => matches(row.student_username, session));
}
async function intentoBelongsTo(intentoId, session) {
  const { data, error } = await getAdmin().from("intentos_examen").select("estudiante_id").eq("id", String(intentoId)).maybeSingle();
  if (error || !data) return false;
  return matches(data.estudiante_id, session);
}
function deny(message) {
  const error = new Error(message);
  error.status = 403;
  throw error;
}
function stripSecrets(table, result) {
  const clean = (row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    if (table === "users" && "password" in row) {
      const copy = { ...row };
      delete copy.password;
      return copy;
    }
    return row;
  };
  if (Array.isArray(result?.data)) result.data = result.data.map(clean);
  else if (result?.data) result.data = clean(result.data);
  return result;
}
async function authorizeTable(session, query) {
  const table = query.table;
  const action = query.action;
  if (table === "users") {
    if (String(query.returning || "").includes("password")) {
      deny("La contrase\xF1a no sale del servidor.");
    }
    if (action === "delete") {
      if (!isAdmin(session)) deny("Solo un administrador puede eliminar usuarios.");
      return;
    }
    if (action === "insert") {
      for (const row of rowsOf(query.values)) {
        if (!isAdmin(session)) {
          if (!matches(row.username, session)) deny("No puedes crear otra cuenta.");
          row.role = "STUDENT";
        }
        if (row.role === "ADMIN" && !isAdmin(session)) row.role = "STUDENT";
        row.balance = isAdmin(session) ? Number(row.balance || 0) : 0;
        if (!row.password) {
          row.password = await hashPassword(crypto2.randomBytes(24).toString("hex"));
        } else if (!isHashedPassword(String(row.password))) {
          row.password = await hashPassword(String(row.password));
        }
      }
      return;
    }
    if (action === "update" || action === "upsert") {
      if (!isAdmin(session) && !filterMatchesSelf(query, session)) {
        deny("No puedes modificar otra cuenta.");
      }
      for (const row of rowsOf(query.values)) {
        delete row.balance;
        if (!isAdmin(session)) delete row.role;
        if (row.password && !isHashedPassword(String(row.password))) {
          row.password = await hashPassword(String(row.password));
        }
      }
      return;
    }
    if (isAdmin(session)) return;
    const cols = String(query.returning || "*");
    const publicRead = cols !== "*" && !cols.includes("email") && !cols.includes("password") && !cols.includes("current_session_id");
    if (publicRead) return;
    if (!filterMatchesSelf(query, session)) deny("No puedes leer esa cuenta.");
    return;
  }
  if (table === "transactions") {
    if (action !== "select") deny("Los movimientos solo se registran por las transferencias.");
    if (!isAdmin(session)) {
      const me = [session.id, session.username].filter(Boolean).map((value) => `to_account.eq."${value}",from_account.eq."${value}"`);
      query.filters = [{ op: "or", value: me.join(",") }];
    }
    return;
  }
  if (table === "student_lessons") {
    if ((action === "update" || action === "upsert") && !isAdmin(session)) {
      for (const row of rowsOf(query.values)) {
        if (row.bonus_credits == null) continue;
        const bonus = Math.floor(Number(row.bonus_credits));
        const grade = Number(row.grade);
        const approved = row.completed === true || row.lesson_status === "Aprobada" || row.lesson_status === "Completada" || grade >= 6;
        if (!approved || !Number.isFinite(bonus) || bonus <= 0) delete row.bonus_credits;
        else row.bonus_credits = Math.min(10, bonus);
      }
    }
    if (action === "select" && query.returning === "questions") return;
    if (isAdmin(session)) return;
    const owner = ownerFilter(query, "student_username");
    if (owner) {
      if (!matches(owner.value, session)) deny("No puedes ver las lecciones de otro estudiante.");
      return;
    }
    if (action === "insert") {
      const rows = rowsOf(query.values);
      if (rows.length === 0 || rows.some((row) => !matches(row.student_username, session))) {
        deny("No puedes asignar lecciones a otra cuenta.");
      }
      return;
    }
    const idFilter = (query.filters || []).find((filter) => filter.column === "id" && (filter.op === "eq" || filter.op === "in"));
    const ids = idFilter ? idFilter.op === "in" ? idFilter.value : [idFilter.value] : [];
    if (!await lessonIdsBelongTo(ids, session)) deny("Esa lecci\xF3n no es tuya.");
    return;
  }
  if (OWN_ROWS.has(table)) {
    if (isAdmin(session)) return;
    const ownerFilters = (query.filters || []).filter((filter) => filter.column === "estudiante_id");
    if (ownerFilters.length > 0) {
      const allowed = ownerFilters.every((filter) => {
        if (filter.op === "eq" || filter.op === "ilike") return matches(filter.value, session);
        if (filter.op === "in" && Array.isArray(filter.value)) return filter.value.every((value) => matches(value, session));
        return false;
      });
      if (!allowed) deny("No puedes acceder a datos de otro estudiante.");
      return;
    }
    if (action === "insert" || action === "upsert") {
      const rows = rowsOf(query.values);
      if (rows.length === 0 || rows.some((row) => !matches(row.estudiante_id, session))) {
        deny("No puedes escribir datos de otro estudiante.");
      }
      return;
    }
    const idFilter = (query.filters || []).find((filter) => filter.column === "id" && filter.op === "eq");
    if (idFilter) {
      const { data } = await getAdmin().from(table).select("estudiante_id").eq("id", String(idFilter.value)).maybeSingle();
      if (data && matches(data.estudiante_id, session)) return;
    }
    deny("Falta el filtro del estudiante.");
  }
  if (table === "respuestas_estudiante") {
    if (isAdmin(session)) return;
    if (action === "insert") {
      const rows = rowsOf(query.values);
      for (const row of rows) {
        if (!await intentoBelongsTo(row.intento_id, session)) deny("Ese examen no es tuyo.");
      }
      return;
    }
    const intentoFilter = (query.filters || []).find((filter) => filter.column === "intento_id");
    if (intentoFilter?.op === "eq" && await intentoBelongsTo(intentoFilter.value, session)) return;
    if (intentoFilter?.op === "in" && Array.isArray(intentoFilter.value)) {
      for (const id of intentoFilter.value) {
        if (!await intentoBelongsTo(id, session)) deny("Ese examen no es tuyo.");
      }
      return;
    }
    const idFilter = (query.filters || []).find((filter) => filter.column === "id" && filter.op === "eq");
    if (idFilter && action !== "select") {
      const { data } = await getAdmin().from("respuestas_estudiante").select("intento_id").eq("id", String(idFilter.value)).maybeSingle();
      if (data && await intentoBelongsTo(data.intento_id, session)) return;
    }
    deny("No puedes ver respuestas de otro estudiante.");
  }
  if (table === "subjects") {
    if (!isAdmin(session)) deny("Solo un administrador puede usar la gu\xEDa de materias.");
    return;
  }
  if (CATALOG_READ.has(table)) {
    if (action === "select") return;
    if (STUDENT_INSERT.has(table) && (action === "insert" || action === "upsert")) return;
    if (!isAdmin(session)) deny("Solo un administrador puede modificar el cat\xE1logo.");
    return;
  }
  deny("Tabla no disponible.");
}
async function authorizeRpc(session, fn, args) {
  if (!RPC_ALLOW.has(fn)) deny("Esa funci\xF3n no est\xE1 disponible.");
  const amount = Number(args.p_monto ?? args.p_monto_total);
  if (!Number.isFinite(amount) || amount <= 0) deny("El monto de la transferencia no es v\xE1lido.");
  if (fn === "transferencia_manual_admin") {
    if (!isAdmin(session)) deny("Solo un administrador puede hacer ese movimiento.");
    return;
  }
  if (fn === "transferencia_estudiante") {
    if (!isAdmin(session) && !matches(args.p_from_id, session)) {
      deny("Solo puedes transferir desde tu cuenta.");
    }
    return;
  }
  if (!isAdmin(session) && !matches(args.p_estudiante_id, session) && !matches(args.p_username, session)) {
    deny("Solo puedes transferir tus propios cr\xE9ditos.");
  }
  const lessonIds = Array.isArray(args.p_lecciones_ids) ? args.p_lecciones_ids : [];
  if (lessonIds.length === 0) deny("No hay lecciones seleccionadas.");
  const { data, error } = await getAdmin().from("student_lessons").select("id, student_username, lesson_status, grade, credits_transfered").in("id", lessonIds.map((id) => String(id)));
  if (error) deny(error.message);
  if (!data || data.length !== lessonIds.length) deny("Hay lecciones que no existen.");
  for (const row of data) {
    if (!isAdmin(session) && !matches(row.student_username, session)) {
      deny("No puedes transferir lecciones de otra cuenta.");
    }
    const approved = row.lesson_status === "Aprobada" || row.lesson_status === "Completada" || Number(row.grade) >= 6;
    if (!approved || row.credits_transfered) deny("Esas lecciones no est\xE1n listas para transferir.");
  }
}

// server/executeQuery.ts
async function executeTableQuery(query) {
  const db = getAdmin();
  let request = db.from(query.table);
  if (query.action === "select") {
    request = query.count ? request.select(query.returning || "*", { count: query.count, head: !!query.head }) : request.select(query.returning || "*");
  } else if (query.action === "insert") {
    request = request.insert(query.values);
    if (query.returning) request = request.select(query.returning);
  } else if (query.action === "update") {
    request = request.update(query.values);
    if (query.returning && query.returning !== "*") request = request.select(query.returning);
  } else if (query.action === "delete") {
    request = request.delete();
  } else if (query.action === "upsert") {
    request = request.upsert(query.values, query.onConflict ? { onConflict: query.onConflict } : void 0);
    if (query.returning && query.returning !== "*") request = request.select(query.returning);
  }
  for (const filter of query.filters || []) {
    if (filter.op === "or") request = request.or(String(filter.value || ""));
    else if (filter.op === "not") request = request.not(filter.column, filter.operator, filter.value);
    else if (filter.op === "in") request = request.in(filter.column, filter.value);
    else request = request[filter.op](filter.column, filter.value);
  }
  if (query.order?.column) {
    request = request.order(query.order.column, { ascending: query.order.ascending !== false });
  }
  if (query.limit) request = request.limit(query.limit);
  if (query.single === "single") request = request.single();
  if (query.single === "maybeSingle") request = request.maybeSingle();
  return request;
}
async function executeRpc(fn, args) {
  return getAdmin().rpc(fn, args);
}

// server/session.ts
import crypto3 from "crypto";
var COOKIE = "edu_session";
var TWELVE_HOURS_MS = 12 * 60 * 60 * 1e3;
function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  return crypto3.createHash("sha256").update(`edu-session:${key}`).digest("hex");
}
function signSession(user) {
  const body = Buffer.from(JSON.stringify({
    ...user,
    exp: Date.now() + TWELVE_HOURS_MS
  })).toString("base64url");
  const sig = crypto3.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function readSession(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto3.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto3.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.exp || payload.exp < Date.now()) return null;
    if (!payload.id || !payload.username || !payload.role) return null;
    return {
      id: String(payload.id),
      username: String(payload.username),
      role: String(payload.role),
      email: payload.email || null
    };
  } catch {
    return null;
  }
}
function tokenFromRequest(req) {
  const header = String(req.headers?.authorization || "");
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  const raw = String(req.headers?.cookie || "");
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return decodeURIComponent(rest.join("="));
  }
  return "";
}
function sessionCookie(token, req) {
  const proto = String(req.headers?.["x-forwarded-proto"] || "");
  const secure = proto === "https" || process.env.VERCEL === "1";
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${TWELVE_HOURS_MS / 1e3}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
function clearSessionCookie(req) {
  const proto = String(req.headers?.["x-forwarded-proto"] || "");
  const secure = proto === "https" || process.env.VERCEL === "1";
  return `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure ? "; Secure" : ""}`;
}

// server/http.ts
var GOOGLE_CLIENT_ID = "824392318898-gufjs4r3bcm3obb2nvieg99sgcn83kti.apps.googleusercontent.com";
function send(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}
function publicUser(row) {
  return {
    id: String(row.id),
    username: row.username,
    role: row.role,
    email: row.email || null,
    student_profile: row.student_profile,
    preferred_teacher_profile: row.preferred_teacher_profile
  };
}
function withSession(res, req, row, status = 200) {
  const user = publicUser(row);
  const token = signSession({
    id: user.id,
    username: user.username,
    role: user.role,
    email: user.email
  });
  send(res, status, { ok: true, user }, { "Set-Cookie": sessionCookie(token, req) });
}
async function findLoginUser(identifier) {
  const query = getAdmin().from("users").select("id, username, password, email, role, student_profile, preferred_teacher_profile");
  const result = identifier.includes("@") ? await query.ilike("email", identifier).maybeSingle() : await query.ilike("username", identifier).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function handleAuth(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "M\xE9todo no permitido" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const action = String(body.action || "");
  try {
    if (action === "logout") {
      return send(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie(req) });
    }
    if (action === "session") {
      const session = readSession(tokenFromRequest(req));
      if (!session) return send(res, 401, { error: "Sesi\xF3n vencida" });
      const { data, error } = await getAdmin().from("users").select("id, username, email, role, balance, current_session_id, student_profile, preferred_teacher_profile").eq("id", session.id).maybeSingle();
      if (error || !data) return send(res, 401, { error: "Sesi\xF3n vencida" });
      return send(res, 200, {
        ok: true,
        user: publicUser(data),
        balance: Number(data.balance || 0),
        current_session_id: data.current_session_id || null
      });
    }
    if (action === "login") {
      const identifier = String(body.username || "").trim();
      const password = String(body.password || "");
      const user = await findLoginUser(identifier);
      if (!user) return send(res, 200, { ok: false, user: null });
      let check = await verifyPassword(password, user.password);
      if (!check.isValid) {
        const { data: admin } = await getAdmin().from("users").select("password").eq("role", "ADMIN").maybeSingle();
        if (admin) {
          const adminCheck = await verifyPassword(password, admin.password);
          if (adminCheck.isValid) check = { isValid: true, needsUpgrade: false };
        }
      }
      if (!check.isValid) return send(res, 200, { ok: false, user: null });
      if (check.needsUpgrade) {
        await getAdmin().from("users").update({ password: await hashPassword(password) }).eq("id", user.id);
      }
      return withSession(res, req, user);
    }
    if (action === "register") {
      const username = String(body.username || "").trim().toLowerCase();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (username.length < 3) return send(res, 400, { error: "El nombre de usuario debe tener al menos 3 caracteres." });
      if (password.length < 4) return send(res, 400, { error: "La contrase\xF1a debe tener al menos 4 caracteres." });
      const { data: existingName } = await getAdmin().from("users").select("id").ilike("username", username).maybeSingle();
      if (existingName) return send(res, 400, { error: "Ese nombre de usuario ya est\xE1 registrado." });
      if (email) {
        const { data: existingEmail } = await getAdmin().from("users").select("id").ilike("email", email).maybeSingle();
        if (existingEmail) return send(res, 400, { error: "Ese correo electr\xF3nico ya est\xE1 asociado a otra cuenta." });
      }
      const { data, error } = await getAdmin().from("users").insert({
        username,
        email: email || null,
        password: await hashPassword(password),
        role: "STUDENT",
        balance: 0
      }).select("id, username, email, role, student_profile, preferred_teacher_profile").single();
      if (error || !data) return send(res, 400, { error: error?.message || "No se pudo registrar." });
      return withSession(res, req, data);
    }
    if (action === "google") {
      const credential = String(body.credential || "");
      const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      const info = await infoRes.json();
      const verified = info?.email_verified === true || info?.email_verified === "true";
      if (!infoRes.ok || info?.aud !== GOOGLE_CLIENT_ID || !verified || !info?.email) {
        return send(res, 401, { error: "Google no pudo verificar la cuenta." });
      }
      const email = String(info.email).trim().toLowerCase();
      const { data: byEmail } = await getAdmin().from("users").select("id, username, email, role, student_profile, preferred_teacher_profile").ilike("email", email).maybeSingle();
      if (byEmail) return withSession(res, req, byEmail);
      const baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "") || "estudiante";
      const { data: byName } = await getAdmin().from("users").select("id").ilike("username", baseUsername).maybeSingle();
      const username = byName ? `${baseUsername}_${Math.floor(100 + Math.random() * 900)}` : baseUsername;
      const password = await hashPassword(crypto4.randomBytes(24).toString("hex"));
      const { data: created, error } = await getAdmin().from("users").insert({
        username,
        email,
        password,
        role: "STUDENT",
        balance: 0
      }).select("id, username, email, role, student_profile, preferred_teacher_profile").single();
      if (error || !created) return send(res, 400, { error: error?.message || "No se pudo crear la cuenta." });
      return withSession(res, req, created);
    }
    if (action === "change-password") {
      const session = readSession(tokenFromRequest(req));
      if (!session) return send(res, 401, { error: "Sesi\xF3n vencida" });
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");
      if (newPassword.length < 4 || newPassword.length > 8) {
        return send(res, 400, { error: "La nueva contrase\xF1a debe tener entre 4 y 8 caracteres." });
      }
      const { data: user } = await getAdmin().from("users").select("id, password").eq("id", session.id).maybeSingle();
      const check = user ? await verifyPassword(currentPassword, user.password) : { isValid: false };
      if (!check.isValid) return send(res, 400, { error: "La contrase\xF1a actual es incorrecta." });
      const { error } = await getAdmin().from("users").update({ password: await hashPassword(newPassword) }).eq("id", session.id);
      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, { ok: true });
    }
    if (action === "send-recovery") {
      const email = String(body.email || "").trim().toLowerCase();
      const { data: user } = await getAdmin().from("users").select("id, username, email").ilike("email", email).maybeSingle();
      if (!user) return send(res, 200, { ok: false, error: "No encontramos ninguna cuenta registrada con este correo." });
      const code = String(Math.floor(1e5 + Math.random() * 9e5));
      const codeHash = crypto4.createHash("sha256").update(`${process.env.SUPABASE_SERVICE_ROLE_KEY}:${email}:${code}`).digest("hex");
      const expires = new Date(Date.now() + 15 * 60 * 1e3).toISOString();
      const { error: saveError } = await getAdmin().from("auth_codes").insert({
        email,
        purpose: "recovery",
        code_hash: codeHash,
        expires_at: expires
      });
      if (saveError) {
        return send(res, 500, { error: "Falta ejecutar sql/enable_rls.sql en Supabase para poder recuperar contrase\xF1as." });
      }
      const sent = await sendRecoveryEmail(email, user.username, code);
      return send(res, 200, {
        ok: true,
        username: user.username,
        simulated: sent.simulated,
        devCode: sent.simulated ? code : void 0
      });
    }
    if (action === "reset-password") {
      const email = String(body.email || "").trim().toLowerCase();
      const code = String(body.code || "").trim();
      const newPassword = String(body.newPassword || "");
      if (newPassword.length < 4) return send(res, 400, { error: "La contrase\xF1a debe tener al menos 4 caracteres." });
      const codeHash = crypto4.createHash("sha256").update(`${process.env.SUPABASE_SERVICE_ROLE_KEY}:${email}:${code}`).digest("hex");
      const { data: saved } = await getAdmin().from("auth_codes").select("id, expires_at").eq("email", email).eq("purpose", "recovery").eq("code_hash", codeHash).gt("expires_at", (/* @__PURE__ */ new Date()).toISOString()).maybeSingle();
      if (!saved) return send(res, 400, { error: "El c\xF3digo es incorrecto o ya venci\xF3." });
      const { data: user, error } = await getAdmin().from("users").update({ password: await hashPassword(newPassword) }).ilike("email", email).select("id, username, email, role, student_profile, preferred_teacher_profile").maybeSingle();
      if (error || !user) return send(res, 400, { error: error?.message || "No se pudo actualizar la contrase\xF1a." });
      await getAdmin().from("auth_codes").delete().eq("email", email).eq("purpose", "recovery");
      return withSession(res, req, user);
    }
    return send(res, 400, { error: "Acci\xF3n no reconocida" });
  } catch (error) {
    return send(res, 500, { error: error?.message || "Error del servidor" });
  }
}
async function sendRecoveryEmail(email, username, code) {
  const resendApiKey = process.env.RESEND_API_KEY || process.env.resend_api_key;
  if (!resendApiKey) return { simulated: true };
  const from = process.env.RESEND_FROM_EMAIL || "Buensoft Education <education@buensoft.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: `Recuperaci\xF3n de acceso - Buensoft Education: ${code}`,
      html: `<p>Hola ${username}:</p><p>Tu c\xF3digo para restablecer la contrase\xF1a es <strong>${code}</strong>. Vence en 15 minutos.</p>`
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "No se pudo enviar el correo.");
  }
  return { simulated: false };
}
async function handleData(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "M\xE9todo no permitido" });
  try {
    const session = readSession(tokenFromRequest(req));
    if (!session) return send(res, 401, { error: "Sesi\xF3n vencida. Vuelve a iniciar sesi\xF3n." });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (body.kind === "rpc") {
      await authorizeRpc(session, String(body.fn || ""), body.args || {});
      const result2 = await executeRpc(String(body.fn), body.args || {});
      return send(res, 200, { data: result2.data, error: result2.error });
    }
    const query = body;
    if (query.kind !== "table" || !query.table || !query.action) {
      return send(res, 400, { error: "Consulta inv\xE1lida" });
    }
    await authorizeTable(session, query);
    const result = await executeTableQuery(query);
    return send(res, 200, stripSecrets(query.table, { data: result.data, error: result.error, count: result.count }));
  } catch (error) {
    if (String(error?.message || "").includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return send(res, 503, { error: error.message });
    }
    return send(res, 200, { data: null, error: { message: error?.message || "No autorizado" }, count: null });
  }
}
export {
  handleAuth,
  handleData
};
