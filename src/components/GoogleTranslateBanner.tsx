import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Map i18n language codes → Google Translate target language codes
const LANG_TO_GT: Record<string, string> = {
  en: 'en', de: 'de', es: 'es', it: 'it', pt: 'pt', nl: 'nl',
  pl: 'pl', tr: 'tr', ar: 'ar', ja: 'ja', ko: 'ko', zh: 'zh-CN',
  ru: 'ru', uk: 'uk', ro: 'ro', hu: 'hu', cs: 'cs', sv: 'sv',
  no: 'no', da: 'da', fi: 'fi', el: 'el', hr: 'hr', id: 'id',
};

const LABELS: Record<string, { title: string; sub: string; btn: string }> = {
  en: { title: 'This document is in French', sub: 'Use Google Translate to read it in English.', btn: 'Translate with Google' },
  de: { title: 'Dieses Dokument ist auf Französisch', sub: 'Nutze Google Translate, um es auf Deutsch zu lesen.', btn: 'Mit Google übersetzen' },
  es: { title: 'Este documento está en francés', sub: 'Usa Google Translate para leerlo en español.', btn: 'Traducir con Google' },
  it: { title: 'Questo documento è in francese', sub: 'Usa Google Translate per leggerlo in italiano.', btn: 'Traduci con Google' },
  pt: { title: 'Este documento está em francês', sub: 'Use o Google Translate para lê-lo em português.', btn: 'Traduzir com Google' },
  nl: { title: 'Dit document is in het Frans', sub: 'Gebruik Google Translate om het in het Nederlands te lezen.', btn: 'Vertalen met Google' },
  pl: { title: 'Ten dokument jest po francusku', sub: 'Użyj Google Tłumacza, aby przeczytać go po polsku.', btn: 'Przetłumacz przez Google' },
  tr: { title: 'Bu belge Fransızca yazılmıştır', sub: "Türkçe okumak için Google Translate'i kullanın.", btn: "Google ile çevir" },
  ru: { title: 'Этот документ на французском языке', sub: 'Используйте Google Translate для перевода на русский.', btn: 'Перевести через Google' },
  sv: { title: 'Det här dokumentet är på franska', sub: 'Använd Google Translate för att läsa det på svenska.', btn: 'Översätt med Google' },
  uk: { title: 'Цей документ французькою мовою', sub: 'Використовуйте Google Translate для перекладу українською.', btn: 'Перекласти через Google' },
  ro: { title: 'Acest document este în franceză', sub: 'Folosiți Google Translate pentru a-l citi în română.', btn: 'Traduceți cu Google' },
  el: { title: 'Αυτό το έγγραφο είναι στα γαλλικά', sub: 'Χρησιμοποιήστε το Google Translate για να το διαβάσετε στα ελληνικά.', btn: 'Μετάφραση με Google' },
  cs: { title: 'Tento dokument je ve francouzštině', sub: 'Použijte Google Translate pro čtení v češtině.', btn: 'Přeložit přes Google' },
  hr: { title: 'Ovaj dokument je na francuskom', sub: 'Koristite Google Translate za čitanje na hrvatskom.', btn: 'Prevedi s Googleom' },
  ja: { title: 'この文書はフランス語です', sub: 'Google翻訳を使って日本語で読んでください。', btn: 'Googleで翻訳' },
  ko: { title: '이 문서는 프랑스어로 작성되었습니다', sub: 'Google 번역을 사용하여 한국어로 읽으세요.', btn: 'Google로 번역' },
  zh: { title: '本文件为法语', sub: '使用Google翻译以中文阅读。', btn: '用Google翻译' },
  id: { title: 'Dokumen ini dalam bahasa Prancis', sub: 'Gunakan Google Translate untuk membacanya dalam bahasa Indonesia.', btn: 'Terjemahkan dengan Google' },
};

const FALLBACK = { title: 'This document is in French', sub: 'Use Google Translate to read it in your language.', btn: 'Translate with Google' };

interface GoogleTranslateBannerProps {
  /** Source language of the document (default: 'fr') */
  sourceLang?: string;
}

export default function GoogleTranslateBanner({ sourceLang = 'fr' }: GoogleTranslateBannerProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  // Only show if the page is not already in the target language
  if (lang === sourceLang) return null;

  const gtLang = LANG_TO_GT[lang] ?? 'en';
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const gtUrl = `https://translate.google.com/translate?sl=${sourceLang}&tl=${gtLang}&u=${encodeURIComponent(url)}`;

  const label = LABELS[lang] ?? FALLBACK;

  return (
    <div className="mb-8 flex items-start gap-4 px-5 py-4 rounded-2xl border border-border bg-card shadow-sm">
      {/* Google Translate "G" logo */}
      <div className="shrink-0 mt-0.5">
        <svg viewBox="0 0 48 48" className="w-8 h-8" aria-hidden="true">
          <path fill="#4285F4" d="M24 10.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 3.38 30.47 1 24 1 14.62 1 6.51 6.33 2.69 14.09l7.98 6.19C12.43 14.08 17.74 10.5 24 10.5z"/>
          <path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#EA4335" d="M24 47c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-3.59-13.33-8.79l-7.98 6.19C6.51 41.68 14.62 47 24 47z"/>
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground">{label.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">{label.sub}</p>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="gap-2 rounded-xl border-blue-500/30 text-blue-600 hover:bg-blue-500/5 dark:text-blue-400"
        >
          <a href={gtUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-3.5 h-3.5" />
            {label.btn}
          </a>
        </Button>
      </div>
    </div>
  );
}
