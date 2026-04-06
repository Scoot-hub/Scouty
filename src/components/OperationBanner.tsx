import { useTranslation } from 'react-i18next';
import { useOperationBanner, type Operation } from '@/contexts/OperationBannerContext';
import { Progress } from '@/components/ui/progress';
import { X, Zap, FileSpreadsheet, Check, Loader2 } from 'lucide-react';

function OperationItem({ op, onDismiss }: { op: Operation; onDismiss: () => void }) {
  const { t } = useTranslation();
  const pct = op.total > 0 ? Math.round((op.current / op.total) * 100) : 0;
  const Icon = op.type === 'enrichment' ? Zap : FileSpreadsheet;

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${
        op.done
          ? 'bg-emerald-500/15 text-emerald-500'
          : op.type === 'enrichment' ? 'bg-amber-500/15 text-amber-500' : 'bg-blue-500/15 text-blue-500'
      }`}>
        {op.done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium truncate">{op.label}</span>
          {!op.done && (
            <Loader2 className="w-3 h-3 animate-spin shrink-0 text-muted-foreground" />
          )}
        </div>

        {op.done ? (
          <p className="text-xs text-muted-foreground/80 mt-0.5">
            {(() => {
              const parts: string[] = [];
              if (op.newCount && op.newCount > 0) parts.push(t('banner.new_count', { count: op.newCount }));
              if (op.updatedCount && op.updatedCount > 0) parts.push(t('banner.updated_count', { count: op.updatedCount }));
              if (op.errorCount && op.errorCount > 0) parts.push(t('banner.error_count', { count: op.errorCount }));
              return parts.length > 0 ? parts.join(' · ') : t('banner.done');
            })()}
          </p>
        ) : (
          <div className="flex items-center gap-2.5 mt-1.5">
            <Progress value={pct} className="h-1 flex-1" />
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
              {op.current}/{op.total}
            </span>
          </div>
        )}
      </div>

      {op.done && (
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="shrink-0 p-1.5 rounded-lg hover:bg-foreground/5 text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export default function OperationBanner() {
  const { t } = useTranslation();
  const { operations, dismissOperation, dismissAll } = useOperationBanner();

  if (operations.length === 0) return null;

  const doneCount = operations.filter(o => o.done).length;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[380px] max-w-[calc(100vw-2.5rem)] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/10 dark:shadow-black/30 overflow-hidden">
        <div className="px-4 py-3 space-y-3">
          {operations.map(op => (
            <OperationItem
              key={op.id}
              op={op}
              onDismiss={() => dismissOperation(op.id)}
            />
          ))}
        </div>

        {doneCount > 0 && (
          <div className="border-t border-border/40 px-4 py-2 flex justify-end">
            <button
              onClick={dismissAll}
              className="text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors font-medium px-2 py-1 rounded-lg hover:bg-foreground/5"
            >
              {t('banner.dismiss_all')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
