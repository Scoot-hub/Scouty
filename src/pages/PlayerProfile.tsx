import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useIsPremium } from '@/hooks/use-admin';
import { useTranslation } from 'react-i18next';
import { usePlayer, useReports, usePlayers, useAddReport } from '@/hooks/use-players';
import { useMyOrganizations } from '@/hooks/use-organization';
import { ShareWithOrgPopover } from '@/components/ShareWithOrgPopover';
import { CustomFieldsDisplay } from '@/components/CustomFieldsDisplay';
import { CustomFieldsManager } from '@/components/CustomFieldsManager';
import { MoreHorizontal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getPlayerAge, getPotentialDescription, resolveLeagueName, type Opinion } from '@/types/player';
import { usePositions } from '@/hooks/use-positions';
import { FlagIcon } from '@/components/ui/flag-icon';
import { OpinionBadge } from '@/components/ui/opinion-badge';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { ClubBadge } from '@/components/ui/club-badge';
import { CircularGauge } from '@/components/ui/circular-gauge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ArrowLeft, Edit, FileDown, ExternalLink, PlusCircle, Trash2, RefreshCw, Globe, TrendingUp, Calendar, Ruler, User, MapPin, Hash, Pencil, Euro, Briefcase, GripVertical, Maximize2, Minimize2, LayoutDashboard, ListPlus, Check, Building2, AlertCircle, FileText, Upload, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { toast } from 'sonner';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { parseScoutingNotes, serializeScoutingNotes, loadLayout, saveLayout, type CardId, type CardSize, type LayoutConfig, type ScoutingNotes } from '@/lib/scouting-notes';

