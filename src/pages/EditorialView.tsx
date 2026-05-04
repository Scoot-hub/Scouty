import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useIsAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, Edit, Calendar, Eye, User, Tag } from 'lucide-react';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface Article {
  id: string;
  title: string;
  content: string;
  banner_url: string | null;
  keywords: string[] | string | null;
  status: 'draft' | 'published' | 'archived';
  views: number;
  created_at: string;
  user_id: string;
  author_name: string | null;
  author_email: string;
  author_photo: string | null;
}

function parseKeywords(kw: string[] | string | null): string[] {
  if (!kw) return [];
  if (Array.isArray(kw)) return kw;
  try { return JSON.parse(kw); } catch { return []; }
}

function formatDate(d: string) {
  try { return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)); }
  catch { return d; }
}

export default function EditorialView() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: isAdmin } = useIsAdmin();

  const { data: article, isLoading } = useQuery<Article>({
    queryKey: ['editorial-view', id],
    queryFn: async () => {
      const res = await fetch(`${API}/editorial/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Not found');
      return res.json();
    },
    enabled: !!id,
    staleTime: 2 * 60_000,
  });

  if (isLoading) return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-56 w-full rounded-2xl" />
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!article) return (
    <div className="max-w-3xl mx-auto text-center py-20">
      <p className="text-muted-foreground">{t('editorial.not_found')}</p>
      <Button variant="outline" className="mt-4 rounded-xl" onClick={() => navigate('/editorial')}>
        <ChevronLeft className="w-4 h-4 mr-2" />{t('editorial.back')}
      </Button>
    </div>
  );

  const kw = parseKeywords(article.keywords);
  const canEdit = article.user_id === user?.id || isAdmin;
  const authorName = article.author_name || article.author_email;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Nav */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" className="rounded-xl gap-2 -ml-2" onClick={() => navigate('/editorial')}>
          <ChevronLeft className="w-4 h-4" />{t('editorial.back')}
        </Button>
        {canEdit && (
          <Button variant="outline" className="rounded-xl gap-2" onClick={() => navigate(`/editorial/${id}/edit`)}>
            <Edit className="w-4 h-4" />{t('editorial.edit')}
          </Button>
        )}
      </div>

      {/* Draft badge */}
      {article.status !== 'published' && (
        <Badge variant="secondary" className="mb-4">
          {article.status === 'draft' ? t('editorial.status_draft') : t('editorial.status_archived')}
        </Badge>
      )}

      {/* Banner */}
      {article.banner_url && (
        <div className="rounded-2xl overflow-hidden mb-6 shadow-md">
          <img src={article.banner_url} alt={article.title} className="w-full max-h-72 object-cover" />
        </div>
      )}

      {/* Title */}
      <h1 className="text-3xl font-black tracking-tight leading-tight mb-4">{article.title}</h1>

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4 flex-wrap">
        <span className="flex items-center gap-1.5">
          {article.author_photo ? (
            <img src={article.author_photo} alt="" className="w-5 h-5 rounded-full object-cover" />
          ) : (
            <User className="w-3.5 h-3.5" />
          )}
          {authorName}
        </span>
        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(article.created_at)}</span>
        <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{article.views} vue{article.views > 1 ? 's' : ''}</span>
      </div>

      {/* Keywords */}
      {kw.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {kw.map(k => (
            <span key={k} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">
              <Tag className="w-3 h-3" />{k}
            </span>
          ))}
        </div>
      )}

      <hr className="border-border/60 mb-6" />

      {/* Rich text content */}
      <div
        className="prose prose-sm dark:prose-invert max-w-none
          prose-headings:font-bold prose-headings:tracking-tight
          prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
          prose-a:text-primary prose-a:underline
          prose-blockquote:border-l-4 prose-blockquote:border-primary/40 prose-blockquote:pl-4 prose-blockquote:italic
          prose-img:rounded-xl prose-img:shadow-md
          prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
          pb-12"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
    </div>
  );
}
