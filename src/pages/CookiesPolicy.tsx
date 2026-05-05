import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageSEO from '@/components/PageSEO';
import logo from '@/assets/logo.png';

const content = {
  fr: {
    title: 'Politique de Cookies',
    effective: 'En vigueur au 5 mai 2026',
    intro: "La presente politique explique comment Scouty (scouty.app) utilise les cookies et les mecanismes de stockage local dans votre navigateur. Elle complete la Politique de confidentialite.",
    art1_title: "Article 1 — Qu'est-ce qu'un cookie ?",
    art1_p: "Un cookie est un petit fichier texte depose sur votre appareil (ordinateur, tablette, smartphone) lors de votre visite sur un site web. Il permet au site de memoriser des informations sur votre session ou vos preferences. Scouty n'utilise que des cookies strictement necessaires au fonctionnement du service.",
    art1_storage_title: "Stockage local (localStorage)",
    art1_storage_p: "En complement des cookies, Scouty utilise le localStorage du navigateur pour conserver certaines preferences d'interface. Ces donnees sont stockees uniquement dans votre navigateur et ne sont jamais transmises a nos serveurs.",
    art2_title: "Article 2 — Cookies et donnees de stockage utilises",
    art2_p: "Scouty utilise exclusivement les cookies et entrees de stockage local suivants :",
    art2_cookie_headers: ['Identifiant', 'Type', 'Finalite', 'Duree', 'Serveur/Local'],
    art2_cookies: [
      {
        id: 'scouthub_session',
        type: 'Cookie de session',
        purpose: "Maintien de votre session d'authentification. Contient un jeton chiffre permettant de verifier votre identite a chaque requete. Sans ce cookie, vous devez vous reconnecter a chaque visite.",
        duration: 'Session (expire a la fermeture du navigateur, ou selon votre choix de deconnexion automatique)',
        scope: 'Serveur (stocke dans localStorage, transmis a l\'API)',
      },
      {
        id: 'scouthub-lang',
        type: 'Cookie de preference',
        purpose: "Memorise votre choix de langue (francais, anglais, espagnol). Permet d'afficher la plateforme dans votre langue sans avoir a la reselectionner a chaque connexion.",
        duration: 'Persistant (pas d\'expiration fixe)',
        scope: 'Local uniquement',
      },
      {
        id: 'theme',
        type: 'Cookie de preference',
        purpose: "Memorise votre preference de theme visuel (clair ou sombre). Evite le flash visuel lors du chargement de la page.",
        duration: 'Persistant (pas d\'expiration fixe)',
        scope: 'Local uniquement',
      },
      {
        id: 'scouthub-ui-preferences',
        type: 'Stockage local (localStorage)',
        purpose: "Conserve vos preferences d'interface : unite de distance (km ou miles), jour de debut de semaine, affichage des elements restreints dans la navigation, et votre choix de deconnexion automatique de session. Ces donnees ne quittent jamais votre navigateur.",
        duration: 'Persistant (jusqu\'a suppression manuelle ou reinitialisation)',
        scope: 'Local uniquement — jamais transmis au serveur',
      },
    ],
    art3_title: "Article 3 — Ce que nous n'utilisons PAS",
    art3_items: [
      { label: 'Cookies publicitaires', desc: "Scouty n'affiche aucune publicite et n'utilise aucun cookie de ciblage publicitaire (Google Ads, Meta Pixel, etc.)." },
      { label: 'Cookies de suivi tiers', desc: "Aucun outil de tracking comportemental (Google Analytics, Hotjar, Mixpanel, etc.) n'est installe sur la plateforme." },
      { label: 'Retargeting', desc: "Vos visites sur Scouty ne sont pas utilisees pour vous recibler sur d'autres sites web." },
      { label: 'Cookies de partage social', desc: "Aucun bouton de partage social (Facebook, Twitter/X, LinkedIn) ne depose de cookie tiers sur la plateforme." },
      { label: 'Empreinte numerique (fingerprinting)', desc: "Scouty ne collecte pas d'empreinte numerique de votre appareil." },
    ],
    art4_title: "Article 4 — Analytics anonymes",
    art4_p: "Scouty utilise Vercel Analytics pour des metriques de performance anonymes (temps de chargement des pages, taux d'erreurs). Cet outil :",
    art4_items: [
      "Ne depose aucun cookie sur votre appareil",
      "Ne collecte aucune donnee personnelle identifiable",
      "Utilise une methode de mesure privee, conforme au RGPD, sans identifiant persistant",
      "Ne partage aucune donnee avec des tiers a des fins publicitaires",
    ],
    art5_title: "Article 5 — Base legale",
    art5_p: "Conformement a la directive ePrivacy (2002/58/CE) transposee en droit francais, et aux lignes directrices de la CNIL du 17 septembre 2020 :",
    art5_items: [
      "<strong>Cookies strictement necessaires</strong> : exemptes de consentement prealable. Ils sont indispensables au fonctionnement du service (authentification, preferences de langue et d'affichage).",
      "Scouty n'utilisant <strong>aucun cookie non essentiel</strong>, aucun bandeau de consentement aux cookies n'est requis.",
      "Le stockage local (localStorage) suit les memes regles que les cookies pour l'application de la directive ePrivacy.",
    ],
    art6_title: "Article 6 — Gestion et suppression",
    art6_1_title: "6.1 Depuis la plateforme",
    art6_1_items: [
      { label: 'Deconnexion', desc: "Supprime le cookie de session scouthub_session. Accessible depuis le menu utilisateur." },
      { label: 'Reinitialisation des preferences', desc: "Pour supprimer scouthub-ui-preferences, effacez le localStorage de votre navigateur pour le domaine scouty.app." },
      { label: 'Changement de langue', desc: "Met a jour scouthub-lang depuis les parametres de votre compte." },
    ],
    art6_2_title: "6.2 Depuis votre navigateur",
    art6_2_p: "Vous pouvez a tout moment consulter, modifier ou supprimer les cookies et donnees de stockage local via les outils developpeur de votre navigateur (F12 → Application → Cookies / Local Storage). Voici les guides officiels des principaux navigateurs :",
    art6_2_browsers: [
      { name: 'Google Chrome', url: 'https://support.google.com/chrome/answer/95647' },
      { name: 'Mozilla Firefox', url: 'https://support.mozilla.org/fr/kb/cookies-informations-sites-enregistrent' },
      { name: 'Apple Safari', url: 'https://support.apple.com/fr-fr/guide/safari/sfri11471/mac' },
      { name: 'Microsoft Edge', url: 'https://support.microsoft.com/fr-fr/microsoft-edge/supprimer-les-cookies-dans-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09' },
    ],
    art6_3_title: "6.3 Consequence de la suppression",
    art6_3_p: "La suppression du cookie scouthub_session entraine votre deconnexion immediate. La suppression des preferences de stockage local (langue, theme, preferences d'interface) reinitialise ces reglages a leurs valeurs par defaut lors de votre prochaine visite.",
    art7_title: "Article 7 — Modifications",
    art7_p: "La presente politique peut etre mise a jour pour refleter des evolutions techniques ou reglementaires. Toute modification substantielle sera signalee sur la plateforme. La date de mise a jour est indiquee en haut de cette page.",
    art8_title: "Article 8 — Contact",
    art8_p: "Pour toute question relative aux cookies et au stockage local :",
    footer: 'Cette politique est consultable a tout moment sur',
  },
  en: {
    title: 'Cookie Policy',
    effective: 'Effective as of May 5, 2026',
    intro: "This policy explains how Scouty (scouty.app) uses cookies and local storage mechanisms in your browser. It supplements the Privacy Policy.",
    art1_title: "Article 1 — What is a cookie?",
    art1_p: "A cookie is a small text file stored on your device (computer, tablet, smartphone) when you visit a website. It allows the site to remember information about your session or preferences. Scouty only uses cookies that are strictly necessary for the service to function.",
    art1_storage_title: "Local storage (localStorage)",
    art1_storage_p: "In addition to cookies, Scouty uses the browser's localStorage to store certain interface preferences. This data is stored only in your browser and is never transmitted to our servers.",
    art2_title: "Article 2 — Cookies and storage used",
    art2_p: "Scouty uses exclusively the following cookies and local storage entries:",
    art2_cookie_headers: ['Identifier', 'Type', 'Purpose', 'Duration', 'Server/Local'],
    art2_cookies: [
      {
        id: 'scouthub_session',
        type: 'Session cookie',
        purpose: "Maintains your authentication session. Contains an encrypted token to verify your identity on each request. Without this cookie, you must log in on every visit.",
        duration: 'Session (expires when browser is closed, or based on your auto-logout preference)',
        scope: 'Server (stored in localStorage, transmitted to the API)',
      },
      {
        id: 'scouthub-lang',
        type: 'Preference cookie',
        purpose: "Remembers your language choice (French, English, Spanish). Displays the platform in your language without needing to reselect it each time.",
        duration: 'Persistent (no fixed expiry)',
        scope: 'Local only',
      },
      {
        id: 'theme',
        type: 'Preference cookie',
        purpose: "Remembers your visual theme preference (light or dark). Prevents a visual flash on page load.",
        duration: 'Persistent (no fixed expiry)',
        scope: 'Local only',
      },
      {
        id: 'scouthub-ui-preferences',
        type: 'Local storage (localStorage)',
        purpose: "Stores your interface preferences: distance unit (km or miles), week start day, display of restricted elements in navigation, and your auto-logout session choice. This data never leaves your browser.",
        duration: 'Persistent (until manually deleted or reset)',
        scope: 'Local only — never transmitted to the server',
      },
    ],
    art3_title: "Article 3 — What we do NOT use",
    art3_items: [
      { label: 'Advertising cookies', desc: "Scouty displays no advertising and uses no targeting cookies (Google Ads, Meta Pixel, etc.)." },
      { label: 'Third-party tracking cookies', desc: "No behavioral tracking tools (Google Analytics, Hotjar, Mixpanel, etc.) are installed on the platform." },
      { label: 'Retargeting', desc: "Your visits to Scouty are not used to retarget you on other websites." },
      { label: 'Social sharing cookies', desc: "No social sharing buttons (Facebook, Twitter/X, LinkedIn) place third-party cookies on the platform." },
      { label: 'Device fingerprinting', desc: "Scouty does not collect a digital fingerprint of your device." },
    ],
    art4_title: "Article 4 — Anonymous analytics",
    art4_p: "Scouty uses Vercel Analytics for anonymous performance metrics (page load times, error rates). This tool:",
    art4_items: [
      "Does not place any cookie on your device",
      "Does not collect any personally identifiable data",
      "Uses a privacy-preserving measurement method, GDPR-compliant, with no persistent identifier",
      "Does not share any data with third parties for advertising purposes",
    ],
    art5_title: "Article 5 — Legal basis",
    art5_p: "In accordance with the ePrivacy Directive (2002/58/EC) transposed into French law, and the CNIL guidelines of September 17, 2020:",
    art5_items: [
      "<strong>Strictly necessary cookies</strong>: exempt from prior consent. They are essential for the service to function (authentication, language and display preferences).",
      "Since Scouty uses <strong>no non-essential cookies</strong>, no cookie consent banner is required.",
      "Local storage (localStorage) follows the same rules as cookies for the application of the ePrivacy Directive.",
    ],
    art6_title: "Article 6 — Management and deletion",
    art6_1_title: "6.1 From the platform",
    art6_1_items: [
      { label: 'Sign out', desc: "Deletes the scouthub_session session cookie. Accessible from the user menu." },
      { label: 'Reset preferences', desc: "To delete scouthub-ui-preferences, clear the localStorage for the scouty.app domain in your browser." },
      { label: 'Change language', desc: "Updates scouthub-lang from your account settings." },
    ],
    art6_2_title: "6.2 From your browser",
    art6_2_p: "You can view, modify or delete cookies and local storage data at any time through your browser's developer tools (F12 → Application → Cookies / Local Storage). Official guides for major browsers:",
    art6_2_browsers: [
      { name: 'Google Chrome', url: 'https://support.google.com/chrome/answer/95647' },
      { name: 'Mozilla Firefox', url: 'https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer' },
      { name: 'Apple Safari', url: 'https://support.apple.com/guide/safari/sfri11471/mac' },
      { name: 'Microsoft Edge', url: 'https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09' },
    ],
    art6_3_title: "6.3 Consequences of deletion",
    art6_3_p: "Deleting the scouthub_session cookie immediately signs you out. Deleting local storage preferences (language, theme, interface preferences) resets these settings to their default values on your next visit.",
    art7_title: "Article 7 — Modifications",
    art7_p: "This policy may be updated to reflect technical or regulatory changes. Any substantial modification will be communicated on the platform. The update date is shown at the top of this page.",
    art8_title: "Article 8 — Contact",
    art8_p: "For any questions about cookies and local storage:",
    footer: 'This policy is available at any time at',
  },
  es: {
    title: 'Politica de Cookies',
    effective: 'En vigor desde el 5 de mayo de 2026',
    intro: "Esta politica explica como Scouty (scouty.app) utiliza las cookies y los mecanismos de almacenamiento local en su navegador. Complementa la Politica de Privacidad.",
    art1_title: "Articulo 1 — ¿Que es una cookie?",
    art1_p: "Una cookie es un pequeno archivo de texto que se almacena en su dispositivo (ordenador, tableta, smartphone) cuando visita un sitio web. Permite al sitio recordar informacion sobre su sesion o sus preferencias. Scouty solo utiliza cookies estrictamente necesarias para el funcionamiento del servicio.",
    art1_storage_title: "Almacenamiento local (localStorage)",
    art1_storage_p: "Ademas de las cookies, Scouty utiliza el localStorage del navegador para guardar ciertas preferencias de interfaz. Estos datos se almacenan unicamente en su navegador y nunca se transmiten a nuestros servidores.",
    art2_title: "Articulo 2 — Cookies y datos de almacenamiento utilizados",
    art2_p: "Scouty utiliza exclusivamente las siguientes cookies y entradas de almacenamiento local:",
    art2_cookie_headers: ['Identificador', 'Tipo', 'Finalidad', 'Duracion', 'Servidor/Local'],
    art2_cookies: [
      {
        id: 'scouthub_session',
        type: 'Cookie de sesion',
        purpose: "Mantiene su sesion de autenticacion. Contiene un token cifrado para verificar su identidad en cada solicitud. Sin esta cookie, debe iniciar sesion en cada visita.",
        duration: 'Sesion (expira al cerrar el navegador, o segun su preferencia de cierre automatico)',
        scope: 'Servidor (almacenado en localStorage, transmitido a la API)',
      },
      {
        id: 'scouthub-lang',
        type: 'Cookie de preferencia',
        purpose: "Recuerda su eleccion de idioma (frances, ingles, espanol). Muestra la plataforma en su idioma sin necesidad de volver a seleccionarlo cada vez.",
        duration: 'Persistente (sin fecha de expiracion fija)',
        scope: 'Solo local',
      },
      {
        id: 'theme',
        type: 'Cookie de preferencia',
        purpose: "Recuerda su preferencia de tema visual (claro u oscuro). Evita un destello visual al cargar la pagina.",
        duration: 'Persistente (sin fecha de expiracion fija)',
        scope: 'Solo local',
      },
      {
        id: 'scouthub-ui-preferences',
        type: 'Almacenamiento local (localStorage)',
        purpose: "Guarda sus preferencias de interfaz: unidad de distancia (km o millas), dia de inicio de semana, visualizacion de elementos restringidos en la navegacion y su preferencia de cierre automatico de sesion. Estos datos nunca salen de su navegador.",
        duration: 'Persistente (hasta eliminacion manual o reinicio)',
        scope: 'Solo local — nunca transmitido al servidor',
      },
    ],
    art3_title: "Articulo 3 — Lo que NO utilizamos",
    art3_items: [
      { label: 'Cookies publicitarias', desc: "Scouty no muestra publicidad y no utiliza cookies de segmentacion publicitaria (Google Ads, Meta Pixel, etc.)." },
      { label: 'Cookies de seguimiento de terceros', desc: "No hay herramientas de seguimiento de comportamiento (Google Analytics, Hotjar, Mixpanel, etc.) instaladas en la plataforma." },
      { label: 'Retargeting', desc: "Sus visitas a Scouty no se utilizan para mostrarle publicidad en otros sitios web." },
      { label: 'Cookies de compartir en redes sociales', desc: "Ningun boton de compartir social (Facebook, Twitter/X, LinkedIn) deposita cookies de terceros en la plataforma." },
      { label: 'Huella digital del dispositivo (fingerprinting)', desc: "Scouty no recopila una huella digital de su dispositivo." },
    ],
    art4_title: "Articulo 4 — Analiticas anonimas",
    art4_p: "Scouty utiliza Vercel Analytics para metricas de rendimiento anonimas (tiempos de carga de paginas, tasas de error). Esta herramienta:",
    art4_items: [
      "No deposita ninguna cookie en su dispositivo",
      "No recopila ningun dato personal identificable",
      "Utiliza un metodo de medicion respetuoso con la privacidad, conforme al RGPD, sin identificador persistente",
      "No comparte ningun dato con terceros con fines publicitarios",
    ],
    art5_title: "Articulo 5 — Base legal",
    art5_p: "De conformidad con la Directiva ePrivacy (2002/58/CE) transpuesta a la legislacion francesa, y las directrices de la CNIL del 17 de septiembre de 2020:",
    art5_items: [
      "<strong>Cookies estrictamente necesarias</strong>: exentas de consentimiento previo. Son indispensables para el funcionamiento del servicio (autenticacion, preferencias de idioma y visualizacion).",
      "Como Scouty no utiliza <strong>ninguna cookie no esencial</strong>, no se requiere ningun banner de consentimiento de cookies.",
      "El almacenamiento local (localStorage) sigue las mismas reglas que las cookies para la aplicacion de la Directiva ePrivacy.",
    ],
    art6_title: "Articulo 6 — Gestion y eliminacion",
    art6_1_title: "6.1 Desde la plataforma",
    art6_1_items: [
      { label: 'Cerrar sesion', desc: "Elimina la cookie de sesion scouthub_session. Accesible desde el menu de usuario." },
      { label: 'Restablecer preferencias', desc: "Para eliminar scouthub-ui-preferences, borre el localStorage del dominio scouty.app en su navegador." },
      { label: 'Cambiar idioma', desc: "Actualiza scouthub-lang desde la configuracion de su cuenta." },
    ],
    art6_2_title: "6.2 Desde su navegador",
    art6_2_p: "Puede consultar, modificar o eliminar cookies y datos de almacenamiento local en cualquier momento a traves de las herramientas de desarrollador de su navegador (F12 → Aplicacion → Cookies / Almacenamiento local). Guias oficiales de los principales navegadores:",
    art6_2_browsers: [
      { name: 'Google Chrome', url: 'https://support.google.com/chrome/answer/95647' },
      { name: 'Mozilla Firefox', url: 'https://support.mozilla.org/es/kb/cookies-informacion-que-los-sitios-web-guardan-en-' },
      { name: 'Apple Safari', url: 'https://support.apple.com/es-es/guide/safari/sfri11471/mac' },
      { name: 'Microsoft Edge', url: 'https://support.microsoft.com/es-es/microsoft-edge/eliminar-las-cookies-en-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09' },
    ],
    art6_3_title: "6.3 Consecuencias de la eliminacion",
    art6_3_p: "Eliminar la cookie scouthub_session cierra su sesion inmediatamente. Eliminar las preferencias de almacenamiento local (idioma, tema, preferencias de interfaz) restablece estos ajustes a sus valores predeterminados en su proxima visita.",
    art7_title: "Articulo 7 — Modificaciones",
    art7_p: "Esta politica puede actualizarse para reflejar cambios tecnicos o reglamentarios. Cualquier modificacion sustancial se comunicara en la plataforma. La fecha de actualizacion se indica en la parte superior de esta pagina.",
    art8_title: "Articulo 8 — Contacto",
    art8_p: "Para cualquier pregunta relativa a las cookies y el almacenamiento local:",
    footer: 'Esta politica esta disponible en cualquier momento en',
  },
};