/* ── Generic sortable card wrapper ── */
function SortableCard({ id, size, onToggleSize, editMode, children }: {
  id: string; size: CardSize; onToggleSize: () => void; editMode: boolean; children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editMode });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={size === 'full' ? 'md:col-span-2' : ''}>
      <Card className={`card-warm h-full transition-all ${isDragging ? 'shadow-lg ring-2 ring-primary/30' : ''} ${editMode ? 'ring-1 ring-primary/20 ring-dashed' : ''}`}>
        {editMode && (
          <div className="flex items-center gap-1 px-4 pt-3 pb-0">
            <button type="button" {...attributes} {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <GripVertical className="w-4 h-4" />
            </button>
            <div className="flex-1" />
            <button type="button" onClick={onToggleSize}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title={size === 'half' ? t('profile.full_width') : t('profile.half_width')}>
              {size === 'half' ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
        {children}
      </Card>
    </div>
  );
}

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const { data: player, isLoading: playerLoading } = usePlayer(id);
  const { data: reports = [] } = useReports(id);
  const { data: allPlayers = [] } = usePlayers();
  const { t, i18n } = useTranslation();
  const { positions: posLabels, positionShort: posShort } = usePositions();
  const { data: isPremium } = useIsPremium();
  const { data: myOrgs = [] } = useMyOrganizations();
  const hasOrg = myOrgs.length > 0;
  const navigate = useNavigate();

  // Scouting notes state
  const [scoutingNotes, setScoutingNotes] = useState<ScoutingNotes>({ physique: '', avec_ballon: '', sans_ballon: '', mental: '', personnelles: '' });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Layout state
  const [layout, setLayout] = useState<LayoutConfig>(loadLayout);

  // UI state
  const [editMode, setEditMode] = useState(false);
  const [manageFieldsOpen, setManageFieldsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [tmUrlInput, setTmUrlInput] = useState('');
  const [editingReport, setEditingReport] = useState<{ id: string; title: string; drive_link: string; file_url: string } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editLink, setEditLink] = useState('');
  const [savingReport, setSavingReport] = useState(false);
  const [addReportOpen, setAddReportOpen] = useState(false);
  const [newReportDate, setNewReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [newReportOpinion, setNewReportOpinion] = useState<Opinion>('À suivre');
  const [newReportTitle, setNewReportTitle] = useState('');
  const [newReportLink, setNewReportLink] = useState('');
  const [newReportFile, setNewReportFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [editReportFile, setEditReportFile] = useState<File | null>(null);
  const addReport = useAddReport();

  const locale = i18n.language === 'es' ? 'es-ES' : i18n.language === 'en' ? 'en-GB' : 'fr-FR';

  // ── Handlers ──

  const handleEnrich = async (tmUrl?: string) => {
    if (!player) return;
    setEnriching(true);
    try {
      const body: Record<string, unknown> = { playerName: player.name, club: player.club, playerId: player.id, nationality: player.nationality, generation: player.generation, position: player.position };
      if (tmUrl) body.tmUrl = tmUrl;
      const { data, error } = await supabase.functions.invoke('enrich-player', { body });
      if (error) throw error;
      if (data?.success) {
        if (tmUrl && data?.tmNotFound) {
          toast.error(t('profile.enrich_tm_url_invalid'));
        } else {
          toast.success(t('profile.enrich_success'));
          window.location.reload();
        }
      } else {
        toast.error(data?.error || t('profile.enrich_error'));
      }
    } catch { toast.error(t('profile.enrich_error')); }
    finally { setEnriching(false); }
  };

  const handleDelete = async () => {
    if (!player || deleteConfirm !== player.name) return;
    setDeleting(true);
    try {
      await supabase.from('reports').delete().eq('player_id', player.id);
      const { error } = await supabase.from('players').delete().eq('id', player.id);
      if (error) throw error;
      toast.success(`${player.name} ${t('profile.delete_success')}`);
      navigate('/players');
    } catch { toast.error(t('profile.delete_error')); }
    finally { setDeleting(false); }
  };

  const uploadReportFile = async (file: File): Promise<string | null> => {
    const fileName = `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
    const { data, error } = await supabase.storage.from('reports').upload(fileName, file);
    if (error) { console.error('Upload error:', error); toast.error(t('profile.file_upload_error')); return null; }
    // Use the publicUrl returned directly by the server (includes correct host)
    return data?.publicUrl || null;
  };

  const openEditReport = (report: any) => {
    setEditingReport({ id: report.id, title: report.title || '', drive_link: report.drive_link || '', file_url: report.file_url || '' });
    setEditTitle(report.title || '');
    setEditLink(report.drive_link || '');
    setEditReportFile(null);
  };

  const handleSaveReport = async () => {
    if (!editingReport) return;
    setSavingReport(true);
    try {
      let newFileUrl: string | undefined;
      if (editReportFile) {
        const url = await uploadReportFile(editReportFile);
        if (!url) { setSavingReport(false); return; }
        newFileUrl = url;
      }
      const updateData: Record<string, any> = { title: editTitle || null, drive_link: editLink || null };
      if (newFileUrl) updateData.file_url = newFileUrl;
      const { error } = await supabase.from('reports').update(updateData).eq('id', editingReport.id);
      if (error) throw error;
      toast.success(t('profile.report_updated'));
      setEditingReport(null);
      setEditReportFile(null);
      window.location.reload();
    } catch { toast.error(t('profile.report_update_error')); }
    finally { setSavingReport(false); }
  };

  const handleAddReport = async () => {
    if (!player) return;
    setUploadingFile(true);
    try {
      let fileUrl: string | undefined;
      if (newReportFile) {
        const url = await uploadReportFile(newReportFile);
        if (!url) { setUploadingFile(false); return; }
        fileUrl = url;
      }
      await addReport.mutateAsync({
        player_id: player.id,
        report_date: newReportDate,
        opinion: newReportOpinion,
        title: newReportTitle || undefined,
        drive_link: newReportLink || undefined,
        file_url: fileUrl,
      });
      toast.success(t('profile.report_added'));
      setAddReportOpen(false);
      setNewReportTitle('');
      setNewReportLink('');
      setNewReportFile(null);
      setNewReportOpinion('À suivre');
      setNewReportDate(new Date().toISOString().slice(0, 10));
      window.location.reload();
    } catch { toast.error(t('profile.report_add_error')); }
    finally { setUploadingFile(false); }
  };

  // ── Notes auto-save ──

  useMemo(() => { if (player) setScoutingNotes(parseScoutingNotes(player.notes)); }, [player?.notes]);

  const autoSave = useCallback((updated: ScoutingNotes) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!player) return;
      await supabase.from('players').update({ notes: serializeScoutingNotes(updated) } as any).eq('id', player.id);
    }, 1000);
  }, [player]);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const updateZone = useCallback((zone: keyof ScoutingNotes, value: string) => {
    setScoutingNotes(prev => {
      const updated = { ...prev, [zone]: value };
      autoSave(updated);
      return updated;
    });
  }, [autoSave]);

  // ── DnD ──

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLayout(prev => {
        const oldIdx = prev.order.indexOf(active.id as CardId);
        const newIdx = prev.order.indexOf(over.id as CardId);
        const updated = { ...prev, order: arrayMove(prev.order, oldIdx, newIdx) };
        saveLayout(updated);
        return updated;
      });
    }
  }, []);

  const toggleSize = useCallback((cardId: CardId) => {
    setLayout(prev => {
      const updated = { ...prev, sizes: { ...prev.sizes, [cardId]: prev.sizes[cardId] === 'half' ? 'full' : 'half' } };
      saveLayout(updated);
      return updated;
    });
  }, []);

  // ── Loading / not found ──

  if (playerLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-muted-foreground">{t('common.loading')}</p>
    </div>
  );

  if (!player) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <p className="text-xl font-semibold text-muted-foreground">{t('profile.player_not_found')}</p>
      <Button asChild variant="outline" className="mt-4 rounded-xl">
        <Link to="/players"><ArrowLeft className="w-4 h-4 mr-2" />{t('common.back')}</Link>
      </Button>
    </div>
  );

  // ── Derived data ──

  const age = getPlayerAge(player.generation, player.date_of_birth);
  const formatDate = (d: string) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

  const chartData = reports.slice().reverse().map(r => ({
    date: new Date(r.report_date).toLocaleDateString(locale, { month: 'short', year: '2-digit' }),
    niveau: player.current_level,
    potentiel: player.potential,
  }));

  const ext = (player.external_data || {}) as Record<string, any>;
  const contractDate = player.contract_end ? new Date(player.contract_end) : null;
  const contractSoon = contractDate && (contractDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24) < 180;

  const similarPlayers = allPlayers.filter(
    p => p.id !== player.id && p.position === player.position && Math.abs(p.potential - player.potential) <= 1
  ).slice(0, 4);

  // Cards that should be hidden
  const hiddenCards = new Set<CardId>();
  hiddenCards.add('details');
  if (!player.external_data_fetched_at) hiddenCards.add('external_data');
  if (chartData.length < 2) hiddenCards.add('evolution');
  if (similarPlayers.length === 0) hiddenCards.add('similar');

  const visibleOrder = layout.order.filter(id => !hiddenCards.has(id));

  // ── Card content renderers ──

  const renderNoteZone = (zone: keyof ScoutingNotes, icon: string, titleKey: string, placeholderKey: string) => (
    <CardContent className="pt-4 pb-4 px-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
        <span>{icon}</span> {t(titleKey)}
      </h3>
      <textarea
        value={scoutingNotes[zone]}
        onChange={(e) => updateZone(zone, e.target.value)}
        placeholder={t(placeholderKey)}
        className="w-full min-h-[100px] p-3 rounded-xl bg-muted/30 border-none resize-vertical text-sm focus:outline-none focus:ring-2 focus:ring-ring leading-relaxed"
      />
    </CardContent>
  );

  const cardRenderers: Record<CardId, () => React.ReactNode> = {
    evaluation: () => (
      <CardContent className="p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-5">{t('profile.evaluation')}</h3>
        <div className="flex items-center justify-center gap-10">
          <CircularGauge value={player.current_level} variant="success" label={t('profile.level')} size={130} />
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <CircularGauge value={player.potential} variant="primary" label={t('profile.potential')} size={130} />
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-sm font-medium">{getPotentialDescription(player.potential)}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
    ),

    details: () => null,

    external_data: () => {
      const items: { icon: React.ReactNode; label: string; value: string }[] = [];
      if (player.date_of_birth) {
        const dob = new Date(player.date_of_birth);
        const ageVal = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        items.push({ icon: <Calendar className="w-3.5 h-3.5" />, label: t('profile.birth_date'), value: `${dob.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })} (${ageVal} ${t('common.year')})` });
      }
      if (ext.height) items.push({ icon: <Ruler className="w-3.5 h-3.5" />, label: t('profile.height'), value: ext.height });
      if (ext.nationality2) items.push({ icon: <Globe className="w-3.5 h-3.5" />, label: t('profile.nationality2'), value: ext.nationality2 });
      {
        const contractLabel = ext.on_loan && ext.parent_club
          ? `${t('profile.contract_end')} (${ext.parent_club})`
          : t('profile.contract_end');
        const contractValue = player.contract_end ? `${formatDate(player.contract_end)}${contractSoon ? ' ⚠️' : ''}` : '—';
        items.push({ icon: <Calendar className="w-3.5 h-3.5" />, label: contractLabel, value: contractValue });
      }
      if (ext.on_loan && ext.parent_club) {
        items.push({ icon: <Building2 className="w-3.5 h-3.5" />, label: t('profile.loan_status'), value: `${t('profile.on_loan')} ${ext.parent_club}` });
        if (ext.loan_end_date) {
          items.push({ icon: <Calendar className="w-3.5 h-3.5" />, label: t('profile.loan_end'), value: formatDate(ext.loan_end_date) });
        }
      }
      items.push({ icon: <User className="w-3.5 h-3.5" />, label: t('profile.agent'), value: ext.agent || '—' });
      if (ext.market_value) items.push({ icon: <Euro className="w-3.5 h-3.5" />, label: t('profile.market_value'), value: ext.market_value });
      if (ext.birth_location) items.push({ icon: <MapPin className="w-3.5 h-3.5" />, label: t('profile.birth_location'), value: ext.birth_location });
      if (ext.shirt_number) items.push({ icon: <Hash className="w-3.5 h-3.5" />, label: t('profile.shirt_number'), value: `#${ext.shirt_number}` });
      if (ext.date_signed) items.push({ icon: <Calendar className="w-3.5 h-3.5" />, label: t('profile.date_signed'), value: new Date(ext.date_signed).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) });
      if (ext.signing_fee) items.push({ icon: <TrendingUp className="w-3.5 h-3.5" />, label: t('profile.transfer_fee'), value: ext.signing_fee });
      if (ext.transfermarkt_id) items.push({ icon: <ExternalLink className="w-3.5 h-3.5" />, label: 'Transfermarkt', value: `ID: ${ext.transfermarkt_id}` });

      const isNationalTeamLabel = (name: string) => {
        const n = name.toLowerCase();
        return n.includes('national') || n.includes('équipe de ') || n.includes('équipe nationale') ||
          n.includes('selección') || n.includes('seleção') || n.includes('nazionale') ||
          n.includes('mannschaft') || n.includes('auswahl') || n.includes('elftal') ||
          n.includes('landshold') || n.includes('landslaget');
      };

      const parseNatTeamLabel = (label: string): { country: string; category: string } => {
        let s = label;
        let category = 'A';
        const ageM = s.match(/moins de (\d+)\s*ans/i) || s.match(/under[- ](\d+)/i) || s.match(/\bU[- ](\d+)\b/);
        if (ageM) category = `U${ageM[1]}`;
        else if (/\bespoirs?\b/i.test(s)) category = 'U23';
        else if (/\bolympiques?\b|\bolympics?\b/i.test(s)) category = 'U23 OL';
        s = s.replace(/\s*des moins de \d+\s*ans/i, '').replace(/\s*under[- ]\d+/i, '').replace(/\s*\bU[- ]\d+\b/g, '').replace(/\s*\bespoirs?\b/gi, '').replace(/\s*\bolympiques?\b/gi, '');
        s = s.replace(/^(?:sélection|équipe)\s+(?:nationale?\s+)?(?:de\s+l[a']\s*|des\s+|du\s+|de\s+|d[e']\s*)/i, '');
        s = s.replace(/^(?:de\s+l[a']|d[e']\s+)/i, '');
        s = s.replace(/^(?:selección\s+(?:nacional\s+)?(?:de\s+|del\s+)?)/i, '');
        s = s.replace(/^(?:seleção\s+(?:nacional\s+)?(?:de\s+)?)/i, '');
        s = s.replace(/^nazionale\s+/i, '');
        s = s.replace(/\s+(?:de\s+)?football(?:\s+à\s+\d+)?$/i, '').replace(/\s+soccer$/i, '').replace(/\s+fu[sß]ball$/i, '');
        return { country: s.trim(), category };
      };

      const rawCareer: { club: string; from?: string; to?: string }[] = Array.isArray(ext.career) ? ext.career : [];
      const hasPresplit = Array.isArray(ext.national_career);
      const career = hasPresplit ? rawCareer : rawCareer.filter(e => !isNationalTeamLabel(e.club));
      const nationalCareer: { club: string; from?: string; to?: string }[] = hasPresplit ? ext.national_career : rawCareer.filter(e => isNationalTeamLabel(e.club));

      const fmtCareerDate = (d?: string) => {
        if (!d) return null;
        const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
          const [, year, month, day] = m;
          if (month === '00') return year;
          const safe = new Date(`${year}-${month}-${day === '00' ? '01' : day}`);
          if (isNaN(safe.getTime())) return year;
          return safe.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
        }
        const date = new Date(d);
        return isNaN(date.getTime()) ? null : date.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
      };

      return (
        <>
          <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4" />{t('profile.external_data_title')}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {t('profile.last_updated')} {new Date(player.external_data_fetched_at!).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => handleEnrich()} disabled={enriching || !isPremium}>
                    <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${enriching ? 'animate-spin' : ''}`} />{t('profile.refresh')}
                  </Button>
                </span>
              </TooltipTrigger>
              {!isPremium && <TooltipContent>Fonctionnalité réservée aux comptes Premium</TooltipContent>}
            </Tooltip>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            {items.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                    <span className="text-muted-foreground">{item.icon}</span>
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className="text-sm font-bold ml-auto text-right">{item.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">{t('profile.no_data')}</p>
            )}

            {ext.tm_not_found && (
              <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {t('profile.enrich_tm_not_found')}
                </p>
                <div className="flex gap-2">
                  <Input
                    value={tmUrlInput}
                    onChange={e => setTmUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && tmUrlInput.trim()) handleEnrich(tmUrlInput.trim()); }}
                    placeholder={t('profile.enrich_tm_url_placeholder')}
                    className="rounded-lg text-xs h-8"
                  />
                  <Button
                    size="sm"
                    className="rounded-lg h-8 shrink-0"
                    onClick={() => { if (tmUrlInput.trim()) handleEnrich(tmUrlInput.trim()); }}
                    disabled={enriching || !tmUrlInput.trim()}
                  >
                    {enriching
                      ? <RefreshCw className="w-3 h-3 animate-spin" />
                      : t('profile.enrich_tm_save')}
                  </Button>
                </div>
              </div>
            )}

            {career.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" />{t('profile.career')}
                </h4>
                <div className="space-y-1.5">
                  {career.map((entry, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 text-sm">
                      <ClubBadge club={entry.club} size="sm" />
                      <span className="font-semibold flex-1 truncate">{entry.club}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {fmtCareerDate(entry.from) || '—'} – {entry.to ? fmtCareerDate(entry.to) : t('common.present')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {nationalCareer.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />Sélection nationale
                </h4>
                <div className="space-y-1.5">
                  {nationalCareer.map((entry, i) => {
                    const { country, category } = parseNatTeamLabel(entry.club);
                    return (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 text-sm">
                        <FlagIcon nationality={country} size="sm" className="shrink-0" />
                        <span className="font-semibold flex-1 truncate">{country}</span>
                        {category !== 'A' && (
                          <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5 rounded font-bold shrink-0">{category}</span>
                        )}
                        <span className="text-xs text-muted-foreground shrink-0">
                          {fmtCareerDate(entry.from) || '—'} – {entry.to ? fmtCareerDate(entry.to) : t('common.present')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {ext.description && (
              <div className="mt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t('profile.biography')}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-6">{ext.description as string}</p>
              </div>
            )}
          </CardContent>
        </>
      );
    },

    physique: () => renderNoteZone('physique', '🏋️', 'profile.zone_physique', 'profile.zone_physique_placeholder'),
    avec_ballon: () => renderNoteZone('avec_ballon', '⚽', 'profile.zone_avec_ballon', 'profile.zone_avec_ballon_placeholder'),
    sans_ballon: () => renderNoteZone('sans_ballon', '🏃', 'profile.zone_sans_ballon', 'profile.zone_sans_ballon_placeholder'),
    mental: () => renderNoteZone('mental', '🧠', 'profile.zone_mental', 'profile.zone_mental_placeholder'),
    personnelles: () => renderNoteZone('personnelles', '📝', 'profile.personal_notes', 'profile.notes_placeholder'),

    reports: () => (
      <>
        <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
          <CardTitle className="text-base">{t('profile.reports_title', { count: reports.length })}</CardTitle>
          <Button size="sm" className="rounded-xl" onClick={() => setAddReportOpen(true)}>
            <PlusCircle className="w-3.5 h-3.5 mr-1.5" />{t('profile.add_report')}
          </Button>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {reports.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">{t('profile.no_reports')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.slice(0, 5).map((report, i) => (
                <div key={report.id} className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className={`w-3 h-3 rounded-full shrink-0 ${report.opinion === 'À suivre' ? 'bg-success' : report.opinion === 'À revoir' ? 'bg-warning' : 'bg-destructive'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">{report.title || formatDate(report.report_date)}</p>
                    {i === 0 && <p className="text-xs text-primary font-medium">{t('profile.last_report')}</p>}
                  </div>
                  <OpinionBadge opinion={report.opinion} size="sm" />
                  <button onClick={() => openEditReport(report)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {report.file_url && (
                    <a href={report.file_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
                      <FileText className="w-3 h-3" /> {t('profile.view')}
                    </a>
                  )}
                  {report.drive_link && (
                    <a href={report.drive_link} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
                      <ExternalLink className="w-3 h-3" /> {t('profile.view')}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </>
    ),

    evolution: () => (
      <>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-base">{t('profile.evolution')}</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Legend />
              <Line type="monotone" dataKey="niveau" stroke="hsl(var(--success))" strokeWidth={2.5} name={t('profile.level')} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="potentiel" stroke="hsl(var(--primary))" strokeWidth={2.5} name={t('profile.potential')} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </>
    ),

    similar: () => (
      <CardContent className="p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">{t('profile.similar_players')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {similarPlayers.map(sp => (
            <Link key={sp.id} to={`/player/${sp.id}`} className="block">
              <div className="p-4 text-center rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="relative inline-block mb-2">
                  <PlayerAvatar name={sp.name} photoUrl={sp.photo_url} size="md" />
                  <div className="absolute -bottom-1 -right-1"><ClubBadge club={sp.club} size="sm" /></div>
                </div>
                <p className="font-bold text-sm truncate">{sp.name}</p>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <FlagIcon nationality={sp.nationality} size="sm" />{sp.club}
                </p>
                <p className="text-lg font-bold font-mono mt-1">{sp.potential}</p>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    ),
  };

  // ── Render ──

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">{t('sidebar.dashboard')}</Link>
        <span className="text-muted-foreground">›</span>
        <Link to="/players" className="text-muted-foreground hover:text-foreground transition-colors">{t('profile.players_breadcrumb')}</Link>
        <span className="text-muted-foreground">›</span>
        <span className="font-semibold">{player.name}</span>
      </div>

      {/* Hero — fixed, not draggable */}
      <Card className="card-warm overflow-hidden">
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex items-start gap-5">
              <div className="relative">
                <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="hero" />
                <div className="absolute -bottom-2 -right-2"><ClubBadge club={player.club} size="lg" /></div>
              </div>
              <div className="pt-2">
                <h1 className="text-2xl md:text-3xl font-bold">{player.name}</h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <FlagIcon nationality={player.nationality} size="lg" />{player.nationality}
                  </span>
                  <span>{age} {t('common.year')} ({player.generation})</span>
                  <span>{posShort[player.position]} · {posLabels[player.position]}{player.position_secondaire ? ` / ${player.position_secondaire}` : ''} · {player.foot}</span>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center gap-2">
                    <ClubBadge club={player.club} size="sm" />
                    <div>
                      <p className="text-sm font-semibold">{player.club}</p>
                      {ext.on_loan && ext.parent_club ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">{t('profile.on_loan')}</span>
                          <ClubBadge club={ext.parent_club} size="xs" />
                          <span className="text-xs text-muted-foreground">{ext.parent_club}</span>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">{resolveLeagueName(player.club, player.league)}</p>
                      )}
                    </div>
                  </div>
                  {player.role && <span className="px-2.5 py-1 rounded-lg bg-muted text-xs font-medium">{player.role}</span>}
                </div>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-xl shrink-0">
                  <MoreHorizontal className="w-4 h-4 mr-1.5" />
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link to={`/player/${player.id}/edit`} className="flex items-center gap-2.5">
                    <Edit className="w-4 h-4" />
                    {t('profile.edit')}
                  </Link>
                </DropdownMenuItem>
                {hasOrg && (
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="p-0">
                    <ShareWithOrgPopover playerId={player.id} />
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="flex items-center gap-2.5">
                  <FileDown className="w-4 h-4" />
                  {t('profile.pdf')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setEditMode(true)}
                  className="flex items-center gap-2.5"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  {t('profile.reorganize_page')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setManageFieldsOpen(true)}
                  className="flex items-center gap-2.5"
                >
                  <ListPlus className="w-4 h-4" />
                  {t('custom_fields.manage')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleEnrich()}
                  disabled={enriching || !isPremium}
                  className="flex items-center gap-2.5"
                >
                  <RefreshCw className={`w-4 h-4 ${enriching ? 'animate-spin' : ''}`} />
                  {enriching ? t('profile.enriching') : t('profile.enrich')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>

      {/* Edit mode banner */}
      {editMode && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20">
          <LayoutDashboard className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm text-primary font-medium flex-1">{t('profile.edit_mode_hint')}</p>
          <Button size="sm" className="rounded-xl" onClick={() => setEditMode(false)}>
            <Check className="w-3.5 h-3.5 mr-1.5" />{t('profile.edit_mode_done')}
          </Button>
        </div>
      )}

      {/* All cards — draggable & resizable grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleOrder} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleOrder.map(cardId => (
              <SortableCard key={cardId} id={cardId} size={layout.sizes[cardId]} onToggleSize={() => toggleSize(cardId)} editMode={editMode}>
                {cardRenderers[cardId]()}
              </SortableCard>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Edit Report Dialog */}
      <Dialog open={!!editingReport} onOpenChange={(o) => { if (!o) setEditingReport(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('profile.edit_report')}</DialogTitle>
            <DialogDescription>{t('profile.edit_report_desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('profile.report_title')}</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder={t('profile.report_title_placeholder')} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('profile.report_link')}</label>
              <Input value={editLink} onChange={(e) => setEditLink(e.target.value)} placeholder={t('profile.report_link_placeholder')} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('profile.report_file')}</label>
              {editReportFile ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 border">
                  <FileText className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-sm truncate flex-1">{editReportFile.name}</span>
                  <button type="button" onClick={() => setEditReportFile(null)} className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : editingReport?.file_url ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 border">
                  <FileText className="w-4 h-4 text-red-500 shrink-0" />
                  <a href={editingReport.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary truncate flex-1 hover:underline">PDF</a>
                  <label className="px-2 py-1 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 cursor-pointer transition-colors">
                    {t('profile.report_file_replace')}
                    <input type="file" accept=".pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setEditReportFile(e.target.files[0]); }} />
                  </label>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed cursor-pointer hover:bg-muted/30 transition-colors">
                  <Upload className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('profile.report_file_placeholder')}</span>
                  <input type="file" accept=".pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setEditReportFile(e.target.files[0]); }} />
                </label>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setEditingReport(null)}>{t('common.cancel')}</Button>
            <Button className="rounded-xl" onClick={handleSaveReport} disabled={savingReport}>
              {savingReport ? t('profile.saving_report') : t('profile.save_report')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Report Dialog */}
      <Dialog open={addReportOpen} onOpenChange={setAddReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('profile.add_report_title')}</DialogTitle>
            <DialogDescription>{t('profile.add_report_desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('profile.report_title')}</label>
              <Input value={newReportTitle} onChange={(e) => setNewReportTitle(e.target.value)} placeholder={t('profile.report_title_placeholder')} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('player_form.report_date')}</label>
              <Input type="date" value={newReportDate} onChange={(e) => setNewReportDate(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('player_form.report_opinion')}</label>
              <div className="flex gap-2">
                {(['À suivre', 'À revoir', 'Défavorable'] as Opinion[]).map(o => (
                  <Button key={o} type="button" size="sm" variant={newReportOpinion === o ? 'default' : 'outline'} className="rounded-xl" onClick={() => setNewReportOpinion(o)}>{o}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('profile.report_link')}</label>
              <Input value={newReportLink} onChange={(e) => setNewReportLink(e.target.value)} placeholder={t('profile.report_link_placeholder')} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('profile.report_file')}</label>
              {newReportFile ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 border">
                  <FileText className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-sm truncate flex-1">{newReportFile.name}</span>
                  <button type="button" onClick={() => setNewReportFile(null)} className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed cursor-pointer hover:bg-muted/30 transition-colors">
                  <Upload className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('profile.report_file_placeholder')}</span>
                  <input type="file" accept=".pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setNewReportFile(e.target.files[0]); }} />
                </label>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setAddReportOpen(false)}>{t('common.cancel')}</Button>
            <Button className="rounded-xl" onClick={handleAddReport} disabled={addReport.isPending || uploadingFile}>
              {(addReport.isPending || uploadingFile) ? t('profile.saving_report') : t('profile.add_report')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete zone — bottom of page */}
      <Card className="border border-destructive/20 bg-destructive/5">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-destructive">{t('profile.danger_zone')}</h3>
              <p className="text-xs text-muted-foreground mt-1">{t('profile.delete_confirm_desc')}</p>
            </div>
            <Button size="sm" variant="destructive" className="rounded-xl shrink-0" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />{t('profile.delete')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirm(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('profile.delete_confirm_title', { name: player.name })}</DialogTitle>
            <DialogDescription>{t('profile.delete_confirm_desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-center select-none">{player.name}</p>
            <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder={t('profile.delete_type_name')} className="rounded-xl" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" className="rounded-xl" disabled={deleteConfirm !== player.name || deleting} onClick={handleDelete}>
              {deleting ? t('common.deleting') : t('profile.delete_permanently')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom fields manager — controlled mode */}
      <CustomFieldsManager externalOpen={manageFieldsOpen} onExternalOpenChange={setManageFieldsOpen} />
    </div>
  );
}
