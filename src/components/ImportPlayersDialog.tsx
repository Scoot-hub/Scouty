import { useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useImportPlayers, usePlayers } from '@/hooks/use-players';
import { useCustomFields, useCreateCustomField, useBulkUpsertCustomFieldValues } from '@/hooks/use-custom-fields';
import { type Opinion, type Position, type Foot, POSITIONS } from '@/types/player';
import { Upload, FileSpreadsheet, Check, AlertTriangle, X, ArrowRight, Columns, Search, Filter, Eye, EyeOff, ChevronDown, ChevronUp, Plus, Link as LinkIcon, Type, Hash, ToggleLeft } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface RawRow {
  [key: string]: string | number | undefined;
}

interface ParsedPlayer {
  name: string;
  generation: number;
  nationality: string;
  foot: Foot;
  club: string;
  league: string;
  zone: string;
  position: Position;
  role?: string;
  current_level: number;
  potential: number;
  general_opinion: Opinion;
  contract_end?: string;
  notes?: string;
  ts_report_published: boolean;
  reports: { opinion: Opinion; drive_link?: string; title?: string }[];
  customValues: Record<string, string>; // custom_field_id -> value
  valid: boolean;
  errors: string[];
}

// All known target fields
const TARGET_FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'Nom du joueur' },
  { key: 'generation', label: 'Génération / Année' },
  { key: 'nationality', label: 'Nationalité' },
  { key: 'foot', label: 'Pied' },
  { key: 'club', label: 'Club' },
  { key: 'league', label: 'Championnat' },
  { key: 'zone', label: 'Zone' },
  { key: 'position', label: 'Poste' },
  { key: 'role', label: 'Type de joueur' },
  { key: 'current_level', label: 'Niveau' },
  { key: 'potential', label: 'Potentiel' },
  { key: 'general_opinion', label: 'Avis général' },
  { key: 'contract_end', label: 'Fin de contrat' },
  { key: 'notes', label: 'Notes' },
  { key: 'ts_report_published', label: 'TS Report publié' },
  { key: 'position_secondaire', label: 'Poste secondaire' },
  { key: 'opinion_1', label: 'Avis rapport 1' },
  { key: 'opinion_2', label: 'Avis rapport 2' },
  { key: 'opinion_3', label: 'Avis rapport 3' },
  { key: 'opinion_4', label: 'Avis rapport 4' },
  { key: 'opinion_5', label: 'Avis rapport 5' },
  { key: 'report_1', label: 'Rapport 1' },
  { key: 'report_2', label: 'Rapport 2' },
  { key: 'report_3', label: 'Rapport 3' },
  { key: 'report_4', label: 'Rapport 4' },
  { key: 'report_5', label: 'Rapport 5' },
];

// Keywords that suggest a mapping to a target field (fuzzy matching)
const FIELD_KEYWORDS: Record<string, string[]> = {
  name: ['joueur', 'nom', 'player', 'name', 'prenom', 'prénom', 'identite', 'identité'],
  generation: ['géné', 'gene', 'génération', 'generation', 'année', 'annee', 'naissance', 'born', 'year', 'âge', 'age', 'ddn', 'date de naissance'],
  nationality: ['nationalité', 'nationality', 'nat', 'pays', 'country', 'origine'],
  foot: ['pied', 'foot', 'feet', 'lateralite', 'latéralité'],
  club: ['club', 'equipe', 'équipe', 'team'],
  league: ['championnat', 'league', 'ligue', 'division', 'compétition', 'competition'],
  zone: ['zone', 'secteur'],
  position: ['poste', 'position', 'pos'],
  role: ['rôle', 'role', 'type', 'profil', 'style'],
  current_level: ['niveau', 'level', 'niv', 'note', 'eval', 'éval', 'evaluation', 'évaluation', 'note actuelle', 'note niveau', 'note /10', 'note/10', 'rating', 'current_level', 'current level'],
  potential: ['potentiel', 'pot', 'potential', 'plafond', 'pot.', 'projection', 'potential_level', 'potential level'],
  general_opinion: ['avis', 'opinion', 'verdict', 'conclusion', 'sentiment', 'avis general', 'avis général'],
  contract_end: ['fdc', 'fin de contrat', 'fin contrat', 'contract', 'contrat', 'expiration', 'echeance', 'échéance', 'contract end', 'contract_end', 'date fin contrat', 'date contrat'],
  notes: ['notes', 'commentaire', 'commentaires', 'remarque', 'remarques', 'observation', 'observations'],
  ts_report_published: ['ts report', 'ts report ?', 'ts report?', 'ts', 'rapport ts', 'publié', 'published'],
  position_secondaire: ['poste secondaire', 'position secondaire', 'second poste', 'pos2', 'poste 2'],
  opinion_1: ['avis 1', 'opinion 1', 'avis1'],
  opinion_2: ['avis 2', 'opinion 2', 'avis2'],
  opinion_3: ['avis 3', 'opinion 3', 'avis3'],
  opinion_4: ['avis 4', 'opinion 4', 'avis4'],
  opinion_5: ['avis 5', 'opinion 5', 'avis5'],
  report_1: ['rapport 1', 'report 1', 'rapport1', 'lien 1', 'lien1', 'last rapport', 'dernier rapport'],
  report_2: ['rapport 2', 'report 2', 'rapport2', 'lien 2', 'lien2'],
  report_3: ['rapport 3', 'report 3', 'rapport3', 'lien 3', 'lien3'],
  report_4: ['rapport 4', 'report 4', 'rapport4', 'lien 4', 'lien4'],
  report_5: ['rapport 5', 'report 5', 'rapport5', 'lien 5', 'lien5', 'rapport 4 2', 'avis 4 2'],
};

