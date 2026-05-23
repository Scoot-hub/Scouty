import { useEffect, useRef, useState } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'running' | 'done';

export default function TopProgressBar() {
  const fetching = useIsFetching() > 0;
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const setPhaseSync = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    clearTimeout(timerRef.current);

    if (fetching) {
      // Small delay so instant fetches (<200ms) don't flash the bar
      timerRef.current = setTimeout(() => {
        if (phaseRef.current !== 'done') setPhaseSync('running');
      }, 150);
    } else {
      if (phaseRef.current === 'running') {
        setPhaseSync('done');
        timerRef.current = setTimeout(() => setPhaseSync('idle'), 550);
      }
    }

    return () => clearTimeout(timerRef.current);
  }, [fetching]);

  if (phase === 'idle') return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[9999] h-[3px] pointer-events-none overflow-hidden">
      <div
        className={cn(
          'h-full bg-primary',
          phase === 'running' && 'progress-running',
          phase === 'done' && 'progress-done',
        )}
      />
      {/* Glow tip */}
      {phase === 'running' && (
        <div className="absolute top-0 h-full w-20 bg-gradient-to-r from-transparent via-primary/60 to-transparent progress-glow" />
      )}
      <style>{`
        .progress-running {
          width: 85%;
          transition: width 3s cubic-bezier(0.1, 0.05, 0.0, 1.0);
        }
        .progress-done {
          width: 100%;
          opacity: 0;
          transition: width 0.25s ease-in, opacity 0.3s ease-out 0.2s;
        }
        .progress-glow {
          animation: progress-glow-move 1.6s ease-in-out infinite;
        }
        @keyframes progress-glow-move {
          0%   { transform: translateX(-100px); opacity: 0; }
          30%  { opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: translateX(calc(85vw + 100px)); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
