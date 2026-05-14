import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '@/lib/format-utils';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { AlertTriangle, CheckCircle2, Trash2, ChevronDown, ChevronUp, Filter, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface FrontendError {
  id: number;
  user_id: string | null;
  user_email: string | null;
  page_url: string;
  error_name: string;
  error_message: string;
  error_stack: string | null;
  component_stack: string | null;
  source: 'frontend' | 'build' | 'server';
  is_resolved: boolean;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

async function fetchErrors(filter: string): Promise<FrontendError[]> {
  const params = filter === 'resolved' ? '?resolved=1' : filter === 'unresolved' ? '?resolved=0' : '';
  const res = await fetch(`/api/admin/errors${params}`);
  if (!res.ok) throw new Error('Failed to fetch errors');
  const data = await res.json();
  return Array.isArray(data) ? data : (data.errors ?? []);
}

export default function AdminErrors() {
  const { toast } = useToast();
  const { dateFormat, timeFormat, timezone } = useUiPreferences();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [resolveDialog, setResolveDialog] = useState<{ open: boolean; error: FrontendError | null }>({ open: false, error: null });
  const [resolutionNote, setResolutionNote] = useState('');

  const { data: errors = [], isLoading } = useQuery({
    queryKey: ['admin-errors', filter],
    queryFn: () => fetchErrors(filter),
    staleTime: 30_000,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) => {
      const res = await fetch(`/api/admin/errors/${id}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_note: note }),
      });
      if (!res.ok) throw new Error('Failed to resolve');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-errors'] });
      setResolveDialog({ open: false, error: null });
      setResolutionNote('');
      toast({ title: 'Erreur marquée comme résolue' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/errors/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-errors'] });
      toast({ title: 'Erreur supprimée' });
    },
  });

  function formatDate(dateStr: string) {
    return formatDateTime(dateStr, dateFormat, timeFormat, timezone);
  }

  function shortUrl(url: string) {
    try { return new URL(url).pathname; } catch { return url; }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Administration
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-destructive" />
          <h1 className="text-2xl font-bold">Erreurs frontend</h1>
          {errors.length > 0 && (
            <Badge variant="destructive">{errors.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unresolved">Non résolues</SelectItem>
              <SelectItem value="resolved">Résolues</SelectItem>
              <SelectItem value="all">Toutes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div className="text-center text-muted-foreground py-12">Chargement…</div>
      )}

      {!isLoading && errors.length === 0 && (
        <div className="text-center text-muted-foreground py-12 flex flex-col items-center gap-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          <p>Aucune erreur{filter === 'unresolved' ? ' non résolue' : ''} pour le moment.</p>
        </div>
      )}

      <div className="space-y-3">
        {errors.map((err) => {
          const isExpanded = expandedId === err.id;
          return (
            <div key={err.id} className={`rounded-xl border bg-card transition-all ${err.is_resolved ? 'opacity-60' : ''}`}>
              {/* Header row */}
              <div
                className="flex items-start gap-3 p-4 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : err.id)}
              >
                <div className="mt-0.5 shrink-0">
                  {err.is_resolved
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    : <AlertTriangle className="w-5 h-5 text-destructive" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{err.error_name}</span>
                    {err.source === 'build'
                      ? <Badge className="text-[10px] bg-violet-500/10 text-violet-600 border-violet-500/30">Build</Badge>
                      : err.source === 'server'
                        ? <Badge className="text-[10px] bg-orange-500/10 text-orange-600 border-orange-500/30">Serveur</Badge>
                        : null}
                    <Badge variant="outline" className="text-[10px] font-mono">{shortUrl(err.page_url)}</Badge>
                    {err.is_resolved && <Badge variant="secondary" className="text-[10px]">Résolu</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">{err.error_message}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground/60">
                    <span>{formatDate(err.created_at)}</span>
                    {err.user_email && <span>· {err.user_email}</span>}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {!err.is_resolved && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                      onClick={(e) => { e.stopPropagation(); setResolveDialog({ open: true, error: err }); setResolutionNote(''); }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Résoudre
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(err.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t px-4 pb-4 pt-3 space-y-3">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><span className="font-medium text-foreground">Page :</span> <a href={err.page_url} target="_blank" rel="noreferrer" className="underline break-all">{err.page_url}</a></p>
                    {err.user_id && <p><span className="font-medium text-foreground">User ID :</span> {err.user_id}</p>}
                    {err.is_resolved && err.resolved_at && (
                      <p><span className="font-medium text-foreground">Résolu le :</span> {formatDate(err.resolved_at)}</p>
                    )}
                    {err.resolution_note && (
                      <p><span className="font-medium text-foreground">Note :</span> {err.resolution_note}</p>
                    )}
                  </div>
                  {err.error_stack && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1">Stack trace</p>
                      <pre className="text-[10px] leading-5 bg-muted/60 border rounded-lg p-3 overflow-auto max-h-40 font-mono whitespace-pre-wrap break-words text-muted-foreground">
                        {err.error_stack}
                      </pre>
                    </div>
                  )}
                  {err.component_stack && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1">Component stack</p>
                      <pre className="text-[10px] leading-5 bg-muted/60 border rounded-lg p-3 overflow-auto max-h-32 font-mono whitespace-pre-wrap break-words text-muted-foreground">
                        {err.component_stack}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Resolve dialog */}
      <Dialog open={resolveDialog.open} onOpenChange={(o) => setResolveDialog({ open: o, error: o ? resolveDialog.error : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marquer comme résolu</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ajoutez une note optionnelle expliquant la résolution de cette erreur.
            </p>
            <Textarea
              placeholder="Ex: Bug corrigé dans le commit abc123 — mauvaise référence de variable dans OrgChat.tsx"
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialog({ open: false, error: null })}>Annuler</Button>
            <Button
              onClick={() => resolveDialog.error && resolveMutation.mutate({ id: resolveDialog.error.id, note: resolutionNote })}
              disabled={resolveMutation.isPending}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