const POSITION_MAP: Record<string, Position> = {
  'gk': 'GK', 'gardien': 'GK', 'goalkeeper': 'GK', 'g': 'GK', 'goal': 'GK',
  'dc': 'DC', 'cb': 'DC', 'defenseur central': 'DC', 'défenseur central': 'DC', 'central': 'DC', 'def central': 'DC', 'défenseur': 'DC', 'defenseur': 'DC',
  'ld': 'LD', 'rb': 'LD', 'lateral droit': 'LD', 'latéral droit': 'LD', 'arriere droit': 'LD', 'arrière droit': 'LD',
  'lg': 'LG', 'lb': 'LG', 'lateral gauche': 'LG', 'latéral gauche': 'LG', 'arriere gauche': 'LG', 'arrière gauche': 'LG',
  'mdef': 'MDef', 'dm': 'MDef', 'cdm': 'MDef', 'milieu defensif': 'MDef', 'milieu défensif': 'MDef', 'sentinelle': 'MDef', 'md': 'MDef', '6': 'MDef',
  'mc': 'MC', 'cm': 'MC', 'milieu central': 'MC', 'milieu': 'MC', '8': 'MC', 'relayeur': 'MC',
  'mo': 'MO', 'cam': 'MO', 'am': 'MO', 'milieu offensif': 'MO', 'meneur': 'MO', '10': 'MO', 'meneur de jeu': 'MO', 'numero 10': 'MO',
  'ad': 'AD', 'rw': 'AD', 'ailier droit': 'AD',
  'ag': 'AG', 'lw': 'AG', 'ailier gauche': 'AG',
  'att': 'ATT', 'st': 'ATT', 'cf': 'ATT', 'attaquant': 'ATT', 'avant-centre': 'ATT', 'avant centre': 'ATT', 'buteur': 'ATT', '9': 'ATT',
};

const OPINION_MAP: Record<string, Opinion> = {
  'à suivre': 'À suivre', 'a suivre': 'À suivre', 'suivre': 'À suivre', 'favorable': 'À suivre', 'positif': 'À suivre',
  'à revoir': 'À revoir', 'a revoir': 'À revoir', 'revoir': 'À revoir', 'neutre': 'À revoir',
  'défavorable': 'Défavorable', 'defavorable': 'Défavorable', 'négatif': 'Défavorable', 'negatif': 'Défavorable',
};

const FOOT_MAP: Record<string, Foot> = {
  'gauche': 'Gaucher', 'g': 'Gaucher', 'left': 'Gaucher', 'l': 'Gaucher', 'gaucher': 'Gaucher',
  'droit': 'Droitier', 'd': 'Droitier', 'right': 'Droitier', 'r': 'Droitier', 'droitier': 'Droitier',
  'deux pieds': 'Ambidextre', 'deux': 'Ambidextre', 'both': 'Ambidextre', 'ambidextre': 'Ambidextre',
};

function normalizeStr(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00A0\u2007\u202F\u200B]/g, ' ')
    .toLowerCase()
    .replace(/[?!]/g, '')
    .trim();
}

function scoreFieldBySamples(field: string, samples: (string | number | undefined)[]): number {
  const normalizedSamples = samples
    .filter(v => v !== undefined && String(v).trim() !== '')
    .map(v => String(v).trim());

  if (normalizedSamples.length === 0) return 0;

  const numericValues = normalizedSamples
    .map(v => Number(String(v).replace(',', '.').replace(/[^0-9.-]/g, '')))
    .filter(v => !Number.isNaN(v));

  const numericRatio = numericValues.length / normalizedSamples.length;
  const avgNumeric = numericValues.length
    ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length
    : 0;

  const dateLikeRatio = normalizedSamples.filter(v =>
    /^\d{4}$/.test(v) ||
    /^\d{1,2}[\/.-]\d{4}$/.test(v) ||
    /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(v) ||
    /^\d{5}(\.\d+)?$/.test(v) ||
    /\b(jan|f[eé]v|mar|avr|mai|jun|jui|ao[uû]|sep|oct|nov|d[eé]c)\w*\s+\d{4}\b/i.test(v)
  ).length / normalizedSamples.length;

  if (field === 'current_level') {
    const inRatingRange = numericValues.filter(v => v >= 0 && v <= 10).length;
    return numericRatio * 3 + (inRatingRange / Math.max(numericValues.length, 1)) * 2;
  }

  if (field === 'potential') {
    const inPotentialRange = numericValues.filter(v => v >= 0 && v <= 20).length;
    return numericRatio * 3 + (inPotentialRange / Math.max(numericValues.length, 1)) * 1.5 + (avgNumeric >= 5 ? 0.5 : 0);
  }

  if (field === 'contract_end') {
    return dateLikeRatio * 4 + (numericRatio < 0.9 ? 0.5 : 0);
  }

  if (field === 'notes') {
    const longTextRatio = normalizedSamples.filter(v => v.length >= 12).length / normalizedSamples.length;
    return longTextRatio * 2 + (1 - numericRatio);
  }

  return 0;
}

