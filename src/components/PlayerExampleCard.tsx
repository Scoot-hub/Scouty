import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import cherkiPhoto from '@/assets/cherki.png';

// ── Shared in-view hook (one-shot) — copied verbatim from Landing.tsx ──────────
function useInView<T extends HTMLElement>(threshold = 0.18) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold, rootMargin: '0px 0px -40px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

// ── Count-up number (animates from 0 when scrolled into view) — copied verbatim ─
function CountUp({ value, decimals = 0, prefix = '', suffix = '', duration = 1100, className }:
  { value: number; decimals?: number; prefix?: string; suffix?: string; duration?: number; className?: string }) {
  const [ref, inView] = useInView<HTMLSpanElement>(0.4);
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    let startTs = 0;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const p = Math.min((ts - startTs) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);
  return <span ref={ref} className={className}>{prefix}{val.toFixed(decimals)}{suffix}</span>;
}

// ── Branded sample player card — copied verbatim from Landing.tsx (PlayerMockup) ─
// Used as the illustrative "Example" card in the Players empty-account state.
export function PlayerExampleCard() {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-sm select-none">
      <div className="rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gradient-to-b from-primary/15 to-accent/15 ring-1 ring-border">
            <img src={cherkiPhoto} alt="Rayan Cherki" className="w-full h-full object-cover object-top" loading="lazy" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-foreground truncate">Rayan Cherki</div>
            <div className="text-xs text-muted-foreground">Milieu offensif · 22 ans</div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-accent/25 text-accent-foreground whitespace-nowrap">
            {t('landing.ui.watch')}
          </span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          {[
            { node: <CountUp value={8.2} decimals={1} />, l: t('landing.ui.level') },
            { node: <CountUp value={8.8} decimals={1} />, l: t('landing.ui.potential') },
            { node: <CountUp value={40} prefix="€" suffix="M" />, l: t('landing.ui.value') },
          ].map(s => (
            <div key={s.l} className="py-3 text-center">
              <div className="text-lg font-black text-foreground tabular-nums">{s.node}</div>
              <div className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wide">{s.l}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 px-4 pt-3 flex-wrap">
          {['MO', 'France', 'Gaucher', '22 ans'].map(tag => (
            <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">{tag}</span>
          ))}
        </div>
        <div className="m-4 p-3 rounded-xl bg-muted/60 border border-border">
          <div className="text-[11px] text-muted-foreground leading-relaxed italic">
            « Génie technique, élimine dans les petits espaces. À confirmer dans le repli défensif. »
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlayerExampleCard;
