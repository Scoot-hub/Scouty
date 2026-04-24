import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Shield, Eye, Lock, Accessibility, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.png';
import PageSEO from '@/components/PageSEO';

export default function Legal() {
  const { t } = useTranslation();

  const sections = [
    {
      icon: Shield,
      title: t('legal.rgpd_title'),
      content: t('legal.rgpd_content'),
    },
    {
      icon: Accessibility,
      title: t('legal.rgaa_title'),
      content: t('legal.rgaa_content'),
    },
    {
      icon: Lock,
      title: t('legal.iso27001_title'),
      content: t('legal.iso27001_content'),
    },
    {
      icon: Eye,
      title: t('legal.cookies_title'),
      content: t('legal.cookies_content'),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PageSEO
        path="/legal"
        title="Mentions légales & Cadre légal | Scouty"
        description="Mentions légales de Scouty : conformité RGPD, accessibilité RGAA, sécurité des données (ISO 27001) et politique de cookies. Plateforme de scouting footballistique conforme."
      />
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('common.back')}
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <img src={logo} alt="Scouty" className="w-5 h-5" />
            <span className="text-lg font-extrabold tracking-tight">Scouty</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">{t('legal.page_title')}</h1>
          <p className="text-muted-foreground">{t('legal.page_subtitle')}</p>
        </div>

        <div className="space-y-6">
          {sections.map((section) => (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <section.icon className="w-5 h-5 text-primary" />
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                  {section.content}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center text-xs text-muted-foreground">
          {t('legal.last_updated')}
        </div>
      </main>
    </div>
  );
}
