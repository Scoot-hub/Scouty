import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFollowedClubs } from '@/hooks/use-followed-clubs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ClubBadge } from '@/components/ui/club-badge';
import DateInput from '@/components/ui/date-input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  BookUser, Plus, Search, Building2, Phone, Mail, Linkedin,
  Pencil, Trash2, MoreHorizontal, StickyNote, ExternalLink, UserCircle, Camera, X as XIcon,
  AlertTriangle, AlertCircle, Youtube, Twitter, Instagram, MapPin, Cake,
  ChevronDown, ChevronUp, Globe2, History, CalendarDays, Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { formatDate } from '@/lib/format-utils';

// ── Render "other_contacts" : URLs → <a>, téléphones → tel:, texte → <span> ──
function renderOtherContacts(text: string): React.ReactNode {
  const URL_RE = /https?:\/\/[^\s]+/g;
  const PHONE_RE = /^[+\d][\d\s\-().]{6,}$/;

  return text.split('\n').map((line, li) => {
    if (!line.trim()) return <br key={li} />;

    // If the whole line is a URL
    if (URL_RE.test(line.trim())) {
      URL_RE.lastIndex = 0;
      const parts: React.ReactNode[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      URL_RE.lastIndex = 0;
      while ((m = URL_RE.exec(line)) !== null) {
        if (m.index > last) parts.push(<span key={last}>{line.slice(last, m.index)}</span>);
        parts.push(
          <a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-80 inline-flex items-center gap-0.5 break-all">
            {m[0]}<ExternalLink className="w-2.5 h-2.5 shrink-0" />
          </a>
        );
        last = m.index + m[0].length;
      }
      if (last < line.length) parts.push(<span key={last}>{line.slice(last)}</span>);
      return <div key={li} className="flex items-start gap-1">{parts}</div>;
    }

    // If the whole line looks like a phone number
    if (PHONE_RE.test(line.trim())) {
      return (
        <div key={li} className="flex items-center gap-1">
          <a href={`tel:${line.trim().replace(/[\s\-().]/g, '')}`}
            className="text-primary underline underline-offset-2 hover:opacity-80 flex items-center gap-1">
            <Phone className="w-2.5 h-2.5 shrink-0" />{line.trim()}
          </a>
        </div>
      );
    }

    return <div key={li}>{line}</div>;
  });
}

function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('0033') && d.length >= 13) return '33' + d.slice(4);
  if (d.startsWith('33') && d.length >= 11) return d;
  if (d.startsWith('0') && d.length >= 9) return '33' + d.slice(1);
  return d;
}

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface ClubContact {
  id: number;
  user_id: string;
  club_name: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  linkedin: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  // new
  nickname: string | null;
  birth_date: string | null;
  company: string | null;
  address: string | null;
  youtube: string | null;
  twitter: string | null;
  instagram: string | null;
  other_contacts: string | null;
  context: string | null;
  last_exchange_at: string | null;
  proximity: number | null;
  trust: number | null;
  reactivity: number | null;
}

const EMPTY_FORM = {
  club_name: '', name: '', role: '', phone: '', email: '', linkedin: '', notes: '',
  nickname: '', birth_date: '', company: '', address: '',
  youtube: '', twitter: '', instagram: '', other_contacts: '',
  context: '', last_exchange_at: '',
  proximity: 0, trust: 0, reactivity: 0,
};

// ── Collapsible section (same pattern as recruitment) ────────────────────────
function CollapsibleSection({
  icon: Icon, label, openLabel, open, onToggle, children,
}: {
  icon: React.ElementType; label: string; openLabel?: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold transition-colors',
          open
            ? 'bg-muted/60 text-foreground'
            : 'bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
        )}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left">{open && openLabel ? openLabel : label}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="p-3 space-y-3 border-t border-border/60 bg-muted/5 animate-in fade-in slide-in-from-top-1 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Scale rating (1–5 dots) ─────────────────────────────────────────────────
