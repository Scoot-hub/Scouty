import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import {
  Upload, FileSpreadsheet, X, AlertCircle, CheckCircle2, Lock,
  ArrowRight, Loader2, RefreshCw, ChevronDown, ChevronUp, Info,
  Users, Zap, ShieldCheck, Download,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useMyPermissions, useIsAdmin } from '@/hooks/use-admin';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ImportPlayersDialog } from '@/components/ImportPlayersDialog';

// ── Wyscout column signatures ────────────────────────────────────────────────
const WYSCOUT_REQUIRED = ['Player', 'Team', 'Position', 'xG', 'Duels per 90'];

// Field mapping: bio fields → players table, stats → player_wyscout_stats table
const WYSCOUT_FIELD_MAP: { excel: string; db: string; table: string; label: string }[] = [
  // Bio → players
  { excel: 'Player',               db: 'name',                    table: 'players',              label: 'Nom du joueur' },
  { excel: 'Team',                 db: 'club',                    table: 'players',              label: 'Club actuel' },
  { excel: 'Team within selected timeframe', db: 'wyscout_team_in_timeframe', table: 'players', label: 'Club sur la période' },
  { excel: 'Position',             db: 'position',                table: 'players',              label: 'Poste (mappé)' },
  { excel: 'Age',                  db: 'generation',              table: 'players',              label: 'Âge → Année naissance' },
  { excel: 'Birth country',        db: 'nationality',             table: 'players',              label: 'Nationalité' },
  { excel: 'Passport country',     db: 'passport_country',        table: 'players',              label: '2ème nationalité' },
  { excel: 'Foot',                 db: 'foot',                    table: 'players',              label: 'Pied (Gaucher/Droitier/Ambidextre)' },
  { excel: 'Height',               db: 'height',                  table: 'players',              label: 'Taille (cm)' },
  { excel: 'Weight',               db: 'weight',                  table: 'players',              label: 'Poids (kg)' },
  { excel: 'Market value',         db: 'market_value',            table: 'players',              label: 'Valeur marchande (formatée)' },
  { excel: 'Contract expires',     db: 'contract_end',            table: 'players',              label: 'Fin de contrat (date)' },
  { excel: 'On loan',              db: 'on_loan',                 table: 'players',              label: 'En prêt (0/1)' },
  // Meta → player_wyscout_stats
  { excel: 'season',               db: 'season',                  table: 'wyscout_stats',        label: 'Saison (ex: 23/24)' },
  { excel: 'division',             db: 'division',                table: 'wyscout_stats',        label: 'Division (D1, D2…)' },
  { excel: 'continent',            db: 'continent',               table: 'wyscout_stats',        label: 'Continent' },
  { excel: 'country',              db: 'country',                 table: 'wyscout_stats',        label: 'Pays du championnat' },
  { excel: 'year_start',           db: 'year_start',              table: 'wyscout_stats',        label: 'Année début saison' },
  { excel: 'year_end',             db: 'year_end',                table: 'wyscout_stats',        label: 'Année fin saison' },
  { excel: 'filename',             db: 'source_filename',         table: 'wyscout_stats',        label: 'Fichier source' },
  // Stats counting → player_wyscout_stats
  { excel: 'Matches played',       db: 'matches_played',          table: 'wyscout_stats',        label: 'Matchs joués' },
  { excel: 'Minutes played',       db: 'minutes_played',          table: 'wyscout_stats',        label: 'Minutes jouées' },
  { excel: 'Goals',                db: 'goals',                   table: 'wyscout_stats',        label: 'Buts' },
  { excel: 'xG',                   db: 'xg',                      table: 'wyscout_stats',        label: 'xG (buts attendus)' },
  { excel: 'Assists',              db: 'assists',                 table: 'wyscout_stats',        label: 'Passes décisives' },
  { excel: 'xA',                   db: 'xa',                      table: 'wyscout_stats',        label: 'xA (assists attendus)' },
  { excel: 'Yellow cards',         db: 'yellow_cards',            table: 'wyscout_stats',        label: 'Cartons jaunes' },
  { excel: 'Red cards',            db: 'red_cards',               table: 'wyscout_stats',        label: 'Cartons rouges' },
  { excel: 'Shots',                db: 'shots',                   table: 'wyscout_stats',        label: 'Tirs totaux' },
  { excel: 'Non-penalty goals',    db: 'np_goals',                table: 'wyscout_stats',        label: 'Buts hors penalty' },
  { excel: 'Head goals',           db: 'head_goals',              table: 'wyscout_stats',        label: 'Buts de la tête' },
  { excel: 'Clean sheets',         db: 'clean_sheets',            table: 'wyscout_stats',        label: 'Clean sheets (GK)' },
  { excel: 'Penalties taken',      db: 'penalties_taken',         table: 'wyscout_stats',        label: 'Penaltys tirés' },
  // Per-90 stats → player_wyscout_stats (sample shown)
  { excel: 'Duels per 90',         db: 'duels_per90',             table: 'wyscout_stats',        label: 'Duels par 90' },
  { excel: 'Interceptions per 90', db: 'interceptions_per90',     table: 'wyscout_stats',        label: 'Interceptions par 90' },
  { excel: 'PAdj Interceptions',   db: 'padj_interceptions',      table: 'wyscout_stats',        label: 'Interceptions PAdj' },
  { excel: 'Goals per 90',         db: 'goals_per90',             table: 'wyscout_stats',        label: 'Buts par 90' },
  { excel: 'xG per 90',            db: 'xg_per90',                table: 'wyscout_stats',        label: 'xG par 90' },
  { excel: 'Passes per 90',        db: 'passes_per90',            table: 'wyscout_stats',        label: 'Passes par 90' },
  { excel: 'Progressive passes per 90', db: 'progressive_passes_per90', table: 'wyscout_stats', label: 'Passes progressives par 90' },
  { excel: 'Key passes per 90',    db: 'key_passes_per90',        table: 'wyscout_stats',        label: 'Passes clés par 90' },
  { excel: 'Dribbles per 90',      db: 'dribbles_per90',          table: 'wyscout_stats',        label: 'Dribbles par 90' },
  { excel: 'Max Speed (km/h)',      db: 'max_speed',               table: 'wyscout_stats',        label: 'Vitesse max (km/h)' },
  { excel: 'Save rate, %',          db: 'save_rate_pct',           table: 'wyscout_stats',        label: '% arrêts (GK)' },
  { excel: '(+ 90 autres stats per 90…)', db: '…', table: 'wyscout_stats', label: 'Toutes les stats Wyscout' },
];

