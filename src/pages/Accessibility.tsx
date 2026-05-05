import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageSEO from '@/components/PageSEO';
import logo from '@/assets/logo.png';

const content = {
  fr: {
    title: "Declaration d'accessibilite",
    subtitle: "Referentiel general d'amelioration de l'accessibilite (RGAA 4.1)",
    effective: 'Etablie le 5 mai 2026',
    intro: "Scouty (scouty.app) s'engage a rendre son service accessible conformement a l'article 47 de la loi n° 2005-102 du 11 fevrier 2005 et aux obligations resultant de la directive europeenne 2016/2102 du 26 octobre 2016.",
    conformity_title: "Etat de conformite",
    conformity_level: "Partiellement conforme",
    conformity_desc: "La plateforme Scouty est partiellement conforme au RGAA version 4.1 en raison des non-conformites et des derogations enumerees ci-dessous.",
    art1_title: "Article 1 — Resultats des tests",
    art1_p: "L'audit de conformite au RGAA 4.1 a ete realise en auto-evaluation. Les resultats sont les suivants :",
    art1_stats: [
      { label: 'Criteres conformes', value: '68 %' },
      { label: 'Criteres non conformes', value: '24 %' },
      { label: 'Criteres non applicables', value: '8 %' },
    ],
    art1_note: "Taux global de conformite : 74 % (criteres applicables uniquement). Audit realise sur les pages principales : connexion, tableau de bord, fiche joueur, liste des joueurs, organisations, carte du monde, championnats, actualites, parametres.",
    art2_title: "Article 2 — Contenus non accessibles",
    art2_1_title: "2.1 Non-conformites",
    art2_1_items: [
      { label: 'Images decoratives', desc: "Certaines images d'illustration et icones n'ont pas toujours un attribut alt vide lorsqu'elles sont purement decoratives (critere RGAA 1.2)." },
      { label: 'Contraste des couleurs', desc: "Certains textes secondaires (libelles de statut, placeholders) ne respectent pas le ratio de contraste minimal de 4.5:1 en mode clair (critere RGAA 3.2 et 3.3)." },
      { label: 'Navigation au clavier', desc: "Certains composants interactifs (menus deroulants avances, selecteurs de date) peuvent presenter des difficultes de navigation au clavier sans souris (critere RGAA 12.8)." },
      { label: 'Messages d\'erreur de formulaire', desc: "Quelques messages d'erreur de formulaire ne sont pas systematiquement lies au champ concerne par un attribut aria-describedby (critere RGAA 11.11)." },
      { label: 'Tableaux de donnees', desc: "Les tableaux de donnees complexes (statistiques joueurs) ne disposent pas toujours d'en-tetes th explicites avec attribut scope (critere RGAA 5.7)." },
      { label: 'Composants riches (editeur de texte)', desc: "L'editeur de contenu editorial (TipTap / ProseMirror) utilise des interactions avancees qui ne sont pas entierement accessibles au lecteur d'ecran (critere RGAA 7.1 a 7.5)." },
    ],
    art2_2_title: "2.2 Derogations pour charge disproportionnee",
    art2_2_items: [
      { label: 'Visualisation cartographique (Leaflet)', desc: "La carte interactive du monde (vue 'Carte du monde') est exoneree au titre de la charge disproportionnee. Une alternative textuelle sous forme de liste des clubs geolocalisables est disponible via la vue liste." },
      { label: 'Graphiques statistiques (Recharts)', desc: "Les graphiques de performance joueur sont exoneres au titre de la charge disproportionnee. Les donnees brutes sous-jacentes sont accessibles via l'export CSV." },
    ],
    art2_3_title: "2.3 Contenus tiers non soumis a l'obligation",
    art2_3_items: [
      "Contenu provenant de sources externes (photos Transfermarkt, TheSportsDB) dont nous ne maitrisons pas l'accessibilite",
      "Intégration d'iframes YouTube dans la section actualites (lecteur video tiers)",
    ],
    art3_title: "Article 3 — Etablissement de cette declaration",
    art3_p: "Cette declaration a ete etablie le 5 mai 2026. Elle a fait l'objet d'une auto-evaluation realisee par l'equipe de developpement de Scouty a l'aide des outils suivants :",
    art3_tools: [
      'NVDA + Firefox (lecteur d\'ecran Windows)',
      'VoiceOver + Safari (lecteur d\'ecran macOS)',
      'axe DevTools (extension navigateur)',
      'Colour Contrast Analyser',
      'Inspection manuelle du code HTML/ARIA',
    ],
    art3_review: "Cette declaration sera mise a jour annuellement ou lors de toute evolution substantielle de la plateforme.",
    art4_title: "Article 4 — Technologies utilisees pour la realisation du site",
    art4_items: [
      'React 18 (SPA — application monopage)',
      'HTML5 semantique',
      'ARIA (Accessible Rich Internet Applications)',
      'CSS / Tailwind CSS',
      'Radix UI (composants accessibles par design)',
    ],
    art5_title: "Article 5 — Retour d'information et contact",
    art5_p: "Si vous n'arrivez pas a acceder a un contenu ou a un service de la plateforme, vous pouvez :",
    art5_items: [
      "Envoyer un email a : accessibility@scouty.app",
      "Utiliser le formulaire de support disponible dans la plateforme (section 'Aide')",
      "Contacter le support general : support@scouty.app",
    ],
    art5_commitment: "Nous nous engageons a vous repondre dans un delai de 5 jours ouvrables et a vous proposer une alternative d'acces au contenu ou au service concerne.",
    art6_title: "Article 6 — Voies de recours",
    art6_p: "Si vous avez signale un defaut d'accessibilite et que vous n'avez pas obtenu de reponse satisfaisante dans un delai de 2 mois, vous pouvez deposer une reclamation aupres du Defenseur des droits :",
    art6_items: [
      { label: 'En ligne', url: 'https://formulaire.defenseurdesdroits.fr/', text: 'formulaire.defenseurdesdroits.fr' },
      { label: 'Par telephone', url: null, text: '09 69 39 00 00 (numero non surtaxe)' },
      { label: 'Par courrier', url: null, text: 'Defenseur des droits — Libre reponse 71120 — 75342 Paris CEDEX 07' },
    ],
    art7_title: "Article 7 — Plan d'amelioration",
    art7_p: "Scouty s'engage a ameliorer progressivement l'accessibilite de la plateforme selon le calendrier suivant :",
    art7_roadmap: [
      { period: 'T3 2026', action: "Correction des contrastes de couleurs en mode clair (critere RGAA 3.2/3.3)" },
      { period: 'T3 2026', action: "Ajout systematique des attributs aria-describedby sur les champs de formulaire (critere RGAA 11.11)" },
      { period: 'T4 2026', action: "Mise en conformite des tableaux de donnees statistiques (critere RGAA 5.7)" },
      { period: 'T4 2026', action: "Amelioration de la navigation clavier dans les menus deroulants (critere RGAA 12.8)" },
      { period: '2027', action: "Audit de conformite complet par un organisme tiers independant" },
    ],
    footer: 'Cette declaration est consultable a tout moment sur',
  },
  en: {
    title: 'Accessibility Statement',
    subtitle: 'French General Accessibility Improvement Framework (RGAA 4.1)',
    effective: 'Established on May 5, 2026',
    intro: "Scouty (scouty.app) is committed to making its service accessible in accordance with Article 47 of French Law No. 2005-102 of February 11, 2005, and the obligations arising from European Directive 2016/2102 of October 26, 2016.",
    conformity_title: "Compliance status",
    conformity_level: "Partially compliant",
    conformity_desc: "The Scouty platform is partially compliant with RGAA version 4.1 due to the non-conformities and exemptions listed below.",
    art1_title: "Article 1 — Test results",
    art1_p: "The RGAA 4.1 compliance audit was conducted as a self-assessment. Results are as follows:",
    art1_stats: [
      { label: 'Compliant criteria', value: '68 %' },
      { label: 'Non-compliant criteria', value: '24 %' },
      { label: 'Non-applicable criteria', value: '8 %' },
    ],
    art1_note: "Overall compliance rate: 74% (applicable criteria only). Audit conducted on the main pages: login, dashboard, player profile, player list, organizations, world map, championships, news, settings.",
    art2_title: "Article 2 — Non-accessible content",
    art2_1_title: "2.1 Non-conformities",
    art2_1_items: [
      { label: 'Decorative images', desc: "Some illustration images and icons do not always have an empty alt attribute when purely decorative (RGAA criterion 1.2)." },
      { label: 'Color contrast', desc: "Some secondary text (status labels, placeholders) does not meet the minimum contrast ratio of 4.5:1 in light mode (RGAA criteria 3.2 and 3.3)." },
      { label: 'Keyboard navigation', desc: "Some interactive components (advanced dropdown menus, date pickers) may present keyboard navigation difficulties without a mouse (RGAA criterion 12.8)." },
      { label: 'Form error messages', desc: "Some form error messages are not consistently linked to the relevant field via an aria-describedby attribute (RGAA criterion 11.11)." },
      { label: 'Data tables', desc: "Complex data tables (player statistics) do not always have explicit th headers with the scope attribute (RGAA criterion 5.7)." },
      { label: 'Rich components (text editor)', desc: "The editorial content editor (TipTap / ProseMirror) uses advanced interactions that are not fully accessible to screen readers (RGAA criteria 7.1 to 7.5)." },
    ],
    art2_2_title: "2.2 Exemptions for disproportionate burden",
    art2_2_items: [
      { label: 'Map visualization (Leaflet)', desc: "The interactive world map ('World Map' view) is exempt on the grounds of disproportionate burden. A text alternative in the form of a list of geolocatable clubs is available via the list view." },
      { label: 'Statistical charts (Recharts)', desc: "Player performance charts are exempt on the grounds of disproportionate burden. The underlying raw data is accessible via CSV export." },
    ],
    art2_3_title: "2.3 Third-party content not subject to the obligation",
    art2_3_items: [
      "Content from external sources (Transfermarkt, TheSportsDB photos) whose accessibility we do not control",
      "YouTube iframes embedded in the news section (third-party video player)",
    ],
    art3_title: "Article 3 — Establishment of this statement",
    art3_p: "This statement was established on May 5, 2026. It was the subject of a self-assessment conducted by the Scouty development team using the following tools:",
    art3_tools: [
      'NVDA + Firefox (Windows screen reader)',
      'VoiceOver + Safari (macOS screen reader)',
      'axe DevTools (browser extension)',
      'Colour Contrast Analyser',
      'Manual HTML/ARIA code inspection',
    ],
    art3_review: "This statement will be updated annually or upon any substantial evolution of the platform.",
    art4_title: "Article 4 — Technologies used to build the site",
    art4_items: [
      'React 18 (SPA — single-page application)',
      'Semantic HTML5',
      'ARIA (Accessible Rich Internet Applications)',
      'CSS / Tailwind CSS',
      'Radix UI (accessible components by design)',
    ],
    art5_title: "Article 5 — Feedback and contact",
    art5_p: "If you are unable to access content or a service on the platform, you can:",
    art5_items: [
      "Send an email to: accessibility@scouty.app",
      "Use the support form available in the platform ('Help' section)",
      "Contact general support: support@scouty.app",
    ],
    art5_commitment: "We commit to responding within 5 business days and to offering you an alternative means of access to the relevant content or service.",
    art6_title: "Article 6 — Recourse",
    art6_p: "If you have reported an accessibility failure and have not received a satisfactory response within 2 months, you may file a complaint with the French Ombudsman (Defenseur des droits):",
    art6_items: [
      { label: 'Online', url: 'https://formulaire.defenseurdesdroits.fr/', text: 'formulaire.defenseurdesdroits.fr' },
      { label: 'By phone', url: null, text: '09 69 39 00 00 (non-premium rate number)' },
      { label: 'By mail', url: null, text: 'Defenseur des droits — Libre reponse 71120 — 75342 Paris CEDEX 07' },
    ],
    art7_title: "Article 7 — Improvement plan",
    art7_p: "Scouty is committed to progressively improving the platform's accessibility according to the following timeline:",
    art7_roadmap: [
      { period: 'Q3 2026', action: "Fix color contrast issues in light mode (RGAA criteria 3.2/3.3)" },
      { period: 'Q3 2026', action: "Systematic addition of aria-describedby attributes on form fields (RGAA criterion 11.11)" },
      { period: 'Q4 2026', action: "Make statistical data tables compliant (RGAA criterion 5.7)" },
      { period: 'Q4 2026', action: "Improve keyboard navigation in dropdown menus (RGAA criterion 12.8)" },
      { period: '2027', action: "Full compliance audit by an independent third party" },
    ],
    footer: 'This statement is available at any time at',
  },
  es: {
    title: 'Declaracion de accesibilidad',
    subtitle: 'Marco general frances de mejora de la accesibilidad (RGAA 4.1)',
    effective: 'Establecida el 5 de mayo de 2026',
    intro: "Scouty (scouty.app) se compromete a hacer accesible su servicio de conformidad con el articulo 47 de la Ley francesa n.° 2005-102 de 11 de febrero de 2005 y las obligaciones derivadas de la Directiva europea 2016/2102 de 26 de octubre de 2016.",
    conformity_title: "Estado de conformidad",
    conformity_level: "Parcialmente conforme",
    conformity_desc: "La plataforma Scouty es parcialmente conforme con la version 4.1 del RGAA debido a las no conformidades y exenciones enumeradas a continuacion.",
    art1_title: "Articulo 1 — Resultados de las pruebas",
    art1_p: "La auditoria de conformidad con el RGAA 4.1 se realizo como autoevaluacion. Los resultados son los siguientes:",
    art1_stats: [
      { label: 'Criterios conformes', value: '68 %' },
      { label: 'Criterios no conformes', value: '24 %' },
      { label: 'Criterios no aplicables', value: '8 %' },
    ],
    art1_note: "Tasa global de conformidad: 74 % (solo criterios aplicables). Auditoria realizada en las paginas principales: inicio de sesion, panel de control, perfil de jugador, lista de jugadores, organizaciones, mapa mundial, campeonatos, noticias, configuracion.",
    art2_title: "Articulo 2 — Contenido inaccesible",
    art2_1_title: "2.1 No conformidades",
    art2_1_items: [
      { label: 'Imagenes decorativas', desc: "Algunas imagenes de ilustracion e iconos no siempre tienen un atributo alt vacio cuando son puramente decorativas (criterio RGAA 1.2)." },
      { label: 'Contraste de colores', desc: "Algunos textos secundarios (etiquetas de estado, marcadores de posicion) no cumplen la razon de contraste minima de 4,5:1 en modo claro (criterios RGAA 3.2 y 3.3)." },
      { label: 'Navegacion por teclado', desc: "Algunos componentes interactivos (menus desplegables avanzados, selectores de fecha) pueden presentar dificultades de navegacion por teclado sin raton (criterio RGAA 12.8)." },
      { label: 'Mensajes de error de formulario', desc: "Algunos mensajes de error de formulario no estan sistematicamente vinculados al campo correspondiente mediante un atributo aria-describedby (criterio RGAA 11.11)." },
      { label: 'Tablas de datos', desc: "Las tablas de datos complejas (estadisticas de jugadores) no siempre tienen encabezados th explicitos con el atributo scope (criterio RGAA 5.7)." },
      { label: 'Componentes ricos (editor de texto)', desc: "El editor de contenido editorial (TipTap / ProseMirror) utiliza interacciones avanzadas que no son totalmente accesibles para lectores de pantalla (criterios RGAA 7.1 a 7.5)." },
    ],
    art2_2_title: "2.2 Exenciones por carga desproporcionada",
    art2_2_items: [
      { label: 'Visualizacion de mapa (Leaflet)', desc: "El mapa interactivo mundial (vista 'Mapa mundial') esta exento por carga desproporcionada. Una alternativa textual en forma de lista de clubes geolocalizables esta disponible en la vista de lista." },
      { label: 'Graficos estadisticos (Recharts)', desc: "Los graficos de rendimiento de jugadores estan exentos por carga desproporcionada. Los datos brutos subyacentes son accesibles mediante exportacion CSV." },
    ],
    art2_3_title: "2.3 Contenido de terceros no sujeto a la obligacion",
    art2_3_items: [
      "Contenido procedente de fuentes externas (fotos de Transfermarkt, TheSportsDB) cuya accesibilidad no controlamos",
      "iframes de YouTube incrustados en la seccion de noticias (reproductor de video de terceros)",
    ],
    art3_title: "Articulo 3 — Establecimiento de esta declaracion",
    art3_p: "Esta declaracion fue establecida el 5 de mayo de 2026. Fue objeto de una autoevaluacion realizada por el equipo de desarrollo de Scouty con las siguientes herramientas:",
    art3_tools: [
      'NVDA + Firefox (lector de pantalla Windows)',
      'VoiceOver + Safari (lector de pantalla macOS)',
      'axe DevTools (extension de navegador)',
      'Colour Contrast Analyser',
      'Inspeccion manual del codigo HTML/ARIA',
    ],
    art3_review: "Esta declaracion se actualizara anualmente o ante cualquier evolucion sustancial de la plataforma.",
    art4_title: "Articulo 4 — Tecnologias utilizadas para la realizacion del sitio",
    art4_items: [
      'React 18 (SPA — aplicacion de pagina unica)',
      'HTML5 semantico',
      'ARIA (Accessible Rich Internet Applications)',
      'CSS / Tailwind CSS',
      'Radix UI (componentes accesibles por diseno)',
    ],
    art5_title: "Articulo 5 — Retroalimentacion y contacto",
    art5_p: "Si no puede acceder a un contenido o servicio de la plataforma, puede:",
    art5_items: [
      "Enviar un correo electronico a: accessibility@scouty.app",
      "Utilizar el formulario de soporte disponible en la plataforma (seccion 'Ayuda')",
      "Contactar con el soporte general: support@scouty.app",
    ],
    art5_commitment: "Nos comprometemos a responderle en un plazo de 5 dias habiles y a ofrecerle un medio alternativo de acceso al contenido o servicio en cuestion.",
    art6_title: "Articulo 6 — Vias de recurso",
    art6_p: "Si ha notificado un fallo de accesibilidad y no ha obtenido una respuesta satisfactoria en un plazo de 2 meses, puede presentar una reclamacion ante el Defensor de los derechos frances (Defenseur des droits):",
    art6_items: [
      { label: 'En linea', url: 'https://formulaire.defenseurdesdroits.fr/', text: 'formulaire.defenseurdesdroits.fr' },
      { label: 'Por telefono', url: null, text: '09 69 39 00 00 (numero sin recargo)' },
      { label: 'Por correo postal', url: null, text: 'Defenseur des droits — Libre reponse 71120 — 75342 Paris CEDEX 07' },
    ],
    art7_title: "Articulo 7 — Plan de mejora",
    art7_p: "Scouty se compromete a mejorar progresivamente la accesibilidad de la plataforma segun el siguiente calendario:",
    art7_roadmap: [
      { period: 'T3 2026', action: "Correccion de problemas de contraste de color en modo claro (criterios RGAA 3.2/3.3)" },
      { period: 'T3 2026', action: "Adicion sistematica de atributos aria-describedby en campos de formulario (criterio RGAA 11.11)" },
      { period: 'T4 2026', action: "Conformidad de tablas de datos estadisticos (criterio RGAA 5.7)" },
      { period: 'T4 2026', action: "Mejora de la navegacion por teclado en los menus desplegables (criterio RGAA 12.8)" },
      { period: '2027', action: "Auditoria completa de conformidad por un organismo tercero independiente" },
    ],
    footer: 'Esta declaracion esta disponible en cualquier momento en',
  },
};

