import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, X, Star, Edit, ArrowRight } from 'lucide-react';
import type { WyscoutStatRow } from '@/hooks/use-wyscout-stats';
import type { RoleTemplate, RoleStatTarget } from '@/lib/wyscout-analysis';
import { scoreAgainstTemplate } from '@/lib/wyscout-analysis';
import { upsertCustomProfile, deleteCustomProfile } from '@/lib/wyscout-custom-profiles';
import type { Player } from '@/types/player';

const POSITIONS = ['GK', 'DC', 'LD', 'LG', 'MDef', 'MC', 'MO', 'AD', 'AG', 'ATT'];

interface StatDef {
  db: keyof WyscoutStatRow;
  label: string;
  unit?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  customProfiles: RoleTemplate[];
  onProfilesChange: (next: RoleTemplate[]) => void;
  statCatalog: StatDef[];
  currentPlayerRow: WyscoutStatRow | null;
  currentPlayerName: string;
  currentPlayerPosition: string;
  peerSummaries: WyscoutStatRow[];
  allPlayers: Player[];
}

const MATCH_THRESHOLD = 60;

export default function CustomProfileEditor({
  open, onOpenChange, customProfiles, onProfilesChange,
  statCatalog, currentPlayerRow, currentPlayerName, currentPlayerPosition,
  peerSummaries, allPlayers,
}: Props) {
  const { t } = useTranslation();

  // Edit form state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formPositions, setFormPositions] = useState<string[]>([]);
  const [formStats, setFormStats] = useState<RoleStatTarget[]>([]);
  const [errors, setErrors] = useState<string | null>(null);

  const editing = editingKey !== null;
  const statByDb = useMemo(() => Object.fromEntries(statCatalog.map(s => [s.db as string, s])), [statCatalog]);

  const resetForm = () => {
    setEditingKey(null);
    setFormName('');
    setFormPositions([currentPlayerPosition]);
    setFormStats([]);
    setErrors(null);
  };

  const startCreate = () => {
    resetForm();
    setEditingKey('__new__');
  };

  const startEdit = (p: RoleTemplate) => {
    setEditingKey(p.key);
    setFormName(p.label);
    setFormPositions([...p.positions]);
    setFormStats(p.template.map(t => ({ ...t })));
    setErrors(null);
  };

  const togglePosition = (pos: string) => {
    setFormPositions(prev => prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]);
  };

  const addStat = (db: keyof WyscoutStatRow) => {
    if (formStats.find(s => s.db === db)) return;
    const playerVal = currentPlayerRow ? Number(currentPlayerRow[db] ?? 0) : 0;
    // Sensible defaults: good ~= player's value × 1.3, poor ~= × 0.5
    const goodValue = playerVal > 0 ? Math.round(playerVal * 1.3 * 100) / 100 : 1;
    const poorValue = playerVal > 0 ? Math.round(playerVal * 0.5 * 100) / 100 : 0;
    setFormStats(prev => [...prev, { db, goodValue, poorValue, weight: 1 }]);
  };

  const updateStat = (idx: number, patch: Partial<RoleStatTarget>) => {
    setFormStats(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const removeStat = (idx: number) => {
    setFormStats(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!formName.trim()) { setErrors(t('wyscout.custom_err_name')); return; }
    if (formPositions.length === 0) { setErrors(t('wyscout.custom_err_pos')); return; }
    if (formStats.length < 3) { setErrors(t('wyscout.custom_err_min_stats')); return; }

    const saved = upsertCustomProfile({
      key: editingKey === '__new__' ? undefined : editingKey ?? undefined,
      label: formName.trim(),
      positions: formPositions,
      template: formStats,
    });
    const next = [...customProfiles.filter(p => p.key !== saved.key), saved];
    onProfilesChange(next);
    resetForm();
  };

  const handleDelete = (key: string) => {
    const next = deleteCustomProfile(key);
    onProfilesChange(next);
    if (editingKey === key) resetForm();
  };

  // ── Live preview: current player + matching peers ───────────────────────
  const previewTemplate: RoleTemplate | null = useMemo(() => {
    if (formStats.length < 3 || !formName.trim() || formPositions.length === 0) return null;
    return { key: '_preview', label: formName.trim(), positions: formPositions, template: formStats };
  }, [formName, formPositions, formStats]);

  const currentPlayerScore = useMemo(() => {
    if (!previewTemplate || !currentPlayerRow) return null;
    return scoreAgainstTemplate(currentPlayerRow, previewTemplate);
  }, [previewTemplate, currentPlayerRow]);

  const matchingPlayers = useMemo(() => {
    if (!previewTemplate) return [];
    return peerSummaries
      .filter(p => previewTemplate.positions.includes(allPlayers.find(pl => pl.id === p.player_id)?.position ?? ''))
      .map(row => {
        const result = scoreAgainstTemplate(row, previewTemplate);
        if (!result) return null;
        const player = allPlayers.find(pl => pl.id === row.player_id);
        if (!player) return null;
        return { player, score: result.score };
      })
      .filter((v): v is { player: Player; score: number } => v !== null && v.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score);
  }, [previewTemplate, peerSummaries, allPlayers]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setEditingKey(null);
      setFormName('');
      setFormPositions([]);
      setFormStats([]);
      setErrors(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('wyscout.custom_title')}</DialogTitle>
        </DialogHeader>

        {/* ── Saved profiles list ── */}
        {!editing && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t('wyscout.custom_desc')}</p>
            {customProfiles.length === 0 ? (
              <div className="text-center py-6 border border-dashed rounded-lg">
                <p className="text-sm text-muted-foreground">{t('wyscout.custom_empty')}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {customProfiles.map(p => (
                  <div key={p.key} className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{p.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {p.positions.join(' · ')} · {p.template.length} stats
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => startEdit(p)}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleDelete(p.key)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button size="sm" variant="outline" onClick={startCreate} className="w-full">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> {t('wyscout.custom_new')}
            </Button>
          </div>
        )}

        {/* ── Edit / create form ── */}
        {editing && (
          <div className="space-y-4">
            {/* Name */}
            <div>
              <Label className="text-xs font-semibold">{t('wyscout.custom_name')}</Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder={t('wyscout.custom_name_placeholder')}
                className="mt-1 h-8 text-sm"
              />
            </div>

            {/* Positions */}
            <div>
              <Label className="text-xs font-semibold">{t('wyscout.custom_positions')}</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {POSITIONS.map(pos => {
                  const active = formPositions.includes(pos);
                  return (
                    <button key={pos} onClick={() => togglePosition(pos)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                        active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'
                      }`}>
                      {pos}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stats */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-semibold">{t('wyscout.custom_stats')}</Label>
                <span className="text-[10px] text-muted-foreground">{formStats.length}/8</span>
              </div>

              {formStats.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic mb-2">{t('wyscout.custom_stats_help')}</p>
              )}

              {formStats.length > 0 && (
                <div className="space-y-2 mb-2">
                  {formStats.map((s, idx) => {
                    const def = statByDb[s.db as string];
                    const playerVal = currentPlayerRow ? Number(currentPlayerRow[s.db] ?? NaN) : NaN;
                    const lessIsBetter = s.goodValue < s.poorValue;
                    return (
                      <div key={s.db as string} className="p-2 rounded-md border border-border bg-muted/20 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium flex-1 truncate">{def?.label || String(s.db)}</span>
                          <button
                            onClick={() => updateStat(idx, { weight: s.weight >= 2 ? 1 : 2 })}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 transition-colors ${
                              s.weight >= 2 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                            }`}
                            title={t('wyscout.custom_signature_help')}
                          >
                            <Star className="w-2.5 h-2.5" />{s.weight >= 2 ? t('wyscout.custom_signature') : t('wyscout.custom_signature_off')}
                          </button>
                          <button onClick={() => removeStat(idx)} className="text-muted-foreground hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">{t('wyscout.custom_excellent')}</Label>
                            <Input type="number" step="any"
                              value={s.goodValue}
                              onChange={e => updateStat(idx, { goodValue: Number(e.target.value) })}
                              className="h-7 text-xs mt-0.5" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">{t('wyscout.custom_poor')}</Label>
                            <Input type="number" step="any"
                              value={s.poorValue}
                              onChange={e => updateStat(idx, { poorValue: Number(e.target.value) })}
                              className="h-7 text-xs mt-0.5" />
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>
                            {!isNaN(playerVal) && (
                              <>
                                {currentPlayerName}: <span className="font-mono font-semibold text-foreground">{playerVal}{def?.unit === '%' ? '%' : ''}</span>
                              </>
                            )}
                          </span>
                          <span className={`text-[9px] ${lessIsBetter ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                            {lessIsBetter ? '↓ ' + t('wyscout.custom_less_is_better') : '↑ ' + t('wyscout.custom_more_is_better')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Stat picker */}
              {formStats.length < 8 && (
                <details className="mt-1">
                  <summary className="text-xs text-primary cursor-pointer hover:underline flex items-center gap-1">
                    <Plus className="w-3 h-3" /> {t('wyscout.custom_add_stat')}
                  </summary>
                  <div className="flex flex-wrap gap-1 mt-2 max-h-40 overflow-y-auto p-1 border border-border rounded-md">
                    {statCatalog
                      .filter(s => !formStats.find(fs => fs.db === s.db))
                      .map(s => (
                        <button key={s.db as string} onClick={() => addStat(s.db)}
                          className="px-1.5 py-0.5 rounded text-[10px] border border-border hover:bg-muted text-muted-foreground hover:text-foreground">
                          {s.label}
                        </button>
                      ))}
                  </div>
                </details>
              )}
            </div>

            {/* Errors */}
            {errors && <p className="text-xs text-destructive">{errors}</p>}

            {/* Live preview */}
            {previewTemplate && (
              <div className="border-t border-border pt-3 space-y-2">
                <Label className="text-xs font-semibold">{t('wyscout.custom_preview')}</Label>
                {currentPlayerScore && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{currentPlayerName}</span>
                    <Badge variant="outline" className="font-mono">{currentPlayerScore.score}%</Badge>
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground">
                  {t('wyscout.custom_matching_count', { count: matchingPlayers.length, threshold: MATCH_THRESHOLD })}
                </div>
                {matchingPlayers.slice(0, 3).map(m => (
                  <div key={m.player.id} className="flex items-center gap-2 text-[11px] py-0.5">
                    <span className="flex-1 truncate">{m.player.name}</span>
                    <span className="text-muted-foreground text-[10px]">{m.player.position} · {m.player.club}</span>
                    <Badge variant="secondary" className="font-mono text-[10px]">{m.score}%</Badge>
                  </div>
                ))}
                {matchingPlayers.length > 3 && (
                  <p className="text-[10px] text-muted-foreground italic">
                    + {matchingPlayers.length - 3} {t('wyscout.custom_more_matching')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="outline" onClick={resetForm}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={handleSave}>
                <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                {t('wyscout.custom_save')}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
