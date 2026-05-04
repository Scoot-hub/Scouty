import { Component, type ErrorInfo, type ReactNode, useState } from 'react';
import { Home, RotateCcw, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Random football-themed error messages ──────────────────────────────────

const errorMessages = [
  { title: 'VAR signale une erreur technique !', sub: 'Après révision, le bug est bien réel. Désolé pour l\'interruption du match.' },
  { title: 'Carton rouge pour ce composant !', sub: 'Un joueur (ou un module) a commis une faute grave. Il a été expulsé.' },
  { title: 'Le gardien a lâché le ballon.', sub: 'Notre défense technique a été mise en défaut. On revient vite.' },
  { title: 'Penalty accordé contre nous.', sub: 'Faute dans la surface. L\'application va tenter de sauver le coup.' },
  { title: 'Panne de générateur au stade.', sub: 'Les lumières se sont éteintes au mauvais moment. On rallume ça.' },
];

// ── Fallback UI (function component — can use hooks) ──────────────────────

function FallbackUI({ error, resetError }: { error: Error | null; resetError: () => void }) {
  const [showDetails, setShowDetails] = useState(false);
  const [msg] = useState(() => errorMessages[Math.floor(Math.random() * errorMessages.length)]);

  const errorName = error?.name ?? 'UnknownError';
  const errorMsg = error?.message ?? 'Une erreur inconnue est survenue.';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center overflow-hidden relative px-6">
      <style>{`
        @keyframes eb-shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px) rotate(-1deg); }
          40% { transform: translateX(6px) rotate(1deg); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes eb-fade-up {
          from { opacity:0; transform:translateY(20px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes eb-pulse-ring {
          0%   { box-shadow: 0 0 0 0 hsl(var(--destructive)/.35); }
          70%  { box-shadow: 0 0 0 18px hsl(var(--destructive)/0); }
          100% { box-shadow: 0 0 0 0 hsl(var(--destructive)/0); }
        }
        .eb-shake { animation: eb-shake .6s ease; }
        .eb-fade-1 { animation: eb-fade-up .4s ease both; }
        .eb-fade-2 { animation: eb-fade-up .4s .12s ease both; }
        .eb-fade-3 { animation: eb-fade-up .4s .24s ease both; }
        .eb-fade-4 { animation: eb-fade-up .4s .36s ease both; }
        .eb-pulse { animation: eb-pulse-ring 2s ease-in-out infinite; }
      `}</style>

      {/* Grid bg */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(currentColor 1px,transparent 1px),linear-gradient(90deg,currentColor 1px,transparent 1px)', backgroundSize: '60px 60px' }}
      />
      {/* Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-destructive/5 blur-3xl pointer-events-none" />

      <div className="relative z-10 text-center max-w-lg space-y-8 w-full">

        {/* Icon */}
        <div className="eb-fade-1 flex justify-center">
          <div className="eb-shake eb-pulse w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
        </div>

        {/* Error badge */}
        <div className="eb-fade-2">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold uppercase tracking-widest">
            🟥 {errorName}
          </span>
        </div>

        {/* Message */}
        <div className="space-y-3 eb-fade-3">
          <h1 className="text-2xl md:text-3xl font-black">{msg.title}</h1>
          <p className="text-base text-muted-foreground leading-7">{msg.sub}</p>
          <p className="text-sm text-muted-foreground/70 font-mono bg-muted/50 rounded-lg px-4 py-2 border border-border">
            {errorMsg}
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 eb-fade-4">
          <a href="/players">
            <Button size="lg" className="font-bold gap-2 w-full sm:w-auto">
              <Home className="w-4 h-4" />
              Retour au dashboard
            </Button>
          </a>
          <Button variant="outline" size="lg" className="gap-2 w-full sm:w-auto" onClick={() => { resetError(); window.location.reload(); }}>
            <RotateCcw className="w-4 h-4" />
            Recharger la page
          </Button>
        </div>

        {/* Collapsible details */}
        <div className="eb-fade-4">
          <button
            onClick={() => setShowDetails(v => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showDetails ? 'Masquer les détails' : 'Voir les détails techniques'}
          </button>
          {showDetails && error?.stack && (
            <pre className="mt-3 text-left text-[10px] leading-5 text-muted-foreground bg-muted/60 border border-border rounded-xl p-4 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-words">
              {error.stack}
            </pre>
          )}
        </div>

        <p className="text-xs text-muted-foreground/40 eb-fade-4">
          Scouty · Si l'erreur persiste, <a href="/my-tickets" className="underline hover:text-primary">ouvrez un ticket</a>
        </p>
      </div>
    </div>
  );
}

// ── Class component (required for componentDidCatch) ──────────────────────

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <FallbackUI error={this.state.error} resetError={this.resetError} />;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