type Lang = keyof typeof content;

const LEVEL_COLOR: Record<string, string> = {
  'Partiellement conforme': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'Partially compliant': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'Parcialmente conforme': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

export default function Accessibility() {
  const { t, i18n } = useTranslation();
  const lang = (Object.keys(content).includes(i18n.language) ? i18n.language : 'fr') as Lang;
  const c = content[lang];

  return (
    <div className="min-h-screen bg-background">
      <PageSEO
        path="/accessibility"
        title="Déclaration d'accessibilité | Scouty"
        description="Déclaration d'accessibilité RGAA 4.1 de Scouty : état de conformité, contenus non accessibles, plan d'amélioration et voies de recours."
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
        <h1 className="text-3xl font-extrabold tracking-tight mb-1">{c.title}</h1>
        <p className="text-sm text-muted-foreground mb-1">{c.subtitle}</p>
        <p className="text-muted-foreground mb-6">{c.effective}</p>
        <p className="text-sm text-muted-foreground mb-6 border-l-2 border-primary/40 pl-4">{c.intro}</p>

        {/* Conformity badge */}
        <div className="mb-10 flex items-center gap-4 p-4 rounded-lg border border-border bg-muted/30">
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{c.conformity_title}</p>
            <span className={`inline-block text-sm font-semibold px-3 py-1 rounded-full ${LEVEL_COLOR[c.conformity_level] ?? ''}`}>
              {c.conformity_level}
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-sm">{c.conformity_desc}</p>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed">

          {/* Article 1 */}
          <section>
            <h2 className="text-lg font-bold">{c.art1_title}</h2>
            <p>{c.art1_p}</p>
            <div className="flex gap-6 my-4">
              {c.art1_stats.map((s, i) => (
                <div key={i} className="text-center">
                  <p className="text-2xl font-extrabold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground italic">{c.art1_note}</p>
          </section>

          {/* Article 2 */}
          <section>
            <h2 className="text-lg font-bold">{c.art2_title}</h2>

            <h3 className="text-base font-semibold mt-4">{c.art2_1_title}</h3>
            <ul>
              {c.art2_1_items.map((item, i) => (
                <li key={i}><strong>{item.label}</strong> : {item.desc}</li>
              ))}
            </ul>

            <h3 className="text-base font-semibold mt-4">{c.art2_2_title}</h3>
            <ul>
              {c.art2_2_items.map((item, i) => (
                <li key={i}><strong>{item.label}</strong> : {item.desc}</li>
              ))}
            </ul>

            <h3 className="text-base font-semibold mt-4">{c.art2_3_title}</h3>
            <ul>
              {c.art2_3_items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          {/* Article 3 */}
          <section>
            <h2 className="text-lg font-bold">{c.art3_title}</h2>
            <p>{c.art3_p}</p>
            <ul>
              {c.art3_tools.map((tool, i) => (
                <li key={i}>{tool}</li>
              ))}
            </ul>
            <p className="italic text-muted-foreground">{c.art3_review}</p>
          </section>

          {/* Article 4 */}
          <section>
            <h2 className="text-lg font-bold">{c.art4_title}</h2>
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
                <li key={i}>{item}</li>
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground italic">{c.art5_commitment}</p>
          </section>

          {/* Article 6 */}
          <section>
            <h2 className="text-lg font-bold">{c.art6_title}</h2>
            <p>{c.art6_p}</p>
            <ul>
              {c.art6_items.map((item, i) => (
                <li key={i}>
                  <strong>{item.label}</strong> :{' '}
                  {item.url
                    ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{item.text}</a>
                    : item.text
                  }
                </li>
              ))}
            </ul>
          </section>

          {/* Article 7 */}
          <section>
            <h2 className="text-lg font-bold">{c.art7_title}</h2>
            <p>{c.art7_p}</p>
            <div className="mt-3 space-y-2">
              {c.art7_roadmap.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="shrink-0 text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded mt-0.5">{item.period}</span>
                  <span className="text-sm">{item.action}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-border pt-6">
            <p className="text-xs text-muted-foreground">
              {c.footer} <a href="/accessibility" className="text-primary hover:underline">scouty.app/accessibility</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
