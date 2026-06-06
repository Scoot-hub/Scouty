import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { METRICS, useMetricLabel, type MetricCat, type MetricDef } from '@/lib/wyscout-metrics';

const CAT_ORDER: MetricCat[] = ['attack', 'passing', 'defense', 'physical', 'set', 'gk', 'volume'];

/**
 * Categorised statistic picker (checkbox grid), shared by /data pages.
 * Mirrors the "Choisir les statistiques" dialog of the comparator, but uses the
 * shared translated metric catalogue.
 */
export function StatPickerDialog({
  open, onOpenChange, selected, onChange, title,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  selected: string[];
  onChange: (s: string[]) => void;
  title?: string;
}) {
  const { t } = useTranslation();
  const { label, catLabel } = useMetricLabel();
  const [draft, setDraft] = useState<string[]>(selected);
  useEffect(() => { if (open) setDraft(selected); }, [open, selected]);

  const grouped = useMemo(() => {
    const out = {} as Record<MetricCat, MetricDef[]>;
    for (const c of CAT_ORDER) out[c] = [];
    for (const m of METRICS) out[m.cat].push(m);
    return out;
  }, []);

  const toggle = (key: string) => setDraft(d => d.includes(key) ? d.filter(k => k !== key) : [...d, key]);
  const toggleCat = (cat: MetricCat) => {
    const keys = grouped[cat].map(s => s.key as string);
    const allOn = keys.every(k => draft.includes(k));
    setDraft(d => allOn ? d.filter(k => !keys.includes(k)) : Array.from(new Set([...d, ...keys])));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> {title || t('data.pick_stats', 'Choisir les statistiques')}
          </DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <button onClick={() => setDraft([])}
            className="text-[10px] px-2 py-1 rounded-md border border-border hover:bg-destructive/10 hover:text-destructive transition-colors font-medium">
            {t('data.clear_all', 'Tout effacer')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain -mx-1 px-1 min-h-0">
          <div className="space-y-3">
            {CAT_ORDER.filter(c => grouped[c].length).map(cat => {
              const items = grouped[cat];
              const allKeys = items.map(s => s.key as string);
              const allOn = allKeys.every(k => draft.includes(k));
              const someOn = !allOn && allKeys.some(k => draft.includes(k));
              return (
                <div key={cat}>
                  <button onClick={() => toggleCat(cat)}
                    className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wide text-muted-foreground py-1 hover:text-foreground">
                    <span>{catLabel(cat)}</span>
                    <span className="text-[10px] font-normal">
                      {someOn ? t('data.partial', '— partiel —') : allOn ? t('data.all_selected', '— tout —') : t('data.select_all', '— tout sélectionner —')}
                    </span>
                  </button>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {items.map(s => (
                      <label key={s.key as string}
                        className={cn('flex items-center gap-2 px-2 py-1.5 rounded-md border cursor-pointer transition-colors text-xs',
                          draft.includes(s.key as string) ? 'bg-primary/10 border-primary/40' : 'border-border hover:bg-muted/50')}>
                        <Checkbox checked={draft.includes(s.key as string)} onCheckedChange={() => toggle(s.key as string)} />
                        <span className="truncate">{label(s.key as string)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">{t('data.n_selected', '{{n}} sélectionnées', { n: draft.length })}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t('data.cancel', 'Annuler')}</Button>
            <Button size="sm" onClick={() => { onChange(draft); onOpenChange(false); }}>{t('data.apply', 'Appliquer')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
