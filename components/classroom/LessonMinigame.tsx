import React, { useEffect, useState } from 'react';
import { LessonGame, orderIsCorrect, sameText } from './lessonGames';

type WordChip = { id: string; text: string };

type LessonMinigameProps = {
  game: LessonGame;
  multiplier?: number;
  onFinish: (points: number, won: boolean) => void;
};

function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function chipsOf(words: string[]): WordChip[] {
  return words.map((text, index) => ({ id: `${index}:${text}`, text }));
}

const LessonMinigame: React.FC<LessonMinigameProps> = ({ game, multiplier = 1, onFinish }) => {
  const [pool, setPool] = useState<WordChip[]>(() => game.kind === 'order' ? shuffle(chipsOf(game.words)) : []);
  const [chosen, setChosen] = useState<WordChip[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [shake, setShake] = useState(false);
  const [left, setLeft] = useState(game.kind === 'flash' ? game.seconds : 0);
  const [phase, setPhase] = useState<'play' | 'ok' | 'no'>('play');
  const [points, setPoints] = useState(0);

  useEffect(() => {
    if (game.kind !== 'flash' || phase !== 'play') return;
    if (left <= 0) {
      setPoints(10);
      setPhase('no');
      return;
    }
    const id = setTimeout(() => setLeft(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [game.kind, left, phase]);

  const finish = (earned: number, won: boolean) => {
    const total = won ? earned * multiplier : earned;
    setPoints(total);
    setPhase(won ? 'ok' : 'no');
  };

  const title = game.kind === 'flash'
    ? 'Relámpago'
    : game.kind === 'order'
      ? 'Arma la frase'
      : game.kind === 'blank'
        ? 'Palabra escondida'
        : 'Reconoce el tema';

  const hint = game.kind === 'flash'
    ? 'Responde antes de que se acabe el tiempo.'
    : game.kind === 'order'
      ? 'Toca las palabras en el orden correcto.'
      : game.kind === 'blank'
        ? 'Elige la palabra que falta.'
        : '¿Cuál tema acabas de terminar?';

  const takeChip = (chip: WordChip, fromPool: boolean) => {
    if (fromPool) {
      setPool(prev => prev.filter(item => item.id !== chip.id));
      setChosen(prev => prev.some(item => item.id === chip.id) ? prev : [...prev, chip]);
      return;
    }
    setChosen(prev => prev.filter(item => item.id !== chip.id));
    setPool(prev => prev.some(item => item.id === chip.id) ? prev : [...prev, chip]);
  };

  const checkOrder = () => {
    if (game.kind !== 'order') return;
    const ok = orderIsCorrect(chosen.map(chip => chip.text), game.words);
    if (ok) {
      finish(Math.max(30, 100 - mistakes * 25), true);
      return;
    }
    const next = mistakes + 1;
    setMistakes(next);
    setShake(true);
    setTimeout(() => setShake(false), 450);
    if (next >= 3) finish(15, false);
  };

  const chooseWord = (option: string, correct: string) => {
    if (phase !== 'play') return;
    const ok = sameText(option, correct);
    if (game.kind === 'flash') finish(ok ? Math.max(30, left * 10) : 10, ok);
    else finish(ok ? 80 : 15, ok);
  };

  return (
    <div className="game-in w-full max-w-lg bg-white text-indigo-950 rounded-[2rem] shadow-2xl p-6 border-4 border-amber-300">
      <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Tema {game.topicNumber} desbloqueado</p>
      <h3 className="text-2xl font-black mt-1">{title}</h3>
      <p className="text-sm font-bold text-indigo-400 mt-1">{game.topicTitle}</p>
      <p className="text-sm font-medium mt-3 mb-4">{hint}{multiplier > 1 ? ` Acierto x${multiplier}.` : ''}</p>

      {phase === 'play' && game.kind === 'flash' && (
        <div className="mb-4">
          <div className="flex justify-between text-[10px] font-black uppercase mb-1">
            <span className="text-indigo-400">Tiempo</span>
            <span className={left <= 3 ? 'text-red-600 animate-pulse' : 'text-indigo-400'}>{left}s</span>
          </div>
          <div className="h-2 rounded-full bg-indigo-100 overflow-hidden">
            <div className={`h-full ${left <= 3 ? 'bg-red-500' : 'bg-amber-400'}`} style={{ width: `${(left / game.seconds) * 100}%` }} />
          </div>
          <p className="font-black text-lg mt-4">{game.question}</p>
          <div className="grid gap-2 mt-3">
            {game.options.map(opt => (
              <button key={opt} type="button" onClick={() => chooseWord(opt, game.correct)} className="text-left px-4 py-3 rounded-2xl border-2 border-indigo-100 font-bold hover:border-indigo-500">
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'play' && game.kind === 'order' && (
        <div>
          <div className={`grid gap-2 ${shake ? 'mcq-no' : ''}`} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(4.5rem, 1fr))' }}>
            {game.words.map((_, index) => {
              const chip = chosen[index];
              return (
                <button
                  key={chip?.id || `slot-${index}`}
                  type="button"
                  disabled={!chip}
                  onClick={() => chip && takeChip(chip, false)}
                  className={`min-h-[3.5rem] rounded-xl border-2 px-1 py-2 text-xs font-black leading-tight ${chip ? 'bg-indigo-600 text-white border-indigo-600' : 'border-dashed border-indigo-200 text-indigo-300 bg-indigo-50'}`}
                >
                  <span className="block text-[10px] opacity-70">{index + 1}</span>
                  {chip ? <span key={chip.id} className="slot-pop block">{chip.text}</span> : '·'}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {pool.map(chip => (
              <button
                key={chip.id}
                type="button"
                onClick={() => takeChip(chip, true)}
                className="px-3 py-1.5 rounded-full bg-white border-2 border-indigo-200 text-sm font-bold hover:border-indigo-500"
              >
                {chip.text}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={checkOrder}
            disabled={chosen.length !== game.words.length}
            className="mt-4 w-full bg-indigo-600 disabled:bg-indigo-300 text-white font-black py-3 rounded-2xl"
          >
            Comprobar
          </button>
        </div>
      )}

      {phase === 'play' && game.kind === 'blank' && (
        <div>
          <p className="text-lg font-black leading-snug bg-indigo-50 rounded-2xl px-4 py-4">
            {game.before} <span className="text-amber-600">______</span> {game.after}
          </p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {game.options.map(opt => (
              <button key={opt} type="button" onClick={() => chooseWord(opt, game.answer)} className="px-3 py-3 rounded-2xl border-2 border-indigo-100 font-bold hover:border-indigo-500">
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'play' && game.kind === 'pick' && (
        <div className="grid gap-2">
          {game.options.map(opt => (
            <button key={opt} type="button" onClick={() => chooseWord(opt, game.correct)} className="text-left px-4 py-3 rounded-2xl border-2 border-indigo-100 font-bold hover:border-indigo-500">
              {opt}
            </button>
          ))}
        </div>
      )}

      {phase !== 'play' && (
        <div className="mt-2">
          <p className={`text-xl font-black ${phase === 'ok' ? 'text-green-600' : 'text-amber-600'}`}>
            {phase === 'ok' ? `+${points} puntos` : `Casi. +${points} puntos`}
          </p>
          {game.kind === 'order' && phase === 'no' && (
            <p className="mt-2 text-sm font-bold text-indigo-700">{game.words.join(' ')}</p>
          )}
          {game.kind === 'blank' && phase === 'no' && (
            <p className="mt-2 text-sm font-bold text-indigo-700">La palabra era: {game.answer}</p>
          )}
          {game.kind === 'flash' && (
            <p className="mt-2 text-sm font-bold text-indigo-700">Respuesta: {game.correct}</p>
          )}
          {game.kind === 'pick' && phase === 'no' && (
            <p className="mt-2 text-sm font-bold text-indigo-700">Era: {game.correct}</p>
          )}
          <button
            type="button"
            onClick={() => onFinish(points, phase === 'ok')}
            className="mt-5 w-full bg-indigo-600 text-white font-black py-3 rounded-2xl"
          >
            Seguir la clase
          </button>
        </div>
      )}
    </div>
  );
};

export default LessonMinigame;
