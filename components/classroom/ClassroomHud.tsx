import { Star, Zap } from 'lucide-react';
import TeacherMascot, { MascotMood } from './TeacherMascot';
import { CLASS_GOAL, streakMultiplier } from './lessonGames';

type ScoreBurst = { id: number; amount: number };

type ClassroomHudProps = {
  completedTopics: number;
  stars: number;
  combo: number;
  score: number;
  mood: MascotMood;
  winStreak: number;
  scoreBurst: ScoreBurst | null;
};

export default function ClassroomHud({ completedTopics, stars, combo, score, mood, winStreak, scoreBurst }: ClassroomHudProps) {
  const current = Math.min(completedTopics, 9);
  const topicLabel = completedTopics >= 10 ? '10 temas listos' : `Tema ${completedTopics + 1} de 10`;
  const goalPercent = Math.min(100, Math.round((score / CLASS_GOAL) * 100));
  const multiplier = streakMultiplier(winStreak);

  return (
    <div className="bg-indigo-700 text-white px-3 py-2 shrink-0 border-b border-indigo-500/40">
      <div className="flex items-center gap-3">
        <TeacherMascot mood={mood} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-100">{topicLabel}</p>
            <p className="relative text-[10px] font-black text-amber-200">
              {score} / {CLASS_GOAL}
              {scoreBurst && (
                <span key={scoreBurst.id} className="score-fly absolute -top-1 right-0 text-xs text-amber-200">
                  +{scoreBurst.amount}
                </span>
              )}
            </p>
          </div>
          <div className="relative h-7">
            <div className="absolute inset-x-0 top-3 flex items-center gap-1">
              {Array.from({ length: 10 }, (_, i) => {
                const done = i < completedTopics;
                const active = completedTopics < 10 && i === current;
                return (
                  <span
                    key={i}
                    className={`h-2.5 flex-1 rounded-full ${done ? 'bg-amber-300' : active ? 'bg-white animate-pulse' : 'bg-white/25'}`}
                  />
                );
              })}
            </div>
            <div
              className="absolute top-0 transition-all duration-700 ease-out"
              style={{ left: `calc(${(current + 0.5) * 10}% - 9px)` }}
            >
              <span key={completedTopics} className="walker-hop block h-[18px] w-[18px] rounded-full bg-amber-300 border-2 border-white shadow" />
            </div>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-amber-300 transition-all duration-700" style={{ width: `${goalPercent}%` }} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-0.5" title="Aciertos de este tema">
            {[0, 1].map(i => (
              <Star
                key={i < stars ? `on-${i}-${stars}` : `off-${i}`}
                size={16}
                className={i < stars ? 'fill-amber-300 text-amber-300 star-pop' : 'text-white/35'}
              />
            ))}
          </div>
          {winStreak >= 2 && (
            <span key={winStreak} className="star-pop inline-flex items-center gap-1 bg-amber-300 text-indigo-950 text-[10px] font-black px-2 py-0.5 rounded-full">
              <Zap size={10} /> x{multiplier}
            </span>
          )}
          {combo >= 2 && winStreak < 2 && (
            <span className="inline-flex items-center gap-1 bg-white/15 text-[10px] font-black px-2 py-0.5 rounded-full">
              <Zap size={10} /> Racha {combo}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