/** Fuzzy-match a raw column header to a target field key */
function guessField(rawHeader: string, samples: (string | number | undefined)[] = []): string | null {
  const norm = normalizeStr(rawHeader)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!norm) return null;

  // Strong explicit aliases first
  if (/(^|\s)current level(\s|$)|niveau actuel|note actuelle|note niveau|rating/.test(norm)) return 'current_level';
  if (/(^|\s)potential(\s|$)|potentiel|plafond|projection/.test(norm)) return 'potential';
  if (/(^|\s)contract end(\s|$)|fin de contrat|fin contrat|echeance|échéance|expiration/.test(norm)) return 'contract_end';

  // Try exact keyword match first
  for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
    for (const kw of keywords) {
      if (norm === normalizeStr(kw).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()) return field;
    }
  }

  const allEntries = Object.entries(FIELD_KEYWORDS)
    .flatMap(([field, keywords]) => keywords.map(kw => ({ field, kw: normalizeStr(kw).replace(/[_-]+/g, ' ').trim() })))
    .sort((a, b) => b.kw.length - a.kw.length);

  const candidates = new Set<string>();

  for (const { field, kw } of allEntries) {
    if (kw.length >= 3 && norm.includes(kw)) candidates.add(field);
  }

  for (const { field, kw } of allEntries) {
    if (kw.length >= 3 && norm.startsWith(kw)) candidates.add(field);
  }

  if (candidates.size === 0) return null;
  if (candidates.size === 1) return [...candidates][0];

  return [...candidates]
    .map(field => ({ field, score: scoreFieldBySamples(field, samples) }))
    .sort((a, b) => b.score - a.score)[0]?.field ?? null;
}

function parseOpinion(val: string | number | undefined): Opinion | null {
  if (!val) return null;
  const key = String(val).trim().toLowerCase();
  return OPINION_MAP[key] ?? null;
}

function parsePosition(val: string | number | undefined): Position | null {
  if (!val) return null;
  const raw = normalizeStr(String(val));
  const key = raw.replace(/[^a-z0-9 ]/g, '').trim();
  if (POSITION_MAP[key]) return POSITION_MAP[key];
  const posKeys = Object.keys(POSITIONS) as Position[];
  const directMatch = posKeys.find(p => p.toLowerCase() === key);
  if (directMatch) return directMatch;
  for (const [mapKey, pos] of Object.entries(POSITION_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) return pos;
  }
  return null;
}

function parseFoot(val: string | number | undefined): Foot {
  if (!val) return 'Droitier';
  const key = String(val).trim().toLowerCase();
  return FOOT_MAP[key] ?? 'Droitier';
}

function parseNumber(val: string | number | undefined): number {
  if (val === undefined || val === '') return 0;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function parseBool(val: string | number | undefined): boolean {
  if (!val) return false;
  const s = String(val).trim().toLowerCase();
  return ['oui', 'yes', '1', 'true', 'x', '✓', '✅'].includes(s);
}

function parseDate(val: string | number | undefined): string | undefined {
  if (val === undefined || val === null || val === '') return undefined;

  const raw = String(val).trim();
  if (!raw) return undefined;

  // Plain year (ex: 2027)
  if (/^\d{4}$/.test(raw)) return raw;

  // Excel serial date (can be integer or decimal)
  const numericRaw = Number(raw.replace(',', '.'));
  if (!Number.isNaN(numericRaw) && numericRaw > 20000 && numericRaw < 80000) {
    const excelDate = new Date(Math.round((numericRaw - 25569) * 86400 * 1000));
    if (!Number.isNaN(excelDate.getTime())) return excelDate.toISOString().split('T')[0];
  }

  // Month/Year formats (06/2027, 6-27, etc.)
  const monthYear = raw.match(/^(\d{1,2})[\/.-](\d{2,4})$/);
  if (monthYear) {
    const month = monthYear[1].padStart(2, '0');
    const year = monthYear[2].length === 2 ? `20${monthYear[2]}` : monthYear[2];
    return `${year}-${month}`;
  }

  // Localized month + year (juin 2027 / june 2027)
  if (/\b\d{4}\b/.test(raw) && /[a-zA-Zéèêàâîïôûùç]/.test(raw)) {
    const year = raw.match(/\b(19|20)\d{2}\b/)?.[0];
    if (year) return year;
  }

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];

  const dayMonthYear = raw.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (dayMonthYear) {
    const year = dayMonthYear[3].length === 2 ? `20${dayMonthYear[3]}` : dayMonthYear[3];
    const d2 = new Date(`${year}-${dayMonthYear[2].padStart(2, '0')}-${dayMonthYear[1].padStart(2, '0')}`);
    if (!Number.isNaN(d2.getTime())) return d2.toISOString().split('T')[0];
  }

  // Keep original info when unparsed rather than dropping it
  return raw;
}

