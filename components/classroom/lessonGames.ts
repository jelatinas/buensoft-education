export type FlashMCQ = { question: string; options: string[]; correct: string };

type TopicBits = { titulo?: string; contenido?: string };

export type LessonGame = {
  id: string;
  topicTitle: string;
  topicNumber: number;
} & (
  | { kind: 'flash'; question: string; options: string[]; correct: string; seconds: number }
  | { kind: 'order'; words: string[] }
  | { kind: 'blank'; before: string; after: string; answer: string; options: string[] }
  | { kind: 'pick'; options: string[]; correct: string }
);

const STOP = new Set([
  'para', 'como', 'donde', 'cuando', 'porque', 'esta', 'este', 'estos', 'estas',
  'sobre', 'entre', 'desde', 'hasta', 'tiene', 'tienen', 'puede', 'pueden',
  'hacer', 'cada', 'todo', 'toda', 'todos', 'todas', 'muy', 'mas', 'pero',
  'tambien', 'solo', 'una', 'uno', 'unos', 'unas', 'del', 'las', 'los', 'que',
  'con', 'por', 'sus', 'son', 'ser', 'hay', 'fue', 'era', 'les', 'nos', 'the',
]);

const EXTRA = ['proceso', 'ejemplo', 'sistema', 'cambio', 'causa', 'efecto', 'parte', 'forma'];

export function isAdminNote(text?: string): boolean {
  const raw = (text || '').trim();
  if (!raw) return false;
  const n = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(pendiente|editalo|editarlo|en bd|por definir|lorem|fixme)\b/.test(n)) return true;
  if (n.length < 50 && /\b(contenido|borrador|nota interna)\b/.test(n)) return true;
  return false;
}

export function studentFacingText(text?: string): string {
  const raw = (text || '').trim();
  return isAdminNote(raw) ? '' : raw;
}

export function sameText(a: string, b: string) {
  const n = (s: string) => s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return n(a) === n(b);
}

function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function unique(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function plain(word: string) {
  return word.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function sentenceWords(text: string): string[] {
  const sentence = (text || '').replace(/\s+/g, ' ').trim().split(/[.!?\n]/)[0] || '';
  return sentence
    .split(/\s+/)
    .map(w => w.replace(/^[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+|[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/g, ''))
    .filter(w => w.length > 1 || /^(y|o|e|a)$/i.test(w))
    .slice(0, 16);
}

function orderWindow(words: string[]): string[] | null {
  if (words.length < 3) return null;
  const size = Math.min(6, words.length);
  if (words.length <= 6) return words;
  for (let i = 0; i <= words.length - size; i++) {
    const slice = words.slice(i, i + size);
    const start = plain(slice[0]);
    const end = plain(slice[slice.length - 1]);
    if (!STOP.has(start) && !STOP.has(end)) return slice;
  }
  return words.slice(0, size);
}

function makeBlank(words: string[]) {
  const candidates = words
    .map((w, i) => ({ w, i, p: plain(w) }))
    .filter(x => x.p.length >= 5 && !STOP.has(x.p));
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.p.length - a.p.length);
  const pick = candidates[0];
  const distractors = words.filter((_, i) => i !== pick.i && plain(words[i]) !== plain(pick.w) && plain(words[i]).length >= 4);
  let options = unique([pick.w, ...distractors, ...EXTRA]).slice(0, 4);
  if (!options.some(o => sameText(o, pick.w))) options = unique([pick.w, ...options]).slice(0, 4);
  if (options.length < 3) return null;
  return {
    before: words.slice(0, pick.i).join(' '),
    after: words.slice(pick.i + 1).join(' '),
    answer: pick.w,
    options: shuffle(options),
  };
}

function makeFlash(mcq?: FlashMCQ | null) {
  if (!mcq?.question || !Array.isArray(mcq.options) || !mcq.correct) return null;
  let options = unique(mcq.options.map(o => String(o).trim()).filter(Boolean)).slice(0, 4);
  if (!options.some(o => sameText(o, mcq.correct))) options = unique([mcq.correct.trim(), ...options]).slice(0, 4);
  if (options.length < 2) return null;
  return {
    question: mcq.question.trim(),
    options: shuffle(options),
    correct: mcq.correct.trim(),
    seconds: 12,
  };
}

function makePick(correct: string, titles: string[]) {
  const options = shuffle(unique([correct, ...titles.filter(t => t && !sameText(t, correct))])).slice(0, 4);
  if (options.length < 2) return null;
  return { options, correct };
}

export function buildLessonGame(
  topic: TopicBits | undefined,
  topicIndex: number,
  mcq: FlashMCQ | null | undefined,
  siblingTitles: string[]
): LessonGame {
  const topicTitle = topic?.titulo?.trim() || 'Este tema';
  const topicNumber = Math.max(1, topicIndex + 1);
  const id = `${topicNumber}-${Date.now()}`;
  const playWords = sentenceWords(studentFacingText(topic?.contenido));
  const flash = makeFlash(mcq);
  const blank = playWords.length >= 3 ? makeBlank(playWords) : null;
  const order = orderWindow(playWords);
  const pick = makePick(topicTitle, siblingTitles);
  const slot = ((topicIndex % 3) + 3) % 3;
  const base = { id, topicTitle, topicNumber };

  if (slot === 0 && flash) return { ...base, kind: 'flash', ...flash };
  if (slot === 1 && order) return { ...base, kind: 'order', words: order };
  if (slot === 2 && blank) return { ...base, kind: 'blank', ...blank };
  if (blank) return { ...base, kind: 'blank', ...blank };
  if (order) return { ...base, kind: 'order', words: order };
  if (flash) return { ...base, kind: 'flash', ...flash };
  if (pick) return { ...base, kind: 'pick', ...pick };
  return { ...base, kind: 'pick', options: [topicTitle, 'Otro tema'], correct: topicTitle };
}

export function extractLessonCards(text: string): { idea?: string; example?: string; rest: string } {
  const idea = text.match(/\[IDEA\]([\s\S]*?)\[\/IDEA\]/i)?.[1]?.trim();
  const example = text.match(/\[EJEMPLO\]([\s\S]*?)\[\/EJEMPLO\]/i)?.[1]?.trim();
  const rest = text
    .replace(/\[IDEA\][\s\S]*?\[\/IDEA\]/gi, '')
    .replace(/\[EJEMPLO\][\s\S]*?\[\/EJEMPLO\]/gi, '')
    .replace(/\[\/?(IDEA|EJEMPLO)\]/gi, '')
    .trim();
  return { idea, example, rest };
}