type Step = 'upload' | 'preview' | 'importing' | 'done';

interface ImportResult {
  created: number;
  updated: number;
  errors: { name: string; error: string }[];
  total: number;
}

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

// ── Template Excel standard ──────────────────────────────────────────────────
// Colonnes dans l'ordre attendu par l'import, avec noms que le fuzzy-matcher reconnaît
const TEMPLATE_COLUMNS: { header: string; example: string; comment: string }[] = [
  { header: 'Joueur',            example: 'Kylian Mbappé',     comment: 'Nom complet du joueur (obligatoire)' },
  { header: 'Année naissance',   example: '2000',              comment: 'Année de naissance (ex: 1998) ou âge' },
  { header: 'Nationalité',       example: 'France',            comment: 'Pays de nationalité' },
  { header: 'Pied',              example: 'Droitier',          comment: 'Droitier | Gaucher | Ambidextre' },
  { header: 'Club',              example: 'Real Madrid',       comment: 'Club actuel' },
  { header: 'Championnat',       example: 'Liga',              comment: 'Nom du championnat / ligue' },
  { header: 'Zone',              example: 'Europe',            comment: 'Zone géographique' },
  { header: 'Poste',             example: 'ATT',               comment: 'GK | DC | LD | LG | MDef | MC | MO | AD | AG | ATT' },
  { header: 'Poste secondaire',  example: 'AD',                comment: 'Poste secondaire (même valeurs)' },
  { header: 'Rôle',              example: 'Avant-centre',      comment: 'Description libre du profil' },
  { header: 'Niveau actuel',     example: '7',                 comment: 'Note actuelle sur 10' },
  { header: 'Potentiel',         example: '9',                 comment: 'Potentiel estimé sur 10' },
  { header: 'Avis général',      example: 'À suivre',          comment: 'À suivre | À revoir | Défavorable' },
  { header: 'Fin de contrat',    example: '2026',              comment: 'Année, date (jj/mm/aaaa) ou vide' },
  { header: 'Notes',             example: 'Excellent pressing',comment: 'Commentaires libres' },
  { header: 'TS Report ?',       example: 'Non',               comment: 'Rapport publié : Oui | Non' },
  { header: 'Avis 1',            example: 'À suivre',          comment: 'Avis scout 1 (À suivre | À revoir | Défavorable)' },
  { header: 'Rapport 1',         example: 'https://drive.google.com/…', comment: 'Lien Google Drive ou titre du rapport 1' },
  { header: 'Avis 2',            example: '',                  comment: 'Avis scout 2' },
  { header: 'Rapport 2',         example: '',                  comment: 'Lien ou titre rapport 2' },
  { header: 'Avis 3',            example: '',                  comment: 'Avis scout 3' },
  { header: 'Rapport 3',         example: '',                  comment: 'Lien ou titre rapport 3' },
];