function parseRow(row: Record<string, string | number | undefined>, customValues?: Record<string, string>): ParsedPlayer {
  const errors: string[] = [];
  const name = String(row.name ?? '').trim();
  if (!name) errors.push('Nom manquant');
  const position = parsePosition(row.position);
  if (!position) errors.push('Poste invalide');
  const generalOpinion = parseOpinion(row.general_opinion) ?? parseOpinion(row.opinion_1) ?? 'À revoir';

  const reports: { opinion: Opinion; drive_link?: string; title?: string }[] = [];
  for (let i = 1; i <= 5; i++) {
    const op = parseOpinion(row[`opinion_${i}`]);
    const rawVal = row[`report_${i}`] ? String(row[`report_${i}`]).trim() : undefined;
    const linkUrl = row[`report_${i}_url`] ? String(row[`report_${i}_url`]).trim() : undefined;
    const drive_link = linkUrl || (rawVal?.startsWith('http') ? rawVal : undefined);
    const title = linkUrl ? (rawVal || undefined) : (rawVal && !rawVal.startsWith('http') ? rawVal : undefined);
    if (op || drive_link || title) {
      reports.push({
        opinion: op ?? generalOpinion ?? 'À revoir',
        drive_link: drive_link || undefined,
        title: title || undefined,
      });
    }
  }

  return {
    name,
    generation: parseNumber(row.generation) || 2000,
    nationality: String(row.nationality ?? '').trim() || 'Inconnu',
    foot: parseFoot(row.foot),
    club: String(row.club ?? '').trim(),
    league: String(row.league ?? '').trim(),
    zone: String(row.zone ?? '').trim(),
    position: position ?? 'MC',
    role: row.role ? String(row.role).trim() : undefined,
    current_level: parseNumber(row.current_level),
    potential: parseNumber(row.potential),
    general_opinion: generalOpinion,
    contract_end: parseDate(row.contract_end),
    notes: row.notes ? String(row.notes).trim() : undefined,
    ts_report_published: parseBool(row.ts_report_published),
    reports,
    customValues: customValues ?? {},
    valid: errors.length === 0,
    errors,
  };
}

