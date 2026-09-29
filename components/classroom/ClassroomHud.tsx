import { Star, Zap } from 'lucide-react';
import TeacherMascot, { MascotMood } from './TeacherMascot';

type ClassroomHudProps = {
  completedTopics: number;
  stars: number;
  combo: number;
  score: number;
  mood: MascotMood;
};

export default function ClassroomHud({ completedTopics, stars, combo, score, mood }: ClassroomHudProps) {
  const current = Math.min(completedTopics, 9);
  const topicLabel = completedTopics >= 10 ? '10 temas listos' : `Tema ${completedTopics + 1} de 10`;

  return (
    <div className="bg-indigo-700 text-white px-3 py-2 flex items-center gap-3 shrink-0 border-b border-indigo-500/40">
      <TeacherMascot mood={mood} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-100">{topicLabel}</p>
          <p className="text-[10px] font-black text-amber-200">{score} pts</p>
        </div>
        <div className="flex items-center gap-1">
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
        {combo >= 2 && (
          <span className="inline-flex items-center gap-1 bg-amber-300 text-indigo-950 text-[10px] font-black px-2 py-0.5 rounded-full">
            <Zap size={10} /> Racha {combo}
          </span>
        )}
      </div>
    </div>
  );
}
