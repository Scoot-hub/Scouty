import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useContacts, useUpsertContact, useDeleteContact } from '@/hooks/use-contacts';
import type { Contact } from '@/types/contact';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PhotoUpload } from '@/components/ui/photo-upload';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  PlusCircle, Search, Phone, Mail, Linkedin, Building2, Trash2, Pencil,
  User, StickyNote, Share2, Copy, Send, MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const emptyForm = {
  first_name: '',
  last_name: '',
  photo_url: '',
  organization: '',
  role_title: '',
  phone: '',
  email: '',
  linkedin_url: '',
  notes: '',
};

export default function Contacts() {
  const { t } = useTranslation();
  const { data: contacts = [], isLoading } = useContacts();
  const upsert = useUpsertContact();
  const remove = useDeleteContact();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [shareTarget, setShareTarget] = useState<Contact | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [form, setForm] = useState(emptyForm);

  const buildShareText = (c: Contact) => {
    const lines = [`${c.first_name} ${c.last_name}`.trim()];
    if (c.role_title) lines.push(c.role_title);
    if (c.organization) lines.push(c.organization);
    if (c.phone) lines.push(c.phone);
    if (c.email) lines.push(c.email);
    if (c.linkedin_url) lines.push(c.linkedin_url);
    return lines.join('\n');
  };

  const handleShare = async (c: Contact, method: 'native' | 'copy' | 'email' | 'whatsapp' | 'sms') => {
    const text = buildShareText(c);
    const name = `${c.first_name} ${c.last_name}`.trim();
    const subject = t('contacts.share_subject', { name });

    switch (method) {
      case 'native':
        if (navigator.share) {
          try { await navigator.share({ title: name, text }); } catch { /* user cancelled */ }
        }
        break;
      case 'copy':
        await navigator.clipboard.writeText(text);
        toast.success(t('contacts.shared'));
        break;
      case 'email':
        window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`);
        break;
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        break;
      case 'sms':
        window.open(`sms:?body=${encodeURIComponent(text)}`);
        break;
    }
    setShareTarget(null);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(c =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      c.organization.toLowerCase().includes(q) ||
      c.role_title.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(undefined);
    setDialogOpen(true);
  };

  const openEdit = (c: Contact) => {
    setForm({
      first_name: c.first_name,
      last_name: c.last_name,
      photo_url: c.photo_url ?? '',
      organization: c.organization,
      role_title: c.role_title,
      phone: c.phone,
      email: c.email,
      linkedin_url: c.linkedin_url ?? '',
      notes: c.notes ?? '',
    });
    setEditingId(c.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.last_name.trim() && !form.first_name.trim()) {
      toast.error(t('contacts.name_required'));
      return;
    }
    try {
      await upsert.mutateAsync({
        ...form,
        photo_url: form.photo_url || undefined,
        linkedin_url: form.linkedin_url || undefined,
        notes: form.notes || undefined,
        id: editingId,
      } as any);
      toast.success(editingId ? t('contacts.updated') : t('contacts.added'));
      setDialogOpen(false);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success(t('contacts.deleted'));
    } catch {
      toast.error(t('common.error'));
    }
    setDeleteTarget(null);
  };

  const getInitials = (c: Contact) => {
    const f = c.first_name?.[0] ?? '';
    const l = c.last_name?.[0] ?? '';
    return (f + l).toUpperCase() || '?';
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      'from-blue-500 to-blue-600',
      'from-emerald-500 to-emerald-600',
      'from-violet-500 to-violet-600',
      'from-amber-500 to-amber-600',
      'from-rose-500 to-rose-600',
      'from-cyan-500 to-cyan-600',
      'from-indigo-500 to-indigo-600',
      'from-pink-500 to-pink-600',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('contacts.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('contacts.subtitle')}
          </p>
        </div>
        <Button onClick={openNew} className="rounded-xl gap-2">
          <PlusCircle className="w-4 h-4" />
          {t('contacts.add')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('contacts.search_placeholder')}
          className="pl-9 rounded-xl"
        />
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground">
        {filtered.length} {t('contacts.count')}
      </p>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <User className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">{t('contacts.empty')}</p>
          <Button variant="outline" onClick={openNew} className="rounded-xl gap-2">
            <PlusCircle className="w-4 h-4" />
            {t('contacts.add_first')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(c => (
            <div
              key={c.id}
              className="group relative bg-card border border-border rounded-2xl p-4 hover:shadow-md transition-all cursor-pointer"
              onClick={() => openEdit(c)}
            >
              {/* Actions */}
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); openEdit(c); }}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setShareTarget(c); }}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setDeleteTarget(c); }}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>

              <div className="flex items-start gap-3">
                {/* Avatar */}
                {c.photo_url ? (
                  <img src={c.photo_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 bg-gradient-to-br',
                    getAvatarColor(`${c.first_name} ${c.last_name}`)
                  )}>
                    {getInitials(c)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm truncate">
                    {c.first_name} {c.last_name}
                  </h3>
                  {c.role_title && (
                    <p className="text-xs text-muted-foreground truncate">{c.role_title}</p>
                  )}
                  {c.organization && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Building2 className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground truncate">{c.organization}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Contact info */}
              <div className="mt-3 space-y-1">
                {c.phone && (
                  <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Phone className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{c.phone}</span>
                  </a>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </a>
                )}
                {c.linkedin_url && (
                  <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Linkedin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">LinkedIn</span>
                  </a>
                )}
                {c.notes && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <StickyNote className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{c.notes}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t('contacts.edit_title') : t('contacts.add_title')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <PhotoUpload
              currentUrl={form.photo_url}
              onPhotoChange={url => setForm(f => ({ ...f, photo_url: url }))}
              label={t('contacts.photo')}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('contacts.first_name')}</Label>
                <Input
                  value={form.first_name}
                  onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                  placeholder={t('contacts.first_name')}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('contacts.last_name')}</Label>
                <Input
                  value={form.last_name}
                  onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                  placeholder={t('contacts.last_name')}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('contacts.organization')}</Label>
                <Input
                  value={form.organization}
                  onChange={e => setForm(f => ({ ...f, organization: e.target.value }))}
                  placeholder={t('contacts.organization_placeholder')}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('contacts.role_title')}</Label>
                <Input
                  value={form.role_title}
                  onChange={e => setForm(f => ({ ...f, role_title: e.target.value }))}
                  placeholder={t('contacts.role_placeholder')}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('contacts.phone')}</Label>
                <Input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+33 6 12 34 56 78"
                  type="tel"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('contacts.email')}</Label>
                <Input
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="contact@example.com"
                  type="email"
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>LinkedIn</Label>
              <Input
                value={form.linkedin_url}
                onChange={e => setForm(f => ({ ...f, linkedin_url: e.target.value }))}
                placeholder="https://linkedin.com/in/..."
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t('contacts.notes')}</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={t('contacts.notes_placeholder')}
                rows={3}
                className="rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={upsert.isPending} className="rounded-xl">
                {upsert.isPending ? t('common.loading') : t('common.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share dialog */}
      <Dialog open={!!shareTarget} onOpenChange={open => !open && setShareTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('contacts.share_title')}</DialogTitle>
          </DialogHeader>

          {shareTarget && (
            <div className="space-y-3 pt-1">
              {/* Preview */}
              <div className="rounded-xl bg-muted/50 p-3 text-sm whitespace-pre-line text-muted-foreground">
                {buildShareText(shareTarget)}
              </div>

              {/* Share options */}
              <div className="grid grid-cols-2 gap-2">
                {typeof navigator.share === 'function' && (
                  <button
                    onClick={() => handleShare(shareTarget, 'native')}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border hover:bg-muted transition-colors text-sm font-medium"
                  >
                    <Share2 className="w-4 h-4 text-blue-500" />
                    {t('contacts.share_native')}
                  </button>
                )}
                <button
                  onClick={() => handleShare(shareTarget, 'email')}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border hover:bg-muted transition-colors text-sm font-medium"
                >
                  <Mail className="w-4 h-4 text-orange-500" />
                  Email
                </button>
                <button
                  onClick={() => handleShare(shareTarget, 'whatsapp')}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border hover:bg-muted transition-colors text-sm font-medium"
                >
                  <MessageCircle className="w-4 h-4 text-green-500" />
                  WhatsApp
                </button>
                <button
                  onClick={() => handleShare(shareTarget, 'sms')}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border hover:bg-muted transition-colors text-sm font-medium"
                >
                  <Send className="w-4 h-4 text-blue-400" />
                  SMS
                </button>
                <button
                  onClick={() => handleShare(shareTarget, 'copy')}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border hover:bg-muted transition-colors text-sm font-medium"
                >
                  <Copy className="w-4 h-4 text-muted-foreground" />
                  {t('contacts.share_copy')}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('contacts.delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('contacts.delete_desc', { name: `${deleteTarget?.first_name} ${deleteTarget?.last_name}` })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
