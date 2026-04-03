import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Cookie, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const COOKIE_CONSENT_KEY = 'scouthub_cookie_consent';

export default function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      // Small delay so it doesn't flash on page load
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-in slide-in-from-bottom-4 duration-300">
      <div className="max-w-3xl mx-auto bg-card border border-border rounded-xl shadow-lg p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <Cookie className="w-5 h-5 text-primary shrink-0 mt-0.5 sm:mt-0" />
        <div className="flex-1 text-sm text-muted-foreground leading-relaxed">
          {t('cookie_banner.text')}{' '}
          <Link to="/privacy" className="text-primary hover:underline font-medium">
            {t('cookie_banner.learn_more')}
          </Link>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={accept}>
            {t('cookie_banner.accept')}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={accept}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
