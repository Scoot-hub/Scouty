import { useSearchParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ShieldCheck, Home, ExternalLink, Lock, FileText, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type AttackType = 'sqli' | 'xss' | 'bot' | 'general';

const MESSAGES: Record<AttackType, { emoji: string; title: string; sub: string; detail: string }> = {
  sqli: {
    emoji: '🗄️',
    title: "SELECT * FROM tentatives_malveillantes WHERE succès = TRUE — 0 résultats.",
    sub: "Notre attaquant a intercepté votre injection en plein couloir gauche. La base de données reste inviolée.",
    detail: "Tentative d'injection SQL détectée dans la requête.",
  },
  xss: {
    emoji: '🧱',
    title: "<script>alert('Notre mur défensif tient bon')</script>",
    sub: "Le VAR a passé votre script en revue. Verdict : carton rouge direct, sortie immédiate du terrain.",
    detail: "Tentative d'injection de script cross-site (XSS) détectée.",
  },
  bot: {
    emoji: '🤖',
    title: "Notre gardien a reconnu votre automatisation au premier regard.",
    sub: "Les robots sont les bienvenus sur le banc de touche, pas dans les vestiaires. Cette activité a été enregistrée.",
    detail: "Comportement automatisé anormal détecté.",
  },
  general: {
    emoji: '🛡️',
    title: "Tentative d'intrusion neutralisée. Défense 1 – Attaque 0.",
    sub: "Notre système de sécurité a détecté une requête suspecte et l'a renvoyée aux vestiaires.",
    detail: "Requête potentiellement malveillante bloquée.",
  },
};

const CERTIF_BADGES = [
  {
    label: 'RGPD Conforme',
    sub: 'Règlement UE 2016/679',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-500/8 border-blue-500/20',
    icon: '🇪🇺',
  },
  {
    label: 'ISO 27001',
    sub: 'Sécurité de l\'information',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/8 border-emerald-500/20',
    icon: '✅',
  },
  {
    label: 'HTTPS / TLS 1.3',
    sub: 'Chiffrement de bout en bout',
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-500/8 border-violet-500/20',
    icon: '🔒',
  },
  {
    label: 'OWASP Top 10',
    sub: 'Protection active',
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/8 border-orange-500/20',
    icon: '⚔️',
  },
];

const LEGAL_LINKS = [
  { label: 'Conditions d\'utilisation', to: '/cgu' },
  { label: 'Conditions de vente', to: '/cgv' },
  { label: 'Politique de confidentialité', to: '/privacy' },
  { label: 'Mentions légales', to: '/legal' },
];

export default function SecurityBlock() {
  const [params] = useSearchParams();
  const type = (params.get('type') ?? 'general') as AttackType;
  const msg = MESSAGES[type] ?? MESSAGES.general;
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setPulse(p => !p), 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12 overflow-hidden relative">
      <style>{`
        @keyframes shield-pop {
          0%,100% { transform: scale(1) rotate(-2deg); }
          50%      { transform: scale(1.08) rotate(2deg); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes scan-line {
          0%   { top: 0%; opacity: 0.6; }
          100% { top: 100%; opacity: 0; }
        }
        .shield-anim { animation: shield-pop 3s ease-in-out infinite; }
        .fu1 { animation: fade-up .4s .0s ease both; }
        .fu2 { animation: fade-up .4s .1s ease both; }
        .fu3 { animation: fade-up .4s .2s ease both; }
        .fu4 { animation: fade-up .4s .3s ease both; }
        .fu5 { animation: fade-up .4s .4s ease both; }
        .scan { animation: scan-line 2.5s linear infinite; }
      `}</style>

      {/* Grid background */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Glow blob */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-red-500/4 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-2xl space-y-10 text-center">

        {/* Shield icon with scan effect */}
        <div className="fu1 flex justify-center">
          <div className="relative">
            <div className={`w-32 h-32 rounded-3xl flex items-center justify-center border-2 transition-colors duration-700 ${pulse ? 'bg-red-500/10 border-red-500/40' : 'bg-destructive/6 border-destructive/20'}`}>
              <div className="absolute inset-0 rounded-3xl overflow-hidden">
                <div className="scan absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
              </div>
              <ShieldCheck className="w-16 h-16 text-destructive shield-anim" />
            </div>
            <span className="absolute -top-3 -right-3 text-3xl">{msg.emoji}</span>
          </div>
        </div>

        {/* Code pill — attack detail */}
        <div className="fu2">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/8 border border-destructive/20 text-xs text-destructive font-mono">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {msg.detail}
          </div>
        </div>

        {/* Main message */}
        <div className="fu3 space-y-3">
          <h1 className="text-xl md:text-2xl font-black leading-snug font-mono text-foreground/90">
            {msg.title}
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">
            {msg.sub}
          </p>
        </div>

        {/* Security certifications */}
        <div className="fu4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center justify-center gap-2">
            <Lock className="w-3.5 h-3.5" />
            Ce site est protégé selon les normes
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CERTIF_BADGES.map(b => (
              <div key={b.label} className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border text-center ${b.bg}`}>
                <span className="text-xl">{b.icon}</span>
                <p className={`text-[11px] font-black leading-tight ${b.color}`}>{b.label}</p>
                <p className="text-[9px] text-muted-foreground leading-tight">{b.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Legal links */}
        <div className="fu4 flex flex-wrap items-center justify-center gap-2">
          {LEGAL_LINKS.map(l => (
            <Link
              key={l.to}
              to={l.to}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <FileText className="w-3 h-3" />
              {l.label}
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div className="fu5 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/">
            <Button size="lg" className="font-bold gap-2 w-full sm:w-auto">
              <Home className="w-4 h-4" />
              Retour à l'accueil
            </Button>
          </Link>
          <a href="mailto:security@scouty.app">
            <Button variant="outline" size="lg" className="gap-2 w-full sm:w-auto">
              <ExternalLink className="w-4 h-4" />
              Signaler un bug de sécurité
            </Button>
          </a>
        </div>

        {/* Footer */}
        <p className="text-[11px] text-muted-foreground/40 fu5">
          Scouty · Incident de sécurité enregistré · Réf. {Date.now().toString(36).toUpperCase()}
        </p>
      </div>
    </div>
  );
}