export function ImportPlayersDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing' | 'done'>('upload');
  const [rawData, setRawData] = useState<{ headers: string[]; rows: RawRow[]; hyperlinks: Record<number, Record<string, { url: string; text: string }>> }>({ headers: [], rows: [], hyperlinks: {} });
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [parsed, setParsed] = useState<ParsedPlayer[]>([]);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { t } = useTranslation();
  const importPlayers = useImportPlayers();
  const { data: existingPlayers = [] } = usePlayers();
  const { data: customFields = [], refetch: refetchCustomFields } = useCustomFields();
  const createCustomField = useCreateCustomField();
  const bulkUpsertCF = useBulkUpsertCustomFieldValues();

  // Unmapped columns → propose as custom fields
  const [fieldsToCreate, setFieldsToCreate] = useState<Record<string, { checked: boolean; type: string }>>({});
  const [creatingFields, setCreatingFields] = useState(false);

  // Preview state
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'errors'>('all');
  const [previewSort, setPreviewSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Dynamic target fields including custom fields
  const allTargetFields = useMemo(() => {
    const base = [...TARGET_FIELDS];
    customFields.forEach(cf => {
      base.push({ key: `custom_${cf.id}`, label: `⭐ ${cf.field_name}` });
    });
    return base;
  }, [customFields]);

  const reset = () => {
    setStep('upload');
    setRawData({ headers: [], rows: [], hyperlinks: {} });
    setColumnMapping({});
    setParsed([]);
    setFileName('');
    setPreviewSearch('');
    setPreviewFilter('all');
    setPreviewSort(null);
    setExpandedRow(null);
    setFieldsToCreate({});
  };

  // Count how many columns are mapped
  const mappedCount = useMemo(() => Object.values(columnMapping).filter(v => v && v !== '_ignore').length, [columnMapping]);

  // Detect unmapped columns and guess their type from sample values
  const unmappedHeaders = useMemo(() => {
    return rawData.headers.filter(h => !columnMapping[h] || columnMapping[h] === '_ignore');
  }, [rawData.headers, columnMapping]);

  function guessFieldType(header: string, rows: RawRow[]): string {
    const samples = rows.slice(0, 20).map(r => String(r[header] ?? '').trim()).filter(Boolean);
    if (samples.length === 0) return 'text';
    const urlCount = samples.filter(s => /^https?:\/\//.test(s)).length;
    if (urlCount / samples.length > 0.3) return 'link';
    const numCount = samples.filter(s => !isNaN(Number(s.replace(',', '.')))).length;
    if (numCount / samples.length > 0.6) return 'number';
    const boolCount = samples.filter(s => ['oui', 'non', 'yes', 'no', '1', '0', 'true', 'false', 'x', '✓', '✅'].includes(s.toLowerCase())).length;
    if (boolCount / samples.length > 0.5) return 'boolean';
    return 'text';
  }

  // Update fieldsToCreate when unmapped columns change
  const sampleValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const h of rawData.headers) {
      map[h] = rawData.rows.slice(0, 3).map(r => String(r[h] ?? '').trim()).filter(Boolean);
    }
    return map;
  }, [rawData]);

  const handleCreateCustomFields = async () => {
    const toCreate = Object.entries(fieldsToCreate).filter(([, v]) => v.checked);
    if (toCreate.length === 0) return;
    setCreatingFields(true);
    try {
      const createdMap: Record<string, string> = {}; // header -> custom field id
      for (const [header, { type }] of toCreate) {
        const result = await createCustomField.mutateAsync({ field_name: header, field_type: type });
        if (result?.id) createdMap[header] = result.id;
      }
      await refetchCustomFields();
      // Auto-map newly created custom fields
      setColumnMapping(prev => {
        const next = { ...prev };
        for (const [header, cfId] of Object.entries(createdMap)) {
          next[header] = `custom_${cfId}`;
        }
        return next;
      });
      toast({ title: `${toCreate.length} champ${toCreate.length > 1 ? 's' : ''} personnalise${toCreate.length > 1 ? 's' : ''} cree${toCreate.length > 1 ? 's' : ''}` });
      setFieldsToCreate({});
    } catch (err: any) {
      toast({ title: 'Erreur', description: err?.message, variant: 'destructive' });
    } finally {
      setCreatingFields(false);
    }
  };

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');

        // Read as matrix first to preserve column order and handle duplicated headers safely
        const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' });
        if (matrix.length <= 1) {
          toast({ title: t('import.file_empty'), description: t('import.no_data_found'), variant: 'destructive' });
          return;
        }

        const rawHeaders = (matrix[0] ?? []).map(v => String(v ?? '').trim());
        const headerCounts = new Map<string, number>();
        const headers = rawHeaders.map((h, idx) => {
          const base = h || `${t('import.column')} ${idx + 1}`;
          const count = (headerCounts.get(base) ?? 0) + 1;
          headerCounts.set(base, count);
          return count === 1 ? base : `${base} (${count})`;
        });

        const rows: RawRow[] = [];
        const sourceRowToParsedRow = new Map<number, number>();

        matrix.slice(1).forEach((rowArr, sourceRowIdx) => {
          const rowObj: RawRow = {};
          headers.forEach((header, colIdx) => {
            rowObj[header] = rowArr?.[colIdx] as string | number | undefined;
          });

          const hasData = Object.values(rowObj).some(v => v !== undefined && String(v).trim() !== '');
          if (hasData) {
            sourceRowToParsedRow.set(sourceRowIdx, rows.length);
            rows.push(rowObj);
          }
        });

        if (rows.length === 0) {
          toast({ title: t('import.file_empty'), description: t('import.no_data_found'), variant: 'destructive' });
          return;
        }

        const headerBySheetCol: Record<number, string> = {};
        for (let C = range.s.c; C <= range.e.c; C++) {
          const headerName = headers[C - range.s.c];
          if (headerName) headerBySheetCol[C] = headerName;
        }

        // Extract hyperlinks and keep alignment with filtered non-empty rows
        const hyperlinks: Record<number, Record<string, { url: string; text: string }>> = {};
        for (let R = range.s.r + 1; R <= range.e.r; R++) {
          const sourceRowIdx = R - range.s.r - 1;
          const rowIdx = sourceRowToParsedRow.get(sourceRowIdx);
          if (rowIdx === undefined) continue;

          for (let C = range.s.c; C <= range.e.c; C++) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = sheet[addr];
            if (cell?.l?.Target) {
              const header = headerBySheetCol[C];
              if (!header) continue;
              if (!hyperlinks[rowIdx]) hyperlinks[rowIdx] = {};
              hyperlinks[rowIdx][header] = {
                url: cell.l.Target,
                text: cell.v != null ? String(cell.v).trim() : '',
              };
            }
          }
        }

        // Auto-detect column mapping with value-aware disambiguation
        const autoMapping: Record<string, string> = {};
        const usedTargets = new Set<string>();

        const sampleByHeader: Record<string, (string | number | undefined)[]> = {};
        for (const header of headers) {
          const samples: (string | number | undefined)[] = [];
          for (const row of rows) {
            const v = row[header];
            if (v !== undefined && String(v).trim() !== '') {
              samples.push(v);
              if (samples.length >= 5) break;
            }
          }
          sampleByHeader[header] = samples;
        }

        for (const header of headers.filter(Boolean)) {
          const guess = guessField(header, sampleByHeader[header] ?? []);
          if (guess && !usedTargets.has(guess)) {
            autoMapping[header] = guess;
            usedTargets.add(guess);
          }
        }

        setRawData({ headers: headers.filter(Boolean), rows, hyperlinks });
        setColumnMapping(autoMapping);
        setStep('mapping');
      } catch (err) {
        console.error('Parse error:', err);
        toast({ title: t('import.read_error'), description: t('import.format_unsupported'), variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  /** Apply mapping and go to preview */
  const applyMapping = () => {
    const { rows, hyperlinks } = rawData;

    // Build custom field mapping: rawHeader -> custom_field_id (for keys starting with custom_)
    const cfMapping: Record<string, string> = {};
    for (const [rawHeader, targetField] of Object.entries(columnMapping)) {
      if (targetField?.startsWith('custom_')) {
        cfMapping[rawHeader] = targetField.replace('custom_', '');
      }
    }

    const mapped = rows.map((row, rowIdx) => {
      const normalized: Record<string, string | number | undefined> = {};

      // Apply user-defined mapping (skip custom fields, handled separately)
      for (const [rawHeader, targetField] of Object.entries(columnMapping)) {
        if (!targetField || targetField === '_ignore' || targetField.startsWith('custom_')) continue;
        normalized[targetField] = row[rawHeader];
      }

      // Build custom field values for this row
      const cfVals: Record<string, string> = {};
      for (const [rawHeader, cfId] of Object.entries(cfMapping)) {
        const val = row[rawHeader];
        if (val !== undefined && val !== '') {
          cfVals[cfId] = String(val).trim();
        }
      }

      // Process hyperlinks using mapping
      const rowLinks = hyperlinks[rowIdx];
      if (rowLinks) {
        for (const [rawHeader, link] of Object.entries(rowLinks)) {
          const targetField = columnMapping[rawHeader];
          if (targetField?.startsWith('report_')) {
            normalized[`${targetField}_url`] = link.url;
            normalized[targetField] = link.text || link.url;
          }
          // For custom link fields, use hyperlink URL
          if (targetField?.startsWith('custom_')) {
            const cfId = targetField.replace('custom_', '');
            cfVals[cfId] = link.url;
          }
        }
      }
      // Also detect URLs in custom field text values
      for (const [cfId, val] of Object.entries(cfVals)) {
        if (val && !val.startsWith('http') && rowLinks) {
          const rawHeader = Object.entries(cfMapping).find(([, id]) => id === cfId)?.[0];
          if (rawHeader && rowLinks[rawHeader]?.url) {
            cfVals[cfId] = rowLinks[rawHeader].url;
          }
        }
      }

      // Auto-detect URLs in report fields
      for (let i = 1; i <= 5; i++) {
        const key = `report_${i}`;
        const val = normalized[key];
        if (val && !normalized[`${key}_url`]) {
          const s = String(val).trim();
          if (s.match(/^https?:\/\//i) || s.match(/^drive\.google\.com|docs\.google\.com/i)) {
            normalized[`${key}_url`] = s.startsWith('http') ? s : `https://${s}`;
            normalized[key] = '';
          }
        }
      }

      return parseRow(normalized, cfVals);
    });

    // Check for duplicates against existing players in DB (by name + club)
    const normalizeForMatch = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    for (const p of mapped) {
      if (!p.name) continue;
      const pName = normalizeForMatch(p.name);
      const pClub = normalizeForMatch(p.club);
      const duplicate = existingPlayers.find(ep => {
        const epName = normalizeForMatch(ep.name);
        const epClub = normalizeForMatch(ep.club);
        return epName === pName && epClub === pClub;
      });
      if (duplicate) {
        p.errors.push(`Joueur déjà existant en base (${duplicate.name}, ${duplicate.club})`);
        p.valid = false;
      }
    }

    setParsed(mapped);
    setStep('preview');
  };

  const handleImport = async () => {
    const validPlayers = parsed.filter(p => p.valid);
    const now = new Date().toISOString().split('T')[0];

    setStep('importing');

    try {
      const result = await importPlayers.mutateAsync(
        validPlayers.map(p => ({
          player: {
            name: p.name,
            generation: p.generation,
            nationality: p.nationality,
            foot: p.foot,
            club: p.club,
            league: p.league,
            zone: p.zone,
            position: p.position,
            role: p.role,
            current_level: p.current_level,
            potential: p.potential,
            general_opinion: p.general_opinion,
            contract_end: p.contract_end,
            notes: p.notes,
            ts_report_published: p.ts_report_published,
          },
          reports: p.reports.map(r => ({
            report_date: now,
            title: r.title,
            opinion: r.opinion,
            drive_link: r.drive_link,
          })),
        }))
      );

      // Save custom field values for imported players
      if (result.enrichQueue?.length) {
        const cfEntries: { customFieldId: string; playerId: string; value: string | null }[] = [];
        for (let i = 0; i < validPlayers.length; i++) {
          const p = validPlayers[i];
          const playerId = result.enrichQueue[i]?.id;
          if (playerId && Object.keys(p.customValues).length > 0) {
            for (const [cfId, val] of Object.entries(p.customValues)) {
              cfEntries.push({ customFieldId: cfId, playerId, value: val });
            }
          }
        }
        if (cfEntries.length > 0) {
          await bulkUpsertCF.mutateAsync(cfEntries);
        }
      }

      const parts: string[] = [];
      if (result.importedCount > 0) parts.push(`${result.importedCount} ${t('import.created')}`);
      if (result.updatedCount > 0) parts.push(`${result.updatedCount} ${t('import.updated')}`);
      if (parsed.length - validPlayers.length > 0) parts.push(`${parsed.length - validPlayers.length} ${t('import.errors_count')}`);

      const total = result.importedCount + result.updatedCount;
      toast({
        title: `${total} ${t('import.player')}${total > 1 ? 's' : ''} ${t('import.processed')}${total > 1 ? 's' : ''}`,
        description: parts.join(', ') + '.',
      });

      setStep('done');
    } catch (err) {
      console.error('Import error:', err);
      toast({ title: t('common.error'), description: t('import.import_failed'), variant: 'destructive' });
      setStep('preview');
    }
  };

  const validCount = parsed.filter(p => p.valid).length;
  const errorCount = parsed.length - validCount;

  // Columns visible in preview = mapped target fields
  const previewColumns = useMemo(() => {
    const mapped = new Set(Object.values(columnMapping).filter(v => v && v !== '_ignore'));
    const cols: { key: string; label: string }[] = [];
    // Always show status first
    for (const tf of allTargetFields) {
      if (mapped.has(tf.key)) cols.push(tf);
    }
    return cols;
  }, [columnMapping, allTargetFields]);

  // Filtered + sorted preview data
  const filteredParsed = useMemo(() => {
    let list = parsed.map((p, i) => ({ ...p, _idx: i }));

    // Filter
    if (previewFilter === 'valid') list = list.filter(p => p.valid);
    if (previewFilter === 'errors') list = list.filter(p => !p.valid);

    // Search
    if (previewSearch.trim()) {
      const q = previewSearch.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.club.toLowerCase().includes(q) ||
        p.nationality.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q)
      );
    }

    // Sort
    if (previewSort) {
      const { key, dir } = previewSort;
      list.sort((a, b) => {
        const va = (a as any)[key] ?? '';
        const vb = (b as any)[key] ?? '';
        const cmp = typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'fr', { numeric: true });
        return dir === 'asc' ? cmp : -cmp;
      });
    }

    return list;
  }, [parsed, previewFilter, previewSearch, previewSort]);

  const toggleSort = (key: string) => {
    setPreviewSort(prev => {
      if (prev?.key === key) {
        return prev.dir === 'asc' ? { key, dir: 'desc' } : null;
      }
      return { key, dir: 'asc' };
    });
  };

  // Helper to get cell value from parsed player
  const getCellValue = (p: ParsedPlayer, key: string): string => {
    if (key.startsWith('custom_')) {
      const cfId = key.replace('custom_', '');
      return p.customValues[cfId] ?? '';
    }
    if (key.startsWith('opinion_') || key.startsWith('report_')) {
      const idx = parseInt(key.split('_')[1]) - 1;
      if (key.startsWith('opinion_')) return p.reports[idx]?.opinion ?? '';
      return p.reports[idx]?.drive_link || p.reports[idx]?.title || '';
    }
    const val = (p as any)[key];
    if (val === undefined || val === null) return '';
    if (typeof val === 'boolean') return val ? '✓' : '';
    return String(val);
  };

  // Sample values for each raw header (first 3 non-empty)
  const sampleValues = useMemo(() => {
    const samples: Record<string, string[]> = {};
    for (const header of rawData.headers) {
      const vals: string[] = [];
      for (const row of rawData.rows) {
        const v = row[header];
        if (v !== undefined && v !== '') {
          vals.push(String(v).slice(0, 30));
          if (vals.length >= 3) break;
        }
      }
      samples[header] = vals;
    }
    return samples;
  }, [rawData]);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl">
          <FileSpreadsheet className="w-4 h-4 mr-2" />{t('players.import_excel')}
        </Button>
      </DialogTrigger>
      <DialogContent className={`${step === 'preview' ? 'max-w-[95vw]' : 'max-w-4xl'} max-h-[90vh] flex flex-col overflow-hidden`}>
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && t('import.title')}
            {step === 'mapping' && t('import.title_mapping', { file: fileName })}
            {step === 'preview' && t('import.title_preview', { file: fileName })}
            {step === 'importing' && t('import.title_importing')}
            {step === 'done' && t('import.title_done')}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div
            className="flex flex-col items-center justify-center border-2 border-dashed border-muted rounded-xl p-12 cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-semibold mb-1">{t('import.drop_or_click')}</p>
            <p className="text-sm text-muted-foreground">{t('import.drop_desc')}</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        )}

        {step === 'mapping' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <Columns className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t('import.columns_detected', { count: rawData.headers.length, mapped: mappedCount })}
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
              <div className="space-y-2 pb-2">
                {rawData.headers.map(header => (
                  <div key={header} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{header}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        Ex: {sampleValues[header]?.join(' · ') || t('import.empty')}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Select
                      value={columnMapping[header] || '_ignore'}
                      onValueChange={(val) => setColumnMapping(prev => ({ ...prev, [header]: val }))}
                    >
                      <SelectTrigger className="w-[200px] h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_ignore">{t('import.ignore')}</SelectItem>
                        {allTargetFields.map(f => (
                          <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {/* Unmapped columns → propose custom fields */}
              {unmappedHeaders.length > 0 && (
                <div className="mt-4 p-4 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5">
                  <div className="flex items-center gap-2 mb-3">
                    <Plus className="w-4 h-4 text-amber-600" />
                    <p className="text-sm font-medium text-amber-700">
                      {unmappedHeaders.length} colonne{unmappedHeaders.length > 1 ? 's' : ''} non reconnue{unmappedHeaders.length > 1 ? 's' : ''} — Creer comme champs personnalises ?
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {unmappedHeaders.map(header => {
                      const guessed = guessFieldType(header, rawData.rows);
                      const current = fieldsToCreate[header] ?? { checked: false, type: guessed };
                      const TypeIcon = current.type === 'link' ? LinkIcon : current.type === 'number' ? Hash : current.type === 'boolean' ? ToggleLeft : Type;
                      return (
                        <div key={header} className="flex items-center gap-3 p-2 rounded-lg bg-background/80">
                          <Checkbox
                            checked={current.checked}
                            onCheckedChange={(checked) => setFieldsToCreate(prev => ({
                              ...prev, [header]: { ...current, checked: !!checked },
                            }))}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{header}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {sampleValues[header]?.join(' · ') || '—'}
                            </p>
                          </div>
                          <Select
                            value={current.type}
                            onValueChange={(val) => setFieldsToCreate(prev => ({
                              ...prev, [header]: { ...current, type: val },
                            }))}
                          >
                            <SelectTrigger className="w-[120px] h-8 text-xs">
                              <TypeIcon className="w-3 h-3 mr-1" />
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Texte</SelectItem>
                              <SelectItem value="number">Nombre</SelectItem>
                              <SelectItem value="link">Lien</SelectItem>
                              <SelectItem value="boolean">Oui / Non</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                  {Object.values(fieldsToCreate).some(v => v.checked) && (
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={handleCreateCustomFields}
                      disabled={creatingFields}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      {creatingFields ? 'Creation...' : `Creer ${Object.values(fieldsToCreate).filter(v => v.checked).length} champ${Object.values(fieldsToCreate).filter(v => v.checked).length > 1 ? 's' : ''}`}
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-between gap-3 pt-4 border-t mt-2">
              <Button variant="outline" onClick={reset}>{t('common.cancel')}</Button>
              <div className="flex gap-2">
                <Button
                  onClick={applyMapping}
                  disabled={!columnMapping[rawData.headers.find(h => columnMapping[h] === 'name') ?? '']}
                >
                  {t('import.continue', { count: rawData.rows.length, plural: rawData.rows.length > 1 ? 's' : '' })}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {/* Stats badges */}
              <Badge
                variant={previewFilter === 'all' ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setPreviewFilter('all')}
              >
                {t('import.all')} ({parsed.length})
              </Badge>
              <Badge
                variant={previewFilter === 'valid' ? 'default' : 'outline'}
                className="cursor-pointer bg-success/10 text-success hover:bg-success/20 border-success/30"
                onClick={() => setPreviewFilter('valid')}
              >
                <Check className="w-3 h-3 mr-1" /> {t('import.valid', { count: validCount, plural: validCount > 1 ? 's' : '' })}
              </Badge>
              {errorCount > 0 && (
                <Badge
                  variant={previewFilter === 'errors' ? 'default' : 'outline'}
                  className="cursor-pointer bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/30"
                  onClick={() => setPreviewFilter('errors')}
                >
                  <AlertTriangle className="w-3 h-3 mr-1" /> {t('import.errors', { count: errorCount, plural: errorCount > 1 ? 's' : '' })}
                </Badge>
              )}

              {/* Search */}
              <div className="relative ml-auto">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder={t('import.search_player')}
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  className="h-8 w-[200px] pl-8 text-xs"
                />
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 overflow-auto -mx-6 px-6">
              <div className="min-w-max">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 text-center sticky left-0 bg-background z-10">#</TableHead>
                      <TableHead className="w-8 sticky left-10 bg-background z-10"></TableHead>
                      {previewColumns.map(col => (
                        <TableHead
                          key={col.key}
                          className="cursor-pointer select-none whitespace-nowrap text-xs hover:text-foreground"
                          onClick={() => toggleSort(col.key)}
                        >
                          <div className="flex items-center gap-1">
                            {col.label}
                            {previewSort?.key === col.key && (
                              previewSort.dir === 'asc'
                                ? <ChevronUp className="w-3 h-3" />
                                : <ChevronDown className="w-3 h-3" />
                            )}
                          </div>
                        </TableHead>
                      ))}
                      <TableHead className="text-xs whitespace-nowrap">{t('import.reports')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredParsed.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={previewColumns.length + 3} className="text-center text-muted-foreground py-8">
                          {t('import.no_results')}
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredParsed.map((p, displayIdx) => (
                      <TooltipProvider key={p._idx} delayDuration={200}>
                        <TableRow
                          className={`text-xs ${!p.valid ? 'bg-destructive/5' : ''} cursor-pointer`}
                          onClick={() => setExpandedRow(expandedRow === p._idx ? null : p._idx)}
                        >
                          <TableCell className="text-center text-muted-foreground font-mono sticky left-0 bg-background z-10">
                            {p._idx + 1}
                          </TableCell>
                          <TableCell className="sticky left-10 bg-background z-10">
                            {p.valid ? (
                              <Check className="w-3.5 h-3.5 text-success" />
                            ) : (
                              <Tooltip>
                                <TooltipTrigger>
                                  <X className="w-3.5 h-3.5 text-destructive" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs">
                                  <p className="text-xs">{p.errors.join(', ')}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                          {previewColumns.map(col => {
                            const val = getCellValue(p, col.key);
                            const isEmpty = !val || val === '0';
                            return (
                              <TableCell
                                key={col.key}
                                className={`whitespace-nowrap max-w-[180px] truncate ${isEmpty ? 'text-muted-foreground/40 italic' : ''}`}
                                title={val}
                              >
                                {isEmpty ? '—' : val}
                              </TableCell>
                            );
                          })}
                          <TableCell className="whitespace-nowrap">
                            {p.reports.length > 0 ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {t('import.report_count', { count: p.reports.length })}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                        {/* Expanded detail row */}
                        {expandedRow === p._idx && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={previewColumns.length + 3} className="p-0">
                              <div className="bg-muted/30 p-4 text-xs space-y-2 border-y">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  {previewColumns.map(col => {
                                    const val = getCellValue(p, col.key);
                                    return (
                                      <div key={col.key}>
                                        <p className="text-muted-foreground text-[10px] uppercase tracking-wider">{col.label}</p>
                                        <p className="font-medium mt-0.5">{val || '—'}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                                {p.reports.length > 0 && (
                                  <div className="pt-2 border-t border-border/50">
                                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">{t('import.reports')}</p>
                                    {p.reports.map((r, ri) => (
                                      <div key={ri} className="flex items-center gap-2 py-1">
                                        <Badge variant="outline" className="text-[10px]">{r.opinion}</Badge>
                                        {r.title && <span>{r.title}</span>}
                                        {r.drive_link && (
                                          <a href={r.drive_link} target="_blank" rel="noopener" className="text-primary underline truncate max-w-[300px]">
                                            {r.drive_link}
                                          </a>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {!p.valid && (
                                  <div className="pt-2 border-t border-destructive/20">
                                    <p className="text-destructive font-medium">{t('import.errors_label')} {p.errors.join(', ')}</p>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TooltipProvider>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-between items-center gap-3 pt-4 border-t">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => setStep('mapping')}>{t('import.back_mapping')}</Button>
                <span className="text-xs text-muted-foreground">
                  {filteredParsed.length} / {parsed.length} {t('import.displayed')}
                </span>
              </div>
              <Button onClick={handleImport} disabled={validCount === 0}>
                {t('import.import_btn', { count: validCount, plural: validCount > 1 ? 's' : '' })}
              </Button>
            </div>
          </>
        )}

        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-muted-foreground">{t('import.importing')}</p>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-success" />
            </div>
            <p className="text-lg font-semibold mb-2">{t('import.success')}</p>
            <Button onClick={() => { setOpen(false); reset(); }} className="mt-4">{t('common.close')}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
