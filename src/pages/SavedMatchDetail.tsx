import { useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, MapPin, User, Bookmark, CalendarDays, Trophy, Trash2, Upload, FileText, ExternalLink, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import RichTextEditor from '@/components/RichTextEditor';
import { LeagueLogo } from '@/components/ui/league-logo';
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

interface SavedMatch {
  id: string;
  livescore_match_id: string | null;
  home_team: string;
  away_team: string;
  home_badge: string | null;
  away_badge: string | null;
  score_home: number | null;
  score_away: number | null;
  ht_score_home: number | null;
  ht_score_away: number | null;
  competition: string | null;
  country: string | null;
  country_code: string | null;
  match_date: string | null;
  match_time: string | null;
  venue: string | null;
  referee: string | null;
  status: string | null;
  rich_notes: string | null;
  saved_at: string;
}

interface MatchFile {
  id: string;
  file_name: string;
  file_url: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string;
}

function TeamBadge({ badge, name, size = 'lg' }: { badge: string | null; name: string; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'w-14 h-14 text-xl' : 'w-8 h-8 text-sm';
  if (badge) return <img src={badge} alt="" className={cn('object-contain', size === 'lg' ? 'w-14 h-14' : 'w-8 h-8')} />;
  return (
    <div className={cn('rounded-full bg-muted flex items-center justify-center font-black text-muted-foreground', cls)}>
      {name.slice(0, 1)}
    </div>
  );
}

function countryFlag(code: string) {
  if (!code || code.length !== 2) return '';
  return String.fromCodePoint(...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ── Info tab ──────────────────────────────────────────────────────────────────

function MatchInfoTab({ match }: { match: SavedMatch }) {
  const flag = match.country_code ? countryFlag(match.country_code) : '';
  const hasScore = match.score_home != null && match.score_away != null;

  return (
    <div className="space-y-4">
      {/* Competition / date */}
      <div className="flex items-center gap-2">
        {flag && <span className="text-lg">{flag}</span>}
        {match.competition && <LeagueLogo league={match.competition} size="sm" />}
        <div>
          {match.competition && (
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{match.competition}</p>
          )}
          {match.match_date && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              {new Date(match.match_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {match.match_time && ` · ${match.match_time}`}
            </p>
          )}
        </div>
      </div>

      {/* Scoreboard */}
      <Card>
        <CardContent className="py-6">
          {match.status && (
            <div className="flex justify-center mb-4">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-muted text-muted-foreground">
                {match.status}
              </span>
            </div>
          )}
          <div className="flex items-center gap-4">
            <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <TeamBadge badge={match.home_badge} name={match.home_team} size="lg" />
              <span className="text-sm font-bold text-center leading-tight">{match.home_team}</span>
            </div>
            <div className="shrink-0 text-center min-w-[80px]">
              {hasScore ? (
                <>
                  <div className="text-4xl font-extrabold font-mono tabular-nums">
                    {match.score_home} – {match.score_away}
                  </div>
                  {match.ht_score_home != null && match.ht_score_away != null && (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      MT {match.ht_score_home}–{match.ht_score_away}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-2xl font-bold text-muted-foreground">VS</div>
              )}
            </div>
            <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <TeamBadge badge={match.away_badge} name={match.away_team} size="lg" />
              <span className="text-sm font-bold text-center leading-tight">{match.away_team}</span>
            </div>
          </div>

          {(match.venue || match.referee) && (
            <div className="mt-4 pt-4 border-t flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
              {match.venue && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {match.venue}
                </span>
              )}
              {match.referee && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {match.referee}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Link back to live match */}
      {match.livescore_match_id && (
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to={`/match/${match.livescore_match_id}`}>
            <ExternalLink className="w-3.5 h-3.5" />
            Voir le match en direct
          </Link>
        </Button>
      )}
    </div>
  );
}

// ── Notes tab ─────────────────────────────────────────────────────────────────

function NotesTab({ matchId, initialNotes }: { matchId: string; initialNotes: string | null }) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const { mutate: saveNotes, isPending } = useMutation({
    mutationFn: async (html: string) => {
      const r = await fetch(`/api/saved-matches/${matchId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ rich_notes: html }),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['saved-match', matchId] });
    },
    onError: () => toast.error('Erreur lors de la sauvegarde des notes'),
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
        <p className="text-sm text-muted-foreground">Vos notes personnelles sur ce match</p>
        <span className={cn('text-[11px] transition-colors', saved ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground')}>
          {isPending ? 'Sauvegarde…' : saved ? '✓ Sauvegardé' : 'Modification…'}
        </span>
      </div>
      <RichTextEditor
        value={notes}
        onChange={handleChange}
        placeholder="Rédigez vos observations, analyses et notes sur ce match…"
        minHeight="360px"
      />
    </div>
  );
}

// ── Files tab ─────────────────────────────────────────────────────────────────

function FilesTab({ matchId, files: initialFiles }: { matchId: string; files: MatchFile[] }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { mutate: uploadFile, isPending: isUploading } = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch(`/api/saved-matches/${matchId}/files`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: form,
      });
      if (!r.ok) throw new Error('Erreur lors de l\'upload');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-match', matchId] });
      toast.success('Fichier ajouté');
    },
    onError: (err: Error) => toast.error(err.message || 'Erreur lors de l\'upload'),
  });

  const { mutate: deleteFile } = useMutation({
    mutationFn: async (fileId: string) => {
      const r = await fetch(`/api/saved-matches/${matchId}/files/${fileId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-match', matchId] });
      toast.success('Fichier supprimé');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  const { data } = useQuery({
    queryKey: ['saved-match', matchId],
    enabled: false,
    select: (d: { match: SavedMatch; files: MatchFile[] }) => d.files,
  });
  const files = data ?? initialFiles;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  };

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
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
      </div>

      {files.length === 0 ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Aucun fichier joint à ce match</p>
            <p className="text-xs text-muted-foreground/70">Ajoutez des rapports, vidéos, analyses…</p>
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
                  <Button asChild variant="ghost" size="icon" className="w-8 h-8" title="Ouvrir">
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

export default function SavedMatchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'info' | 'notes' | 'files'>('info');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['saved-match', id],
    queryFn: () => fetch(`/api/saved-matches/${id}`, { headers: getAuthHeaders() }).then(r => {
      if (!r.ok) throw new Error();
      return r.json();
    }),
    staleTime: 0,
    enabled: !!id,
  });

  const { mutate: deleteMatch, isPending: isDeleting } = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/saved-matches/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-matches'] });
      toast.success('Match supprimé de la bibliothèque');
      navigate('/match-library');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  const match: SavedMatch | null = data?.match ?? null;
  const files: MatchFile[] = data?.files ?? [];

  return (
    <div className="max-w-3xl mx-auto py-4 px-4 space-y-4">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <Link
          to="/match-library"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Ma bibliothèque
        </Link>
        {match && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            disabled={isDeleting}
            onClick={() => { if (confirm('Supprimer ce match de votre bibliothèque ?')) deleteMatch(); }}
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Supprimer
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError || !match ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="font-medium">Match introuvable</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/match-library">Retour à la bibliothèque</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-semibold truncate">
              {match.home_team} vs {match.away_team}
            </span>
            {match.competition && (
              <>
                <span className="text-muted-foreground">·</span>
                <LeagueLogo league={match.competition} size="xs" />
                <span className="text-xs text-muted-foreground truncate">{match.competition}</span>
              </>
            )}
          </div>

          {/* Tabs */}
          <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)}>
            <TabsList className="rounded-xl w-full">
              <TabsTrigger value="info" className="flex-1 rounded-lg gap-1.5">
                <Trophy className="w-3.5 h-3.5" />
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
              <MatchInfoTab match={match} />
            </TabsContent>

            <TabsContent value="notes" className="mt-4">
              <NotesTab matchId={match.id} initialNotes={match.rich_notes} />
            </TabsContent>

            <TabsContent value="files" className="mt-4">
              <FilesTab matchId={match.id} files={files} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
