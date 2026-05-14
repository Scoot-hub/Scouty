import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate as fmtDate } from '@/lib/format-utils';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIsAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Newspaper, Plus, Search, Eye, Calendar, User, Tag,
  Edit, Trash2, BookOpen, FileEdit, FilePen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface Article {
  id: string;
  title: string;
  slug: string;
  banner_url: string | null;
  keywords: string[] | string | null;
  status: 'draft' | 'published' | 'archived';
  views: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  author_email: string;
  author_name: string | null;
  author_photo: string | null;
}

function parseKeywords(kw: string[] | string | null): string[] {
  if (!kw) return [];
  if (Array.isArray(kw)) return kw;
  try { return JSON.parse(kw); } catch { return []; }
}

// Local alias — resolved at render time with user dateFormat preference
// The actual formatDate call is in the component body where dateFormat is available

export default function Editorial() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { dateFormat } = useUiPreferences();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);

  // Always use 'published' filter: returns published articles + current user's own drafts
  const { data, isLoading } = useQuery({
    queryKey: ['editorial', search],
    queryFn: async () => {
      const params = new URLSearchParams({ filter: 'published', limit: '50' });
      if (search) params.set('search', search);
      const res = await fetch(`${API}/editorial?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ articles: Article[]; total: number }>;
    },
    staleTime: 60_000,
  });

  // Check write permission
  useQuery({
    queryKey: ['editorial-can-write'],
    queryFn: async () => {
      const r2 = await fetch(`${API}/my-permissions`, { credentials: 'include' });
      const perms = await r2.json();
      const hasRole = isAdmin || (perms?.roles ?? []).some((r: string) =>
        ['rédacteur', 'redacteur', 'editeur', 'éditeur'].includes(r.toLowerCase())
      );
      setCanWrite(!!hasRole);
      return hasRole;
    },
    staleTime: 5 * 60_000,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API}/editorial/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => {
      toast.success(t('editorial.deleted'));
      qc.invalidateQueries({ queryKey: ['editorial'] });
      setDeleteId(null);
    },
    onError: () => toast.error(t('common.error')),
  });

  const articles = data?.articles ?? [];
  const isWriter = !!(canWrite || isAdmin);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Newspaper className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('editorial.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('editorial.subtitle')}</p>
          </div>
        </div>
        {isWriter && (
          <Button onClick={() => navigate('/editorial/new')} className="rounded-xl gap-2">
            <Plus className="w-4 h-4" />
            {t('editorial.new_article')}
          </Button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('editorial.search_placeholder')}
            className="pl-9 rounded-xl"
          />
        </div>
      </div>

      {/* Articles grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : articles.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center">
            <BookOpen className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
            <p className="text-sm font-medium text-muted-foreground mb-1">{t('editorial.no_articles')}</p>
            {isWriter && (
              <Button size="sm" className="rounded-xl gap-2 mt-4" onClick={() => navigate('/editorial/new')}>
                <Plus className="w-4 h-4" />
                {t('editorial.new_article')}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {articles.map(article => {
            const kw = parseKeywords(article.keywords);
            const isOwn = article.user_id === user?.id;
            const isDraft = article.status === 'draft';
            const isArchived = article.status === 'archived';
            const isUnpublished = isDraft || isArchived;
            return (
              <Card
                key={article.id}
                className={cn(
                  'group overflow-hidden rounded-2xl border transition-all',
                  isUnpublished
                    ? 'border-border/40 opacity-60 hover:opacity-80'
                    : 'border-border/60 hover:border-primary/30 hover:shadow-md',
                )}
              >
                {/* Banner */}
                {article.banner_url ? (
                  <div className="h-40 overflow-hidden bg-muted relative">
                    <img
                      src={article.banner_url}
                      alt={article.title}
                      className={cn('w-full h-full object-cover transition-transform duration-500', !isUnpublished && 'group-hover:scale-105')}
                    />
                    {isUnpublished && (
                      <div className="absolute inset-0 bg-background/30 backdrop-grayscale" />
                    )}
                  </div>
                ) : (
                  <div className={cn(
                    'h-32 flex items-center justify-center',
                    isUnpublished ? 'bg-muted/50' : 'bg-gradient-to-br from-primary/10 to-primary/5',
                  )}>
                    {isDraft
                      ? <FilePen className="w-8 h-8 text-muted-foreground/40" />
                      : <Newspaper className="w-8 h-8 text-primary/30" />
                    }
                  </div>
                )}

                <CardContent className="p-4">
                  {/* Status badge */}
                  {isUnpublished && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] mb-2 border font-semibold',
                        isDraft
                          ? 'text-amber-600 border-amber-400/40 bg-amber-50 dark:bg-amber-950/20'
                          : 'text-muted-foreground border-border',
                      )}
                    >
                      {isDraft ? t('editorial.status_draft') : t('editorial.status_archived')}
                    </Badge>
                  )}

                  <h3 className={cn(
                    'font-bold text-sm leading-snug mb-2 line-clamp-2 transition-colors',
                    !isUnpublished && 'group-hover:text-primary',
                  )}>
                    {article.title}
                  </h3>

                  {/* Keywords */}
                  {kw.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {kw.slice(0, 4).map(k => (
                        <span key={k} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          <Tag className="w-2.5 h-2.5" />{k}
                        </span>
                      ))}
                      {kw.length > 4 && <span className="text-[10px] text-muted-foreground">+{kw.length - 4}</span>}
                    </div>
                  )}

                  {/* Meta */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{article.author_name || article.author_email}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(article.updated_at, dateFormat)}</span>
                      {!isUnpublished && <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{article.views}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      {(isOwn || isAdmin) && (
                        <>
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/editorial/${article.id}/edit`); }}
                            className="p-1 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            title={t('common.edit')}
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteId(article.id); }}
                            className="p-1 hover:bg-destructive/10 rounded-md transition-colors text-muted-foreground hover:text-destructive"
                            title={t('common.delete')}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                      {/* Read link only for published articles */}
                      {!isUnpublished && (
                        <Link
                          to={`/editorial/${article.id}`}
                          className="p-1 hover:bg-primary/10 rounded-md transition-colors text-muted-foreground hover:text-primary"
                          title={t('editorial.read')}
                        >
                          <BookOpen className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('editorial.delete_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('editorial.delete_confirm_desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
