import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  ChevronLeft, Save, Eye, Upload, X, Plus, Tag, ImageIcon, Loader2, Globe, FileEdit,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const RichTextEditor = lazy(() => import('@/components/RichTextEditor'));

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface Article {
  id: string;
  title: string;
  content: string;
  banner_url: string | null;
  keywords: string[] | string | null;
  status: 'draft' | 'published' | 'archived';
  lang: string | null;
}

const ARTICLE_LANGS = [
  { value: 'fr', label: '🇫🇷 Français' },
  { value: 'en', label: '🇬🇧 English' },
  { value: 'es', label: '🇪🇸 Español' },
  { value: 'pt', label: '🇵🇹 Português' },
  { value: 'de', label: '🇩🇪 Deutsch' },
  { value: 'it', label: '🇮🇹 Italiano' },
  { value: 'nl', label: '🇳🇱 Nederlands' },
  { value: 'ar', label: '🇸🇦 العربية' },
];

function parseKeywords(kw: string[] | string | null): string[] {
  if (!kw) return [];
  if (Array.isArray(kw)) return kw;
  try { return JSON.parse(kw); } catch { return []; }
}

export default function EditorialEditor() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!id && id !== 'new';
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwInput, setKwInput] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [articleLang, setArticleLang] = useState<string>(() => i18n.language.split('-')[0]);
  const [bannerUploading, setBannerUploading] = useState(false);

  const { data: articleData, isLoading: loadingArticle } = useQuery<Article>({
    queryKey: ['editorial-edit', id],
    queryFn: async () => {
      const res = await fetch(`${API}/editorial/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Not found');
      return res.json();
    },
    enabled: isEdit,
    staleTime: Infinity,
  });

  // Populate form fields once article data arrives
  useEffect(() => {
    if (!articleData) return;
    setTitle(articleData.title);
    setContent(articleData.content);
    setBannerUrl(articleData.banner_url);
    setBannerPreview(articleData.banner_url);
    setKeywords(parseKeywords(articleData.keywords));
    setStatus(articleData.status === 'archived' ? 'draft' : articleData.status);
    if (articleData.lang) setArticleLang(articleData.lang);
  }, [articleData]);

  const saveMut = useMutation({
    mutationFn: async (publishStatus: 'draft' | 'published') => {
      const body = { title: title.trim(), content, banner_url: bannerUrl, keywords, status: publishStatus, lang: articleLang };
      if (isEdit) {
        const res = await fetch(`${API}/editorial/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed');
        return res.json();
      } else {
        const res = await fetch(`${API}/editorial`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed');
        return res.json();
      }
    },
    onSuccess: (article) => {
      toast.success(status === 'published' ? t('editorial.published') : t('editorial.saved_draft'));
      qc.invalidateQueries({ queryKey: ['editorial'] });
      navigate(`/editorial/${article.id}`);
    },
    onError: () => toast.error(t('common.error')),
  });

  const handleBannerUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error(t('editorial.image_file_required')); return; }
    setBannerUploading(true);
    // Preview immediately
    const reader = new FileReader();
    reader.onload = e => setBannerPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API}/editorial/banner`, { method: 'POST', credentials: 'include', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json();
      setBannerUrl(url);
      toast.success(t('editorial.banner_uploaded'));
    } catch {
      toast.error(t('common.error'));
      setBannerPreview(bannerUrl);
    } finally {
      setBannerUploading(false);
    }
  };

  const addKeyword = (raw: string) => {
    const kw = raw.trim().toLowerCase();
    if (!kw || keywords.includes(kw) || keywords.length >= 10) return;
    setKeywords(prev => [...prev, kw]);
    setKwInput('');
  };

  const removeKeyword = (kw: string) => setKeywords(prev => prev.filter(k => k !== kw));

  const canSave = title.trim().length > 0 && content.trim().length > 7; // > empty paragraph

  if (isEdit && loadingArticle) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/editorial')} className="rounded-xl">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">
              {isEdit ? t('editorial.edit_article') : t('editorial.new_article')}
            </h1>
            <p className="text-xs text-muted-foreground">{t('editorial.editor_hint')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={articleLang} onValueChange={setArticleLang}>
            <SelectTrigger className="rounded-xl gap-1.5 h-9 w-auto text-xs border-dashed">
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ARTICLE_LANGS.map(l => (
                <SelectItem key={l.value} value={l.value} className="text-xs">{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => saveMut.mutate('draft')}
            disabled={!canSave || saveMut.isPending}
            className="rounded-xl gap-2"
          >
            {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileEdit className="w-4 h-4" />}
            {t('editorial.save_draft')}
          </Button>
          <Button
            onClick={() => saveMut.mutate('published')}
            disabled={!canSave || saveMut.isPending}
            className="rounded-xl gap-2"
          >
            {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            {t('editorial.publish')}
          </Button>
        </div>
      </div>

      {/* Title */}
      <Card className="card-warm">
        <CardContent className="pt-5">
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t('editorial.title_placeholder')}
            className="text-xl font-bold border-0 bg-transparent px-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/40"
          />
        </CardContent>
      </Card>

      {/* Banner image */}
      <Card className="card-warm overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            {t('editorial.banner_image')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleBannerUpload(e.target.files[0])}
          />
          {bannerPreview ? (
            <div className="relative rounded-xl overflow-hidden group">
              <img src={bannerPreview} alt="Banner" className="w-full max-h-56 object-cover" />
              {bannerUploading && (
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <Button size="sm" variant="secondary" onClick={() => bannerInputRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5 mr-2" />{t('editorial.change_banner')}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => { setBannerUrl(null); setBannerPreview(null); }}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => bannerInputRef.current?.click()}
              className="w-full h-36 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
            >
              <Upload className="w-6 h-6" />
              <span className="text-sm">{t('editorial.upload_banner')}</span>
              <span className="text-xs opacity-60">JPG, PNG, WebP</span>
            </button>
          )}
        </CardContent>
      </Card>

      {/* Rich text editor */}
      <Card className="card-warm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileEdit className="w-4 h-4 text-primary" />
            {t('editorial.content')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-4">
          <Suspense fallback={<div className="h-64 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>}>
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder={t('editorial.content_placeholder')}
              minHeight="350px"
            />
          </Suspense>
        </CardContent>
      </Card>

      {/* Keywords */}
      <Card className="card-warm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Tag className="w-4 h-4 text-primary" />
            {t('editorial.keywords')}
            <span className="text-xs font-normal text-muted-foreground">({keywords.length}/10)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {keywords.map(kw => (
              <Badge key={kw} variant="secondary" className="gap-1 pr-1 text-xs">
                <Tag className="w-2.5 h-2.5" />{kw}
                <button onClick={() => removeKeyword(kw)} className="ml-0.5 hover:text-destructive transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={kwInput}
              onChange={e => setKwInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword(kwInput); }
              }}
              placeholder={t('editorial.keyword_placeholder')}
              className="rounded-xl text-sm"
              disabled={keywords.length >= 10}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => addKeyword(kwInput)}
              disabled={!kwInput.trim() || keywords.length >= 10}
              className="rounded-xl shrink-0"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t('editorial.keyword_hint')}</p>
        </CardContent>
      </Card>

      {/* Bottom save bar */}
      <div className="flex items-center justify-between gap-2 pb-8">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Globe className="w-3.5 h-3.5" />
          {t('editorial.post_lang')} :
          <Select value={articleLang} onValueChange={setArticleLang}>
            <SelectTrigger className="rounded-lg h-7 w-auto text-xs border-dashed">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ARTICLE_LANGS.map(l => (
                <SelectItem key={l.value} value={l.value} className="text-xs">{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/editorial')} className="rounded-xl">
            {t('common.cancel')}
          </Button>
          <Button
            variant="outline"
            onClick={() => saveMut.mutate('draft')}
            disabled={!canSave || saveMut.isPending}
            className="rounded-xl gap-2"
          >
            <Save className="w-4 h-4" />
            {t('editorial.save_draft')}
          </Button>
          <Button
            onClick={() => saveMut.mutate('published')}
            disabled={!canSave || saveMut.isPending}
            className="rounded-xl gap-2"
          >
            {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            {t('editorial.publish')}
          </Button>
        </div>
      </div>
    </div>
  );
}
