import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr';
import en from './locales/en';
import es from './locales/es';
import de from './locales/de';
import it from './locales/it';
import pt from './locales/pt';
import nl from './locales/nl';
import pl from './locales/pl';
import ru from './locales/ru';
import tr from './locales/tr';
import sv from './locales/sv';
import uk from './locales/uk';
import ro from './locales/ro';
import el from './locales/el';
import cs from './locales/cs';
import hr from './locales/hr';
import ja from './locales/ja';
import ko from './locales/ko';
import zh from './locales/zh';
import id from './locales/id';

const savedLang = localStorage.getItem('scouthub-lang') || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      es: { translation: es },
      de: { translation: de },
      it: { translation: it },
      pt: { translation: pt },
      nl: { translation: nl },
      pl: { translation: pl },
      ru: { translation: ru },
      tr: { translation: tr },
      sv: { translation: sv },
      uk: { translation: uk },
      ro: { translation: ro },
      el: { translation: el },
      cs: { translation: cs },
      hr: { translation: hr },
      ja: { translation: ja },
      ko: { translation: ko },
      zh: { translation: zh },
      id: { translation: id },
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;
