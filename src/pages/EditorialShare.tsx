import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { Calendar, User, Tag, ArrowRight, Sparkles, Users, FileText, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.png';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface Article {
  id: string;
  title: string;
  content: string;
  banner_url: string | null;
  keywords: string[] | string | null;
  views: number;
  created_at: string;
  author_name: string | null;
  author_photo: string | null;
  lang: string | null;
}

function parseKeywords(kw: string[] | string | null): string[] {
  if (!kw) return [];
  if (Array.isArray(kw)) return kw;
  try { return JSON.parse(kw); } catch { return []; }
}

function formatDate(d: string, locale = 'fr') {
  try { return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)); }
  catch { return d; }
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function EditorialShare() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`${API}/public/editorial/${id}`)
      .then(r => { if (!r.ok) { setNotFound(true); setLoading(false); return null; } return r.json(); })
      .then(d => { if (d) setArticle(d); setLoading(false); })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  // Set HTML lang to article lang so Chrome offers to translate
  useEffect(() => {
    if (!article?.lang) return;
    const prev = document.documentElement.lang;
    document.documentElement.lang = article.lang;
    return () => { document.documentElement.lang = prev || i18n.language; };
  }, [article?.lang, i18n.language]);

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const description = article ? stripHtml(article.content).slice(0, 200) + '…' : '';
  const kw = parseKeywords(article?.keywords ?? null);

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );

  if (notFound || !article) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-4">
      <img src={logo} alt="Scouty" className="w-16 h-16 rounded-2xl shadow-lg shadow-primary/25" />
      <div className="text-center">
        <h1 className="text-xl font-bold mb-2">{t('editorial.article_not_found')}</h1>
        <p className="text-muted-foreground text-sm mb-6">{t('editorial.article_not_found_desc')}</p>
        <Link to="/auth?signup=true">
          <Button className="font-bold">{t('editorial.create_free_account')}</Button>
        </Link>
      </div>
    </div>
  );

  const valuePropItems = [
    { icon: FileText, label: t('editorial.exclusive_articles'),    desc: t('editorial.exclusive_articles_desc') },
    { icon: Users,    label: t('editorial.player_profiles_label'), desc: t('editorial.player_profiles_desc') },
    { icon: Sparkles, label: t('editorial.ai_enrichment'),         desc: t('editorial.ai_enrichment_desc') },
  ];

  return (
    <>
      <Helmet>
        <title>{article.title} — Scouty</title>
        <meta name="description" content={description} />
        {article.lang && <html lang={article.lang} />}
        <meta property="og:title" content={article.title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={shareUrl} />
        {article.banner_url && <meta property="og:image" content={article.banner_url} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={article.title} />
        <meta name="twitter:description" content={description} />
        {article.banner_url && <meta name="twitter:image" content={article.banner_url} />}
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Top bar */}
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <img src={logo} alt="Scouty" className="w-7 h-7 rounded-lg" />
              <span className="font-black text-base tracking-tight">Scouty</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link to="/auth">
                <Button variant="ghost" size="sm" className="rounded-xl text-xs">{t('editorial.sign_in')}</Button>
              </Link>
              <Link to="/auth?signup=true">
                <Button size="sm" className="rounded-xl text-xs font-bold gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  {t('editorial.create_account')}
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-10">
          {/* Banner */}
          {article.banner_url && (
            <div className="rounded-2xl overflow-hidden mb-8 shadow-md">
              <img src={article.banner_url} alt={article.title} className="w-full max-h-72 object-cover" />
            </div>
          )}

          {/* Keywords */}
          {kw.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {kw.map(k => (
                <span key={k} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">
                  <Tag className="w-3 h-3" />{k}
                </span>
              ))}
            </div>
          )}

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight mb-4">
            {article.title}
          </h1>

          {/* Meta */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-6 flex-wrap">
            <span className="flex items-center gap-1.5">
              {article.author_photo ? (
                <img src={article.author_photo} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <User className="w-3.5 h-3.5" />
              )}
              {article.author_name || 'Scouty'}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />{formatDate(article.created_at, i18n.language)}
            </span>
          </div>

          <hr className="border-border/60 mb-6" />

          {/* Article content — partially visible, fades out */}
          <div className="relative">
            <div
              className="prose prose-sm dark:prose-invert max-w-none overflow-hidden
                prose-headings:font-bold prose-headings:tracking-tight
                prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
                prose-a:text-primary prose-a:underline
                prose-blockquote:border-l-4 prose-blockquote:border-primary/40 prose-blockquote:pl-4 prose-blockquote:italic
                prose-img:rounded-xl prose-img:shadow-md
                prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded"
              style={{ maxHeight: '380px' }}
              dangerouslySetInnerHTML={{ __html: article.content }}
            />
            <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
          </div>

          {/* ── CTA — invite to sign up ── */}
          <div className="mt-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5 p-8 text-center space-y-6 shadow-xl shadow-primary/5">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6 text-primary" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black tracking-tight">
                {t('editorial.continue_reading')}
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                {t('editorial.continue_reading_desc')}
              </p>
            </div>

            {/* Value props */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left max-w-lg mx-auto">
              {valuePropItems.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-background/60 border border-border/60">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-bold">{label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/auth?signup=true">
                <Button size="lg" className="font-bold px-8 shadow-lg shadow-primary/20 gap-2 w-full sm:w-auto">
                  <Sparkles className="w-4 h-4" />
                  {t('editorial.create_free_account')}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  {t('editorial.sign_in')}
                </Button>
              </Link>
            </div>

            <p className="text-[11px] text-muted-foreground/60">
              {t('editorial.free_no_card')}
            </p>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border/60 mt-12 py-8">
          <div className="max-w-3xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <Link to="/" className="flex items-center gap-2 hover:text-foreground transition-colors">
              <img src={logo} alt="Scouty" className="w-5 h-5 rounded-md" />
              <span className="font-bold">Scouty</span>
              <span>— {t('editorial.tagline')}</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link to="/legal" className="hover:text-foreground transition-colors">{t('editorial.legal')}</Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors">{t('editorial.privacy')}</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
