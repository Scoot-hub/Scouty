import { useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Loader2, ChevronLeft, MapPin, Clock, Trash2, Upload, FileText,
  ExternalLink, AlertTriangle, CheckCircle2, Circle, XCircle, CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import RichTextEditor from '@/components/RichTextEditor';
import { LeagueLogo } from '@/components/ui/league-logo';
import { useUpdateMatchStatus, useRemoveMatch } from '@/hooks/use-match-assignments';
import { useUtcOffset, formatTimeWithOffset } from '@/hooks/use-utc-offset';
import { cn } from '@/lib/utils';

function getAuthHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('scouthub_session');
    if (!raw) return {};
    const s = JSON.parse(raw);
    const token = s?.access_token ?? s?.token ?? s?.session?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch { return {}; }
}

interface Assignment {
  id: string;
  user_id: string;
  organization_id: string | null;
  assigned_to: string | null;
  assigned_by: string | null;
  home_team: string;
  away_team: string;
  match_date: string;
  match_time: string | null;
  competition: string;
  venue: string;
  home_badge: string | null;
  away_badge: string | null;
  notes: string | null;
  rich_notes: string | null;
  status: string;
  created_at: string;
}

interface AssignmentFile {
  id: string;
  file_name: string;
  file_url: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string;
}

const STATUS_CYCLE: Record<string, string> = { planned: 'confirmed', confirmed: 'completed', completed: 'planned', cancelled: 'planned' };
const STATUS_ICONS: Record<string, typeof Circle> = { planned: Circle, confirmed: CheckCircle2, completed: CheckCircle2, cancelled: XCircle };
const STATUS_COLORS: Record<string, string> = {
  planned: 'text-blue-500',
  confirmed: 'text-amber-500',
  completed: 'text-green-500',
  cancelled: 'text-muted-foreground',
};
const STATUS_LABELS: Record<string, string> = {
  planned: 'Planifié',
  confirmed: 'Confirmé',
  completed: 'Effectué',
  cancelled: 'Annulé',
};

