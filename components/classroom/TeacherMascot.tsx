export type MascotMood = 'idle' | 'write' | 'think' | 'happy' | 'oops' | 'party';

const mouth: Record<MascotMood, string> = {
  idle: 'M22 42 Q32 48 42 42',
  write: 'M22 42 Q32 47 42 42',
  think: 'M24 43 Q32 46 40 42',
  happy: 'M20 40 Q32 52 44 40',
  oops: 'M22 46 Q32 40 42 46',
  party: 'M18 38 Q32 54 46 38',
};

export default function TeacherMascot({ mood }: { mood: MascotMood }) {
  const happyEyes = mood === 'happy' || mood === 'party';
  return (
    <div
      className={`relative w-11 h-11 shrink-0 ${mood === 'party' ? 'animate-bounce' : ''}`}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow">
        <ellipse cx="32" cy="58" rx="14" ry="3" fill="rgba(0,0,0,0.15)" />
        <path d="M18 22 L32 12 L46 22 L42 22 L42 18 L22 18 Z" fill="#312e81" />
        <circle cx="32" cy="34" r="18" fill="#fde68a" />
        {happyEyes ? (
          <>
            <path d="M22 32 Q26 28 30 32" fill="none" stroke="#1e1b4b" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M34 32 Q38 28 42 32" fill="none" stroke="#1e1b4b" strokeWidth="2.4" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="26" cy={mood === 'think' ? 30 : 32} r="2.3" fill="#1e1b4b" />
            <circle cx="38" cy="32" r="2.3" fill="#1e1b4b" />
          </>
        )}
        {mood === 'oops' && <path d="M24 26 L28 28" stroke="#1e1b4b" strokeWidth="1.6" strokeLinecap="round" />}
        <path d={mouth[mood]} fill="none" stroke="#1e1b4b" strokeWidth="2.2" strokeLinecap="round" />
        {mood === 'write' && <circle cx="48" cy="46" r="4" fill="#fff" stroke="#4338ca" strokeWidth="1.5" />}
      </svg>
    </div>
  );
}