type Lang = keyof typeof content;

export default function CookiesPolicy() {
  const { t, i18n } = useTranslation();
  const lang = (Object.keys(content).includes(i18n.language) ? i18n.language : 'fr') as Lang;
  const c = content[lang];

  return (
    <div className="min-h-screen bg-background">
      <PageSEO
        path="/cookies"
        title="Politique de cookies | Scouty"
        description="Politique de cookies de Scouty : liste exhaustive des cookies utilises, base legale ePrivacy, gestion et suppression. Aucun cookie publicitaire ou de suivi tiers."
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
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">{c.title}</h1>
        <p className="text-muted-foreground mb-4">{c.effective}</p>
        <p className="text-sm text-muted-foreground mb-10 border-l-2 border-primary/40 pl-4">{c.intro}</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed">

          {/* Article 1 */}
          <section>
            <h2 className="text-lg font-bold">{c.art1_title}</h2>
            <p>{c.art1_p}</p>
            <h3 className="text-base font-semibold mt-4">{c.art1_storage_title}</h3>
            <p>{c.art1_storage_p}</p>
          </section>

          {/* Article 2 */}
          <section>
            <h2 className="text-lg font-bold">{c.art2_title}</h2>
            <p className="mb-4">{c.art2_p}</p>
            <div className="space-y-4">
              {c.art2_cookies.map((cookie, i) => (
                <div key={i} className="border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">{cookie.id}</code>
                    <span className="text-xs text-muted-foreground shrink-0">{cookie.type}</span>
                  </div>
                  <p className="text-sm mb-2">{cookie.purpose}</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <span><strong>{c.art2_cookie_headers[3]}</strong> : {cookie.duration}</span>
                    <span><strong>{c.art2_cookie_headers[4]}</strong> : {cookie.scope}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Article 3 */}
          <section>
            <h2 className="text-lg font-bold">{c.art3_title}</h2>
            <ul>
              {c.art3_items.map((item, i) => (
                <li key={i}><strong>{item.label}</strong> : {item.desc}</li>
              ))}
            </ul>
          </section>

          {/* Article 4 */}
          <section>
            <h2 className="text-lg font-bold">{c.art4_title}</h2>
            <p>{c.art4_p}</p>
            <ul>
              {c.art4_items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          {/* Article 5 */}
          <section>
            <h2 className="text-lg font-bold">{c.art5_title}</h2>
            <p>{c.art5_p}</p>
            <ul>
              {c.art5_items.map((item, i) => (
                <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
              ))}
            </ul>
          </section>

          {/* Article 6 */}
          <section>
            <h2 className="text-lg font-bold">{c.art6_title}</h2>

            <h3 className="text-base font-semibold mt-4">{c.art6_1_title}</h3>
            <ul>
              {c.art6_1_items.map((item, i) => (
                <li key={i}><strong>{item.label}</strong> : {item.desc}</li>
              ))}
            </ul>

            <h3 className="text-base font-semibold mt-4">{c.art6_2_title}</h3>
            <p>{c.art6_2_p}</p>
            <ul>
              {c.art6_2_browsers.map((b, i) => (
                <li key={i}>
                  <a href={b.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{b.name}</a>
                </li>
              ))}
            </ul>

            <h3 className="text-base font-semibold mt-4">{c.art6_3_title}</h3>
            <p>{c.art6_3_p}</p>
          </section>

          {/* Article 7 */}
          <section>
            <h2 className="text-lg font-bold">{c.art7_title}</h2>
            <p>{c.art7_p}</p>
          </section>

          {/* Article 8 */}
          <section>
            <h2 className="text-lg font-bold">{c.art8_title}</h2>
            <p>{c.art8_p}</p>
            <ul>
              <li>DPO : <a href="mailto:dpo@scouty.app" className="text-primary hover:underline">dpo@scouty.app</a></li>
              <li>Support : <a href="mailto:support@scouty.app" className="text-primary hover:underline">support@scouty.app</a></li>
            </ul>
            <p className="mt-2">
              {lang === 'fr' && <>Voir aussi la <Link to="/privacy" className="text-primary hover:underline">Politique de confidentialite</Link> pour le traitement complet des donnees.</>}
              {lang === 'en' && <>See also the <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link> for the full data processing information.</>}
              {lang === 'es' && <>Vease tambien la <Link to="/privacy" className="text-primary hover:underline">Politica de Privacidad</Link> para informacion completa sobre el tratamiento de datos.</>}
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <p className="text-xs text-muted-foreground">
              {c.footer} <a href="/cookies" className="text-primary hover:underline">scouty.app/cookies</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