function formatBytes(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDateFull(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Info tab ──────────────────────────────────────────────────────────────────

function InfoTab({ assignment, onCycleStatus }: { assignment: Assignment; onCycleStatus: () => void }) {
  const { utcOffset } = useUtcOffset();
  const StatusIcon = STATUS_ICONS[assignment.status] ?? Circle;
  const statusColor = STATUS_COLORS[assignment.status] ?? 'text-muted-foreground';

  return (
    <div className="space-y-4">
      {/* Scoreboard card */}
      <Card>
        <CardContent className="py-6">
          {/* Status + date */}
          <div className="flex items-center justify-center gap-3 mb-5">
            <button
              onClick={onCycleStatus}
              className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors hover:opacity-80', statusColor,
                assignment.status === 'planned' && 'bg-blue-500/10 border-blue-500/30',
                assignment.status === 'confirmed' && 'bg-amber-500/10 border-amber-500/30',
                assignment.status === 'completed' && 'bg-green-500/10 border-green-500/30',
                assignment.status === 'cancelled' && 'bg-muted border-border',
              )}
              title="Cliquer pour changer le statut"
            >
              <StatusIcon className="w-3.5 h-3.5" />
              {STATUS_LABELS[assignment.status] ?? assignment.status}
            </button>
          </div>

          {/* Teams */}
          <div className="flex items-center gap-4">
            <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
              {assignment.home_badge ? (
                <img src={assignment.home_badge} alt="" className="w-14 h-14 object-contain" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-xl font-black text-muted-foreground">
                  {assignment.home_team.slice(0, 1)}
                </div>
              )}
              <span className="text-sm font-bold text-center leading-tight">{assignment.home_team}</span>
            </div>
            <div className="shrink-0 text-center min-w-[60px]">
              <div className="text-2xl font-bold text-muted-foreground">VS</div>
            </div>
            <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
              {assignment.away_badge ? (
                <img src={assignment.away_badge} alt="" className="w-14 h-14 object-contain" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-xl font-black text-muted-foreground">
                  {assignment.away_team.slice(0, 1)}
                </div>
              )}
              <span className="text-sm font-bold text-center leading-tight">{assignment.away_team}</span>
            </div>
          </div>

          {/* Date / time / venue */}
          <div className="mt-5 pt-4 border-t flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              {formatDateFull(assignment.match_date)}
            </span>
            {assignment.match_time && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTimeWithOffset(assignment.match_time, utcOffset)}
              </span>
            )}
            {assignment.venue && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {assignment.venue}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Competition */}
      {assignment.competition && (
        <div className="flex items-center gap-2">
          <LeagueLogo league={assignment.competition} size="sm" />
          <span className="text-sm font-medium">{assignment.competition}</span>
        </div>
      )}

      {/* Plain text notes (existing field) */}
      {assignment.notes && (
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Consignes</p>
            <p className="text-sm whitespace-pre-wrap">{assignment.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Notes tab ─────────────────────────────────────────────────────────────────

function NotesTab({ assignmentId, initialNotes }: { assignmentId: string; initialNotes: string | null }) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const { mutate: saveNotes, isPending } = useMutation({
    mutationFn: async (html: string) => {
      const r = await fetch(`/api/match-assignments/${assignmentId}/rich-notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ rich_notes: html }),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['match-assignment-detail', assignmentId] });
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  });

  const handleChange = (html: string) => {
    setNotes(html);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNotes(html), 1500);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Vos notes et observations sur ce match</p>
        <span className={cn('text-[11px] transition-colors', saved ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground')}>
          {isPending ? 'Sauvegarde…' : saved ? '✓ Sauvegardé' : 'Modification…'}
        </span>
      </div>
      <RichTextEditor
        value={notes}
        onChange={handleChange}
        placeholder="Rédigez vos observations, analyse tactique, notes de scouting…"
        minHeight="360px"
      />
    </div>
  );
}

// ── Files tab ─────────────────────────────────────────────────────────────────

function FilesTab({ assignmentId, files: initialFiles }: { assignmentId: string; files: AssignmentFile[] }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['match-assignment-detail', assignmentId],
    enabled: false,
    select: (d: { assignment: Assignment; files: AssignmentFile[] }) => d.files,
  });
  const files = data ?? initialFiles;

  const { mutate: uploadFile, isPending: isUploading } = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch(`/api/match-assignments/${assignmentId}/files`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: form,
      });
      if (!r.ok) throw new Error('Erreur lors de l\'upload');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match-assignment-detail', assignmentId] });
      toast.success('Fichier ajouté');
    },
    onError: (err: Error) => toast.error(err.message || 'Erreur upload'),
  });

  const { mutate: deleteFile } = useMutation({
    mutationFn: async (fileId: string) => {
      const r = await fetch(`/api/match-assignments/${assignmentId}/files/${fileId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match-assignment-detail', assignmentId] });
      toast.success('Fichier supprimé');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{files.length} fichier{files.length !== 1 ? 's' : ''}</p>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Ajouter un fichier
        </Button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={e => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file);
          e.target.value = '';
        }} />
      </div>

      {files.length === 0 ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Aucun fichier joint</p>
            <p className="text-xs text-muted-foreground/70">Rapports, vidéos, PDF…</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {files.map(f => (
            <Card key={f.id}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.file_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatBytes(f.file_size)}
                    {f.uploaded_at && ` · ${new Date(f.uploaded_at).toLocaleDateString('fr-FR')}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button asChild variant="ghost" size="icon" className="w-8 h-8">
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-muted-foreground hover:text-destructive"
                    onClick={() => { if (confirm(`Supprimer "${f.file_name}" ?`)) deleteFile(f.id); }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MyMatchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'info' | 'notes' | 'files'>('info');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['match-assignment-detail', id],
    queryFn: () => fetch(`/api/match-assignments/${id}`, { headers: getAuthHeaders() }).then(r => {
      if (!r.ok) throw new Error();
      return r.json();
    }),
    staleTime: 0,
    enabled: !!id,
  });

  const updateStatus = useUpdateMatchStatus();
  const removeMatch = useRemoveMatch();

  const assignment: Assignment | null = data?.assignment ?? null;
  const files: AssignmentFile[] = data?.files ?? [];

  const handleCycleStatus = () => {
    if (!assignment) return;
    const next = STATUS_CYCLE[assignment.status] ?? 'planned';
    updateStatus.mutate({ id: assignment.id, status: next }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['match-assignment-detail', id] }),
    });
  };

  const handleDelete = () => {
    if (!assignment) return;
    if (!confirm(`Supprimer le match ${assignment.home_team} – ${assignment.away_team} ?`)) return;
    removeMatch.mutate(assignment.id, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['my-matches'] });
        navigate('/my-matches');
      },
    });
  };

  return (
    <div className="max-w-3xl mx-auto py-4 px-4 space-y-4">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <Link
          to="/my-matches"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Mes matchs
        </Link>
        {assignment && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="w-4 h-4" />
            Supprimer
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError || !assignment ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="font-medium">Match introuvable</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/my-matches">Retour à mes matchs</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Title */}
          <div>
            <h1 className="text-lg font-bold">{assignment.home_team} vs {assignment.away_team}</h1>
            <p className="text-sm text-muted-foreground">{formatDateFull(assignment.match_date)}</p>
          </div>

          <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)}>
            <TabsList className="rounded-xl w-full">
              <TabsTrigger value="info" className="flex-1 rounded-lg gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                Infos
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex-1 rounded-lg gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Notes
              </TabsTrigger>
              <TabsTrigger value="files" className="flex-1 rounded-lg gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                Fichiers
                {files.length > 0 && (
                  <span className="ml-0.5 text-[10px] bg-muted-foreground/20 rounded-full px-1.5 py-0.5 font-bold">
                    {files.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="mt-4">
              <InfoTab assignment={assignment} onCycleStatus={handleCycleStatus} />
            </TabsContent>

            <TabsContent value="notes" className="mt-4">
              <NotesTab assignmentId={assignment.id} initialNotes={assignment.rich_notes} />
            </TabsContent>

            <TabsContent value="files" className="mt-4">
              <FilesTab assignmentId={assignment.id} files={files} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