function downloadImportTemplate() {
  const wb = XLSX.utils.book_new();

  // ── Feuille 1 : Modèle à remplir ──
  const headers = TEMPLATE_COLUMNS.map(c => c.header);
  const examples = TEMPLATE_COLUMNS.map(c => c.example);
  const comments = TEMPLATE_COLUMNS.map(c => c.comment);

  const ws = XLSX.utils.aoa_to_sheet([headers, examples]);

  // Style header row : fond coloré + gras (largeurs de colonnes)
  ws['!cols'] = TEMPLATE_COLUMNS.map(c => ({ wch: Math.max(c.header.length, c.example.length, 18) }));

  // Freeze first row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  // Add comment row as row 3 (grey hint)
  XLSX.utils.sheet_add_aoa(ws, [comments], { origin: 'A3' });

  XLSX.utils.book_append_sheet(wb, ws, 'Modèle import');

  // ── Feuille 2 : Valeurs autorisées ──
  const refData = [
    ['Champ', 'Valeurs autorisées'],
    ['Pied', 'Droitier · Gaucher · Ambidextre'],
    ['Poste / Poste secondaire', 'GK · DC · LD · LG · MDef · MC · MO · AD · AG · ATT'],
    ['Avis général / Avis 1-3', 'À suivre · À revoir · Défavorable'],
    ['TS Report ?', 'Oui · Non · 1 · 0'],
    ['Niveau actuel', 'Nombre entre 0 et 10'],
    ['Potentiel', 'Nombre entre 0 et 10'],
    ['Année naissance', 'Année (ex: 2001) ou âge (ex: 23)'],
    ['Fin de contrat', "Année (2026), date (30/06/2026) ou format Excel"],
  ];
  const wsRef = XLSX.utils.aoa_to_sheet(refData);
  wsRef['!cols'] = [{ wch: 30 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsRef, 'Valeurs autorisées');

  XLSX.writeFile(wb, 'modele_import_joueurs.xlsx');
}

export default function DataImport() {
  const { t } = useTranslation();
  const { data: isAdmin } = useIsAdmin();
  const { data: permsData } = useMyPermissions();
  const diPerms = permsData?.permissions?.data_import as Record<string, boolean> | undefined;
  const hasAccess = isAdmin || diPerms?.view !== false;
  const canImport = isAdmin || diPerms?.import !== false;

  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [sheetName, setSheetName] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [isWyscout, setIsWyscout] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [showMapping, setShowMapping] = useState(false);

  const SIZE_HARD_LIMIT_MB = 20;  // block before even reading
  const SIZE_WARN_MB = 2;
  const ROW_WARN = 10_000;
  const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

  // ── File parsing ─────────────────────────────────────────────────────────
  const processFile = (file: File) => {
    setError('');
    setFileSize(file.size);

    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError(t('data_import.error_format'));
      return;
    }

    // Hard block before even reading the file
    const fileMB = file.size / 1024 / 1024;
    if (fileMB > SIZE_HARD_LIMIT_MB) {
      setError(
        `Fichier trop volumineux (${formatMB(file.size)} Mo). ` +
        `Limite : ${SIZE_HARD_LIMIT_MB} Mo. ` +
        `Découpez le fichier en plusieurs parties de moins de ${SIZE_HARD_LIMIT_MB} Mo.`
      );
      return;
    }

    setFileName(file.name);
    setOriginalFile(file);

    // Read only for preview — the actual import sends the raw file
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        const firstSheet = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheet];
        const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        if (!parsed.length) { setError('Le fichier est vide.'); return; }
        const headers = Object.keys(parsed[0]);
        const wyscout = WYSCOUT_REQUIRED.every(h => headers.includes(h));
        setRows(parsed);
        setSheetName(firstSheet);
        setIsWyscout(wyscout);
        setStep('preview');
      } catch {
        setError(t('data_import.error_parse'));
      }
    };
    reader.readAsBinaryString(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, []);

  const reset = () => {
    setStep('upload');
    setRows([]);
    setOriginalFile(null);
    setFileName('');
    setFileSize(0);
    setError('');
    setResult(null);
    setShowErrors(false);
  };

  // ── Import submission ────────────────────────────────────────────────────
  const IMPORT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max

  const handleImport = async () => {
    if (!canImport) {
      toast.error("Vous n'avez pas la permission d'importer.");
      return;
    }
    if (!originalFile) {
      toast.error('Fichier introuvable. Veuillez recharger le fichier.');
      return;
    }
    setStep('importing');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS);

    try {
      const formData = new FormData();
      formData.append('file', originalFile, originalFile.name);

      let res: Response;
      try {
        res = await fetch(`${API}/import/wyscout`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
          signal: controller.signal,
        });
      } catch (fetchErr: unknown) {
        // Translate low-level network errors into actionable messages
        if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError')
          throw new Error(`Import annulé : délai dépassé (${IMPORT_TIMEOUT_MS / 60000} min). Le fichier est peut-être trop volumineux ou le serveur est surchargé.`);
        const isOffline = !navigator.onLine;
        throw new Error(
          isOffline
            ? 'Impossible de joindre le serveur : vérifiez votre connexion réseau.'
            : `Impossible de joindre le serveur d'import. Causes possibles :\n` +
              `• Le serveur n'est pas démarré (npm run api)\n` +
              `• Le proxy Vite a expiré (redémarrez le serveur de dev)\n` +
              `• Erreur réseau (${(fetchErr as Error)?.message ?? 'Unknown'})`
        );
      }

      // Guard against HTML error pages (413, 502, nginx errors...)
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        const statusMsg =
          res.status === 413 ? 'Fichier trop volumineux pour le serveur (limite 25 Mo). Découpez le fichier en plusieurs parties.'
          : res.status === 403 ? 'Accès refusé. Rôle importateur requis.'
          : res.status === 502 ? 'Le serveur a dépassé le timeout (502). Réessayez avec un fichier plus petit (< 5 000 lignes).'
          : res.status === 504 ? 'Timeout du serveur (504). Le fichier est trop grand pour un seul import.'
          : `Erreur serveur HTTP ${res.status}.`;
        throw new Error(`${statusMsg}\n\nDétail : ${text.slice(0, 300).replace(/<[^>]+>/g, '').trim()}`);
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erreur serveur (${res.status})`);

      setResult(data);
      setStep('done');
      if (!data.errors?.length) {
        toast.success(`Import terminé : ${data.created} créés, ${data.updated} mis à jour.`);
      } else {
        toast.warning(`Import terminé avec ${data.errors.length} erreur(s).`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(msg);
      setStep('preview');
      toast.error(msg.split('\n')[0]); // show first line in toast, full in card
    } finally {
      clearTimeout(timer);
    }
  };

  // ── Access guard ─────────────────────────────────────────────────────────
  if (permsData && !hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <Lock className="w-7 h-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-bold">{t('data_import.access_denied_title')}</h2>
          <p className="text-muted-foreground text-sm mt-1 max-w-sm">{t('data_import.access_denied_desc')}</p>
        </div>
        <Link to="/players"><Button variant="outline">{t('common.back_to_players')}</Button></Link>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{t('data_import.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('data_import.subtitle')}</p>
        </div>
      </div>

      {/* ── Section 1 : Import standard (accessible à tous) ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center">
            <Users className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Import standard</h2>
            <p className="text-xs text-muted-foreground">Accessible à tous les utilisateurs autorisés</p>
          </div>
        </div>

        <Card className="border-green-200/60 dark:border-green-800/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              Import de joueurs depuis votre fichier
            </CardTitle>
            <CardDescription className="text-xs">
              Importez vos joueurs depuis n'importe quel fichier Excel ou CSV. Le système détecte automatiquement les colonnes et vous permet d'ajuster la correspondance avant d'importer.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-muted/40 border border-dashed">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Votre fichier Excel / CSV</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Colonnes détectées automatiquement · Correspondance personnalisable · Champs custom supportés · Rapports inclus
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-xl border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/20"
                  onClick={downloadImportTemplate}
                >
                  <Download className="w-4 h-4" />
                  Télécharger le modèle
                </Button>
                <ImportPlayersDialog />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Section 2 : Import Wyscout Pro ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              Import Wyscout
              <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">PRO</Badge>
            </h2>
            <p className="text-xs text-muted-foreground">Réservé aux importateurs qualifiés de données publiques</p>
          </div>
        </div>

        {!canImport ? (
          <Card className="border-muted">
            <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Lock className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Accès réservé</p>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                  Cette section nécessite la permission <code className="bg-muted px-1 rounded text-[10px]">data_import:import</code>. Contactez votre administrateur pour obtenir l'accès.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {step !== 'upload' && (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="font-mono">{fileName}</Badge>
                {fileSize > 0 && (
                  <Badge variant={fileSize > SIZE_WARN_MB * 1024 * 1024 ? 'outline' : 'secondary'}
                    className={fileSize > 10 * 1024 * 1024 ? 'border-orange-400 text-orange-600' : fileSize > SIZE_WARN_MB * 1024 * 1024 ? 'border-amber-400 text-amber-600' : ''}>
                    {formatMB(fileSize)} Mo
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={reset} className="ml-auto">
                  <X className="w-4 h-4 mr-1" />
                  {t('data_import.change_file')}
                </Button>
              </div>
            )}

      {/* Step 1 — Upload */}
      {step === 'upload' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* Source info */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Format supporté : export <strong>Wyscout</strong> (Hudl). Le fichier doit contenir les colonnes
                <code className="mx-1 px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-[10px]">Player</code>,
                <code className="mx-1 px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-[10px]">Team</code>,
                <code className="mx-1 px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-[10px]">xG</code>,
                <code className="mx-1 px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-[10px]">Duels per 90</code>…
              </p>
            </div>

            {/* Drop zone */}
            <label
              htmlFor="excel-upload"
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-xl p-12 cursor-pointer transition-colors',
                dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/30'
              )}
            >
              <Upload className="w-10 h-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">{t('data_import.drop_label')}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('data_import.drop_hint')}</p>
              </div>
              <Button type="button" variant="outline" size="sm" asChild>
                <span>{t('data_import.browse')}</span>
              </Button>
              <input id="excel-upload" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-destructive/8 border border-destructive/20 p-3 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{error}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2 — Preview + mapping */}
      {step === 'preview' && (
        <>
          {/* Format detection badge */}
          <div className="flex items-center gap-3 flex-wrap">
            {isWyscout ? (
              <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Format Wyscout détecté
              </Badge>
            ) : (
              <Badge variant="destructive">
                <AlertCircle className="w-3.5 h-3.5 mr-1" />
                Format non reconnu — colonnes Wyscout manquantes
              </Badge>
            )}
            <Badge variant="secondary">{rows.length} joueur{rows.length > 1 ? 's' : ''}</Badge>
            <Badge variant="secondary">{sheetName}</Badge>
          </div>

          {!isWyscout && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Ce fichier ne correspond pas au format Wyscout attendu. Vérifiez que les colonnes
                <code className="mx-1 px-1 py-0.5 bg-destructive/10 rounded text-[11px]">Player</code>,
                <code className="mx-1 px-1 py-0.5 bg-destructive/10 rounded text-[11px]">Team</code>,
                <code className="mx-1 px-1 py-0.5 bg-destructive/10 rounded text-[11px]">xG</code>,
                <code className="mx-1 px-1 py-0.5 bg-destructive/10 rounded text-[11px]">Duels per 90</code> sont présentes.
              </span>
            </div>
          )}

          {/* ── Avertissements taille / volume ── */}
          {fileSize > SIZE_WARN_MB * 1024 * 1024 && fileSize <= 10 * 1024 * 1024 && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700/50 text-sm text-amber-800 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <span>
                <strong>Fichier volumineux ({formatMB(fileSize)} Mo).</strong>{' '}
                L'upload et le traitement peuvent prendre quelques minutes.
              </span>
            </div>
          )}

          {fileSize > 10 * 1024 * 1024 && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-400 dark:border-orange-600/50 text-sm text-orange-900 dark:text-orange-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-orange-500" />
              <div>
                <p className="font-semibold">Fichier très volumineux ({formatMB(fileSize)} Mo — {rows.length.toLocaleString('fr-FR')} joueurs)</p>
                <p className="mt-0.5">L'import peut prendre plusieurs minutes. Patientez sans fermer la page.</p>
              </div>
            </div>
          )}

          {rows.length > ROW_WARN && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700/50 text-sm text-amber-800 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <span>
                <strong>{rows.length.toLocaleString('fr-FR')} joueurs détectés.</strong>{' '}
                Au-delà de {ROW_WARN.toLocaleString('fr-FR')} lignes, l'import peut prendre plusieurs minutes.
              </span>
            </div>
          )}

          {/* Mapping table (collapsible) */}
          <Card>
            <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowMapping(m => !m)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-primary" />
                  Correspondance des colonnes
                </CardTitle>
                {showMapping ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
              {!showMapping && <CardDescription className="text-xs">Cliquez pour voir comment les colonnes Excel sont mappées aux champs Scouty</CardDescription>}
            </CardHeader>
            {showMapping && (
              <CardContent>
                <div className="overflow-auto rounded-lg border">
                  <table className="text-xs w-full">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium border-b">Colonne Excel (Wyscout)</th>
                        <th className="text-left px-3 py-2 font-medium border-b">Table DB</th>
                        <th className="text-left px-3 py-2 font-medium border-b">Champ</th>
                        <th className="text-left px-3 py-2 font-medium border-b">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {WYSCOUT_FIELD_MAP.map(({ excel, db, table, label }) => {
                        const exists = excel.startsWith('(') || (rows[0] && Object.keys(rows[0]).includes(excel));
                        return (
                          <tr key={`${table}-${db}`} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-3 py-1.5 font-mono whitespace-nowrap">{excel}</td>
                            <td className="px-3 py-1.5">
                              <Badge variant={table === 'players' ? 'default' : 'secondary'} className="text-[9px] px-1 py-0 h-4">
                                {table === 'players' ? 'players' : 'wyscout_stats'}
                              </Badge>
                            </td>
                            <td className="px-3 py-1.5">
                              <code className="bg-muted px-1 py-0.5 rounded text-[10px]">{db}</code>
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground flex items-center gap-1.5 whitespace-nowrap">
                              {exists
                                ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                                : <AlertCircle className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                              }
                              {label}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Preview table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('data_import.preview_title')}</CardTitle>
              <CardDescription>
                Aperçu des {Math.min(rows.length, 10)} premières lignes sur {rows.length}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-[360px] rounded-lg border text-xs">
                <table className="w-full">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      {['Player', 'Team', 'Position', 'Age', 'Birth country', 'Foot', 'Market value', 'xG', 'season', 'division'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap border-b">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((row, ri) => (
                      <tr key={ri} className="border-b last:border-0 hover:bg-muted/30">
                        {['Player', 'Team', 'Position', 'Age', 'Birth country', 'Foot', 'Market value', 'xG', 'season', 'division'].map(h => (
                          <td key={h} className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{String(row[h] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleImport}
              disabled={!isWyscout || !canImport}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              Importer {rows.length} joueur{rows.length > 1 ? 's' : ''}
            </Button>
            {!canImport && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Permission <code className="bg-muted px-1 rounded">data_import:import</code> requise
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </>
      )}

      {/* Step 3 — Importing */}
      {step === 'importing' && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <div>
              <p className="font-semibold text-lg">Import en cours…</p>
              <p className="text-sm text-muted-foreground mt-1">
                Traitement de {rows.length} joueur{rows.length > 1 ? 's' : ''}, veuillez patienter.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4 — Done */}
      {step === 'done' && result && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold text-primary">{result.total}</p>
              <p className="text-xs text-muted-foreground mt-1">Lignes traitées</p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{result.created}</p>
              <p className="text-xs text-muted-foreground mt-1">Joueurs créés</p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{result.updated}</p>
              <p className="text-xs text-muted-foreground mt-1">Joueurs mis à jour</p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className={cn("text-2xl font-bold", result.errors.length > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                {result.errors.length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Erreurs</p>
            </div>
          </div>

          {/* Success/warning message */}
          <div className={cn(
            "flex items-center gap-3 p-4 rounded-xl border",
            result.errors.length === 0
              ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/40"
              : "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40"
          )}>
            {result.errors.length === 0
              ? <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
              : <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
            }
            <p className={cn(
              "text-sm font-medium",
              result.errors.length === 0 ? "text-green-700 dark:text-green-300" : "text-yellow-700 dark:text-yellow-300"
            )}>
              {result.errors.length === 0
                ? `Import réussi : ${result.created} joueur${result.created > 1 ? 's' : ''} créé${result.created > 1 ? 's' : ''}, ${result.updated} mis à jour.`
                : `Import terminé avec ${result.errors.length} erreur${result.errors.length > 1 ? 's' : ''}.`
              }
            </p>
          </div>

          {/* Errors list (collapsible) */}
          {result.errors.length > 0 && (
            <Card className="border-destructive/20">
              <CardHeader
                className="pb-2 cursor-pointer"
                onClick={() => setShowErrors(e => !e)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-destructive flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {result.errors.length} erreur{result.errors.length > 1 ? 's' : ''}
                  </CardTitle>
                  {showErrors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </CardHeader>
              {showErrors && (
                <CardContent>
                  <div className="rounded-lg border divide-y max-h-60 overflow-auto text-xs">
                    {result.errors.map((e, i) => (
                      <div key={i} className="px-3 py-2 flex items-start gap-2">
                        <span className="font-medium shrink-0">{e.name}</span>
                        <span className="text-muted-foreground">{e.error}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={reset} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Nouvel import
            </Button>
            <Link to="/players">
              <Button className="gap-2">
                Voir les joueurs
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </>
      )}
          </>
        )}
      </div>
    </div>
  );
}