function ScaleRating({
  value, onChange, label, color = 'primary',
}: {
  value: number; onChange: (v: number) => void; label: string;
  color?: 'primary' | 'emerald' | 'amber';
}) {
  const colorMap = {
    primary: 'bg-primary',
    emerald: 'bg-emerald-500',
    amber:   'bg-amber-500',
  };
  const dimMap = {
    primary: 'bg-primary/20',
    emerald: 'bg-emerald-500/20',
    amber:   'bg-amber-500/20',
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        {value > 0 && (
          <button type="button" onClick={() => onChange(0)}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
            ×
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n === value ? 0 : n)}
            className={cn(
              'w-7 h-7 rounded-full border-2 transition-all text-[10px] font-bold',
              n <= value
                ? `${colorMap[color]} border-transparent text-white shadow-sm`
                : `${dimMap[color]} border-transparent text-muted-foreground hover:border-current`
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Scale display (card) ────────────────────────────────────────────────────
function ScaleDisplay({
  value, label, color = 'primary',
}: {
  value: number | null; label: string; color?: 'primary' | 'emerald' | 'amber';
}) {
  if (!value) return null;
  const colorMap = {
    primary: 'bg-primary',
    emerald: 'bg-emerald-500',
    amber:   'bg-amber-500',
  };
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(n => (
          <div key={n} className={cn('w-2 h-2 rounded-full', n <= value ? colorMap[color] : 'bg-muted')} />
        ))}
      </div>
    </div>
  );
}

// ── Dialog ──────────────────────────────────────────────────────────────────
function ContactDialog({
  open, onOpenChange, initial, suggestedClubs, allContacts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Partial<ClubContact> & { id?: number };
  suggestedClubs: string[];
  allContacts: ClubContact[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isEdit = !!initial.id;

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [clubSugs, setClubSugs] = useState<string[]>([]);
  const [showClubSugs, setShowClubSugs] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCoords, setShowCoords] = useState(false);
  const [showRelation, setShowRelation] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      club_name: initial.club_name ?? '',
      name: initial.name ?? '',
      role: initial.role ?? '',
      phone: initial.phone ?? '',
      email: initial.email ?? '',
      linkedin: initial.linkedin ?? '',
      notes: initial.notes ?? '',
      nickname: initial.nickname ?? '',
      birth_date: initial.birth_date ? initial.birth_date.split('T')[0] : '',
      company: initial.company ?? '',
      address: initial.address ?? '',
      youtube: initial.youtube ?? '',
      twitter: initial.twitter ?? '',
      instagram: initial.instagram ?? '',
      other_contacts: initial.other_contacts ?? '',
      context: initial.context ?? '',
      last_exchange_at: initial.last_exchange_at ? initial.last_exchange_at.split('T')[0] : '',
      proximity: initial.proximity ?? 0,
      trust: initial.trust ?? 0,
      reactivity: initial.reactivity ?? 0,
    });
    setPhotoPreview(initial.photo_url ?? null);
    setPhotoFile(null);
    setClubSugs([]); setShowClubSugs(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    const hasCoords = !!(initial.nickname || initial.birth_date || initial.company ||
      initial.address || initial.linkedin || initial.youtube || initial.twitter ||
      initial.instagram || initial.other_contacts);
    const hasRelation = !!(initial.context || initial.last_exchange_at ||
      initial.proximity || initial.trust || initial.reactivity);
    setShowCoords(hasCoords);
    setShowRelation(hasRelation);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const dupCheck = useMemo(() => {
    const myEmail = form.email.trim().toLowerCase();
    const myPhone = form.phone.trim() ? normalizePhone(form.phone.trim()) : '';
    if (!myEmail && myPhone.length < 7) return null;
    const seen = new Set<number>();
    const matches = allContacts.filter(c => {
      if (isEdit && c.id === initial.id) return false;
      if (seen.has(c.id)) return false;
      const emailMatch = myEmail && c.email && c.email.toLowerCase() === myEmail;
      const phoneMatch = myPhone.length >= 7 && c.phone && normalizePhone(c.phone) === myPhone;
      if (emailMatch || phoneMatch) { seen.add(c.id); return true; }
      return false;
    });
    if (!matches.length) return null;
    const club = form.club_name.trim().toLowerCase();
    return {
      sameClub: matches.filter(c => c.club_name.toLowerCase() === club),
      otherClub: matches.filter(c => c.club_name.toLowerCase() !== club),
    };
  }, [form.email, form.phone, form.club_name, allContacts, isEdit, initial.id]);

  const isBlocked = (dupCheck?.sameClub.length ?? 0) > 0;

  const setField = (k: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const handleClubInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm(f => ({ ...f, club_name: val }));
    const matches = suggestedClubs.filter(c => c.toLowerCase().includes(val.toLowerCase())).slice(0, 6);
    setClubSugs(matches); setShowClubSugs(val.length >= 1 && matches.length > 0);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const removePhoto = () => {
    setPhotoFile(null); setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadPhoto = async (contactId: number) => {
    if (!photoFile) return;
    try {
      const fd = new FormData();
      fd.append('photo', photoFile);
      const res = await fetch(`${API}/club-contacts/${contactId}/photo`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      if (!res.ok) throw new Error();
    } catch { toast.error(t('club_contacts.photo_upload_error')); }
  };

  const save = async () => {
    if (!form.name.trim() || !form.club_name.trim()) {
      toast.error(t('club_contacts.missing_required')); return;
    }
    if (isBlocked) { toast.error(t('club_contacts.dup_blocked')); return; }
    setSaving(true);
    try {
      const url = isEdit ? `${API}/club-contacts/${initial.id}` : `${API}/club-contacts`;
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          birth_date: form.birth_date || null,
          last_exchange_at: form.last_exchange_at || null,
          proximity: form.proximity || null,
          trust: form.trust || null,
          reactivity: form.reactivity || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const body = await res.json();
      const contactId = isEdit ? initial.id! : (body.contact?.id ?? body.id);
      if (photoFile && contactId) await uploadPhoto(contactId);
      qc.invalidateQueries({ queryKey: ['club-contacts'] });
      toast.success(t('common.saved'));
      onOpenChange(false);
    } catch { toast.error(t('common.error')); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <BookUser className="w-4 h-4 text-primary" />
            {isEdit ? t('club_contacts.edit_contact') : t('club_contacts.add_contact')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {/* Photo */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 rounded-full overflow-hidden bg-muted border-2 border-dashed border-border hover:border-primary/50 transition-colors flex items-center justify-center group">
                {photoPreview
                  ? <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                  : <Camera className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />}
              </button>
              {photoPreview && (
                <button type="button" onClick={removePhoto}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm">
                  <XIcon className="w-3 h-3" />
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">{t('club_contacts.photo_label')}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t('club_contacts.photo_hint')}</p>
            </div>
          </div>

          {/* Club */}
          <div className="space-y-1 relative">
            <Label className="text-xs">{t('club_contacts.club')} *</Label>
            <Input value={form.club_name} onChange={handleClubInput}
              onFocus={() => form.club_name && setShowClubSugs(clubSugs.length > 0)}
              onBlur={() => setTimeout(() => setShowClubSugs(false), 150)}
              placeholder={t('club_contacts.club_placeholder')} className="text-sm" />
            {showClubSugs && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
                {clubSugs.map(c => (
                  <button key={c} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                    onMouseDown={e => { e.preventDefault(); setForm(f => ({ ...f, club_name: c })); setShowClubSugs(false); }}>
                    <ClubBadge club={c} size="sm" />{c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Name + Surnom */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('club_contacts.contact_name')} *</Label>
              <Input value={form.name} onChange={setField('name')} placeholder={t('club_contacts.name_placeholder')} className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('club_contacts.nickname')}</Label>
              <Input value={form.nickname} onChange={setField('nickname')} placeholder={t('club_contacts.nickname_placeholder')} className="text-sm" />
            </div>
          </div>

          {/* Role + Company */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('club_contacts.role')}</Label>
              <Input value={form.role} onChange={setField('role')} placeholder={t('club_contacts.role_placeholder')} className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Building2 className="w-3 h-3" />{t('club_contacts.company')}</Label>
              <Input value={form.company} onChange={setField('company')} placeholder={t('club_contacts.company_placeholder')} className="text-sm" />
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Phone className="w-3 h-3" />{t('club_contacts.phone')}</Label>
              <Input value={form.phone} onChange={setField('phone')} placeholder="+33 6 …" className="text-sm" type="tel" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Mail className="w-3 h-3" />{t('club_contacts.email')}</Label>
              <Input value={form.email} onChange={setField('email')} placeholder="contact@…" className="text-sm" type="email" />
            </div>
          </div>

          {/* Duplicate warnings */}
          {dupCheck?.sameClub.map(c => (
            <div key={c.id} className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{t('club_contacts.dup_same_club', { name: c.name, club: c.club_name })}</p>
            </div>
          ))}
          {!isBlocked && dupCheck?.otherClub.map(c => (
            <div key={c.id} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">{t('club_contacts.dup_other_club', { name: c.name, club: c.club_name })}</p>
            </div>
          ))}

          {/* ── Section : Coordonnées & réseaux ── */}
          <CollapsibleSection
            icon={Globe2}
            label={t('club_contacts.show_coords')}
            openLabel={t('club_contacts.section_coords')}
            open={showCoords}
            onToggle={() => setShowCoords(v => !v)}
          >
            {/* Date de naissance + Adresse */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Cake className="w-3 h-3" />{t('club_contacts.birth_date')}</Label>
                <DateInput value={form.birth_date} onChange={v => setForm(f => ({ ...f, birth_date: v }))} className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" />{t('club_contacts.address')}</Label>
                <Input value={form.address} onChange={setField('address')} placeholder={t('club_contacts.address_placeholder')} className="text-sm" />
              </div>
            </div>

            {/* YouTube */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Youtube className="w-3 h-3 text-red-500" />{t('club_contacts.youtube')}</Label>
              <Input value={form.youtube} onChange={setField('youtube')} placeholder={t('club_contacts.youtube_placeholder')} className="text-sm" />
            </div>

            {/* LinkedIn */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Linkedin className="w-3 h-3 text-blue-600" />LinkedIn</Label>
              <Input value={form.linkedin} onChange={setField('linkedin')} placeholder="https://linkedin.com/in/…" className="text-sm" />
            </div>

            {/* Twitter + Instagram */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Twitter className="w-3 h-3 text-sky-500" />{t('club_contacts.twitter')}</Label>
                <Input value={form.twitter} onChange={setField('twitter')} placeholder={t('club_contacts.twitter_placeholder')} className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Instagram className="w-3 h-3 text-pink-500" />{t('club_contacts.instagram')}</Label>
                <Input value={form.instagram} onChange={setField('instagram')} placeholder={t('club_contacts.instagram_placeholder')} className="text-sm" />
              </div>
            </div>

            {/* Autre — WhatsApp, Telegram, numéros, liens libres */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Link2 className="w-3 h-3" />{t('club_contacts.other_contacts')}
              </Label>
              <Textarea
                value={form.other_contacts}
                onChange={setField('other_contacts')}
                placeholder={t('club_contacts.other_contacts_placeholder')}
                className="min-h-[80px] resize-none text-sm font-mono"
              />
              <p className="text-[10px] text-muted-foreground">{t('club_contacts.other_contacts_hint')}</p>
            </div>
          </CollapsibleSection>

          {/* ── Section : Relation & historique ── */}
          <CollapsibleSection
            icon={History}
            label={t('club_contacts.show_relation')}
            openLabel={t('club_contacts.section_relation')}
            open={showRelation}
            onToggle={() => setShowRelation(v => !v)}
          >
            {/* Dernier échange */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><CalendarDays className="w-3 h-3" />{t('club_contacts.last_exchange')}</Label>
              <DateInput value={form.last_exchange_at} onChange={v => setForm(f => ({ ...f, last_exchange_at: v }))} className="text-sm" />
            </div>

            {/* Échelles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <ScaleRating
                value={form.proximity} onChange={v => setForm(f => ({ ...f, proximity: v }))}
                label={t('club_contacts.proximity')} color="primary"
              />
              <ScaleRating
                value={form.trust} onChange={v => setForm(f => ({ ...f, trust: v }))}
                label={t('club_contacts.trust')} color="emerald"
              />
              <ScaleRating
                value={form.reactivity} onChange={v => setForm(f => ({ ...f, reactivity: v }))}
                label={t('club_contacts.reactivity')} color="amber"
              />
            </div>

            {/* Contexte */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><StickyNote className="w-3 h-3" />{t('club_contacts.context')}</Label>
              <Textarea value={form.context} onChange={setField('context')}
                placeholder={t('club_contacts.context_placeholder')}
                className="min-h-[70px] resize-none text-sm" />
            </div>
          </CollapsibleSection>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><StickyNote className="w-3 h-3" />{t('club_contacts.notes')}</Label>
            <Textarea value={form.notes} onChange={setField('notes')} placeholder={t('club_contacts.notes_placeholder')} className="min-h-[70px] resize-none text-sm" />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t shrink-0">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={save} disabled={saving || isBlocked}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
function ContactCard({ contact, onEdit, onDelete }: {
  contact: ClubContact; onEdit: () => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { dateFormat } = useUiPreferences();

  const hasScales = !!(contact.proximity || contact.trust || contact.reactivity);

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-muted/30 transition-colors group/card">
      <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0 border border-border">
        {contact.photo_url
          ? <img src={contact.photo_url} alt={contact.name} className="w-full h-full object-cover" />
          : <UserCircle className="w-5 h-5 text-primary/60" />}
      </div>

      <div className="flex-1 min-w-0">
        {/* Name + role + badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold truncate">{contact.name}</p>
          {contact.nickname && (
            <span className="text-[11px] text-muted-foreground italic">«{contact.nickname}»</span>
          )}
          {contact.role && <Badge variant="outline" className="text-[10px] py-0 h-4">{contact.role}</Badge>}
          {contact.company && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Building2 className="w-2.5 h-2.5 shrink-0" />{contact.company}
            </span>
          )}
        </div>

        {/* Contact links */}
        <div className="flex flex-wrap gap-3 mt-1">
          {contact.phone && (
            <a href={`tel:${contact.phone.replace(/[\s.\-()]/g, '')}`} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
              <Phone className="w-3 h-3 shrink-0" />{contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-[11px] text-primary hover:underline break-all">
              <Mail className="w-3 h-3 shrink-0" />{contact.email}
            </a>
          )}
          {contact.linkedin && (
            <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
              <Linkedin className="w-3 h-3 shrink-0" />LinkedIn
            </a>
          )}
          {contact.youtube && (
            <a href={contact.youtube} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-red-500 hover:underline">
              <Youtube className="w-3 h-3 shrink-0" />YouTube
            </a>
          )}
          {contact.twitter && (
            <a href={contact.twitter} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-sky-500 hover:underline">
              <Twitter className="w-3 h-3 shrink-0" />Twitter
            </a>
          )}
          {contact.instagram && (
            <a href={contact.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-pink-500 hover:underline">
              <Instagram className="w-3 h-3 shrink-0" />Instagram
            </a>
          )}
        </div>

        {/* Extra info row */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          {contact.birth_date && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Cake className="w-3 h-3" />{formatDate(contact.birth_date, 'DD/MM/YYYY')}
            </span>
          )}
          {contact.address && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" />{contact.address}
            </span>
          )}
          {contact.last_exchange_at && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />Dernier échange : {formatDate(contact.last_exchange_at, dateFormat)}
            </span>
          )}
        </div>

        {/* Scales */}
        {hasScales && (
          <div className="flex flex-wrap gap-3 mt-1.5">
            <ScaleDisplay value={contact.proximity} label={t('club_contacts.proximity')} color="primary" />
            <ScaleDisplay value={contact.trust} label={t('club_contacts.trust')} color="emerald" />
            <ScaleDisplay value={contact.reactivity} label={t('club_contacts.reactivity')} color="amber" />
          </div>
        )}

        {/* Other contacts (WhatsApp, Telegram, liens libres…) */}
        {contact.other_contacts && (
          <div className="mt-1 text-[11px] text-muted-foreground space-y-0.5">
            {renderOtherContacts(contact.other_contacts)}
          </div>
        )}

        {/* Context */}
        {contact.context && (
          <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-2 whitespace-pre-line italic">{contact.context}</p>
        )}

        {/* Notes */}
        {contact.notes && (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">{contact.notes}</p>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover/card:opacity-100 transition-opacity shrink-0">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit} className="gap-2">
            <Pencil className="w-3.5 h-3.5" />{t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />{t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function ClubContacts() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: followedClubs = [] } = useFollowedClubs();
  const suggestedClubs = useMemo(() => followedClubs.map(c => c.club_name), [followedClubs]);

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Partial<ClubContact> & { id?: number }>({});

  const { data, isLoading } = useQuery<{ contacts: ClubContact[] }>({
    queryKey: ['club-contacts'],
    queryFn: async () => {
      const res = await fetch(`${API}/club-contacts`, { credentials: 'include' });
      if (!res.ok) throw new Error('fetch_failed');
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const contacts = data?.contacts ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return contacts.filter(c =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.club_name.toLowerCase().includes(q) ||
      c.role?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.nickname?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ClubContact[]>();
    for (const c of filtered) {
      if (!map.has(c.club_name)) map.set(c.club_name, []);
      map.get(c.club_name)!.push(c);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const openAdd = () => { setEditTarget({}); setDialogOpen(true); };
  const openEdit = (c: ClubContact) => { setEditTarget(c); setDialogOpen(true); };

  const deleteContact = async (id: number) => {
    if (!confirm(t('club_contacts.confirm_delete'))) return;
    try {
      await fetch(`${API}/club-contacts/${id}`, { method: 'DELETE', credentials: 'include' });
      qc.invalidateQueries({ queryKey: ['club-contacts'] });
      toast.success(t('common.saved'));
    } catch { toast.error(t('common.error')); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <ContactDialog
        open={dialogOpen} onOpenChange={setDialogOpen}
        initial={editTarget} suggestedClubs={suggestedClubs}
        allContacts={contacts}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <BookUser className="w-6 h-6 text-primary" />
            {t('club_contacts.title')}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t('club_contacts.subtitle')}</p>
        </div>
        <Button onClick={openAdd} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />{t('club_contacts.add_contact')}
        </Button>
      </div>

      {/* Search */}
      {contacts.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('club_contacts.search_placeholder')} className="pl-10" />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16">
          <BookUser className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('club_contacts.empty')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1 mb-4">{t('club_contacts.empty_desc')}</p>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="w-4 h-4" />{t('club_contacts.add_contact')}
          </Button>
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('club_contacts.no_results')}</div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([clubName, clubContacts]) => (
            <Card key={clubName}>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Link to={`/club?club=${encodeURIComponent(clubName)}`}
                    className="flex items-center gap-2 hover:text-primary transition-colors">
                    <ClubBadge club={clubName} size="sm" />
                    <span className="font-semibold">{clubName}</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground/50" />
                  </Link>
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {clubContacts.length} {clubContacts.length === 1 ? t('club_contacts.contact_singular') : t('club_contacts.contact_plural')}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 divide-y divide-border/40">
                {clubContacts.map(c => (
                  <ContactCard key={c.id} contact={c}
                    onEdit={() => openEdit(c)} onDelete={() => deleteContact(c.id)} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
