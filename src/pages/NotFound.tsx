import { useLocation, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Home, RotateCcw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const messages = [
  { title: 'Hors des limites du terrain !', sub: "L'arbitre lève le drapeau — cette page est hors-jeu." },
  { title: 'Tir au-dessus de la barre !', sub: "Vous avez visé trop haut. Cette URL n'existe pas." },
  { title: 'Le ballon est sorti en touche.', sub: "Cette page a quitté le terrain. Remettez-la en jeu." },
  { title: 'Carton rouge pour cette URL !', sub: "Expulsée du match. Cette page ne reviendra pas." },
  { title: "VAR en cours d'examen…", sub: "Après révision, cette page n'a jamais existé." },
];

export default function NotFound() {
  const location = useLocation();
  const { t } = useTranslation();
  const [msg] = useState(() => messages[Math.floor(Math.random() * messages.length)]);
  const [ballPos, setBallPos] = useState({ x: 50, y: 50 });

  useEffect(() => {
    console.error('404: route not found —', location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const id = setInterval(() => {
      setBallPos({ x: 30 + Math.random() * 40, y: 30 + Math.random() * 40 });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center overflow-hidden relative px-6">
      <style>{`
        @keyframes ball-bounce {
          0%,100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-18px) rotate(180deg); }
        }
        @keyframes float-404 {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes grass-scroll {
          from { background-position: 0 0; }
          to   { background-position: 60px 60px; }
        }
        .ball-anim { animation: ball-bounce 1.8s ease-in-out infinite; }
        .float-anim { animation: float-404 3s ease-in-out infinite; }
        .fade-up-1 { animation: fade-up .5s ease both; }
        .fade-up-2 { animation: fade-up .5s .15s ease both; }
        .fade-up-3 { animation: fade-up .5s .3s ease both; }
        .fade-up-4 { animation: fade-up .5s .45s ease both; }
      `}</style>

      {/* Football pitch grid background */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Drifting ball shadow */}
      <div
        className="absolute w-96 h-96 rounded-full bg-primary/5 blur-3xl pointer-events-none ease-in-out"
        style={{ left: `${ballPos.x}%`, top: `${ballPos.y}%`, transform: 'translate(-50%,-50%)', transition: 'left 2000ms ease-in-out, top 2000ms ease-in-out' }}
      />

      <div className="relative z-10 text-center max-w-lg space-y-8">

        {/* Big 404 */}
        <div className="float-anim fade-up-1 select-none">
          <div className="relative inline-block">
            <span className="text-[10rem] md:text-[14rem] font-black leading-none tabular-nums"
              style={{ background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 60%, hsl(var(--primary)/0.4) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              404
            </span>
            {/* Ball emoji on top of 4 */}
            <span className="absolute -top-4 right-4 text-5xl ball-anim">⚽</span>
          </div>
        </div>

        {/* Message */}
        <div className="space-y-3 fade-up-2">
          <h1 className="text-2xl md:text-3xl font-black">{msg.title}</h1>
          <p className="text-base text-muted-foreground leading-7">{msg.sub}</p>
        </div>

        {/* URL pill */}
        <div className="fade-up-3">
          <code className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted border border-border text-sm text-muted-foreground font-mono max-w-full truncate">
            <span className="text-destructive font-bold">✗</span>
            {location.pathname}
          </code>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 fade-up-4">
          <Link to="/players">
            <Button size="lg" className="font-bold gap-2 w-full sm:w-auto">
              <Home className="w-4 h-4" />
              {t('not_found.back')}
            </Button>
          </Link>
          <Button variant="outline" size="lg" className="gap-2 w-full sm:w-auto" onClick={() => history.back()}>
            <ArrowLeft className="w-4 h-4" />
            Page précédente
          </Button>
        </div>

        {/* Footer hint */}
        <p className="text-xs text-muted-foreground/50 fade-up-4">
          Scouty · Si le problème persiste, <Link to="/my-tickets" className="underline hover:text-primary">signalez-le</Link>
        </p>
      </div>
    </div>
  );
}
