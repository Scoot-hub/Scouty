import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.png';

const content = {
  fr: {
    title: 'Politique de Confidentialite',
    effective: 'En vigueur au 1er avril 2026',
    art1_title: 'Article 1 — Responsable du traitement',
    art1_p1: 'Le responsable du traitement des donnees personnelles collectees via la plateforme Scouty (scouty.app) est :',
    art1_items: [
      '<strong>Scouty</strong>, service edite par la societe [Raison sociale a completer], [forme juridique], au capital de [montant] euros',
      'Immatriculee au RCS de [ville] sous le numero [numero]',
      'Siege social : [adresse]',
    ],
    art1_email_label: 'Email de contact',
    art1_p2: "L'Editeur agit en qualite de responsable de traitement pour les donnees des Utilisateurs (compte, profil, preferences) et en qualite de sous-traitant pour les donnees de joueurs saisies par l'Utilisateur.",
    art2_title: 'Article 2 — Donnees collectees',
    art2_1_title: '2.1 Donnees fournies directement par l\'Utilisateur',
    art2_1_items: [
      { label: "Donnees d'identification", desc: 'nom, prenom, adresse email' },
      { label: 'Donnees professionnelles', desc: "nom du club/organisation, role professionnel (scout, recruteur, coach, agent)" },
      { label: "Donnees d'authentification", desc: 'mot de passe (stocke sous forme de hash bcrypt, jamais en clair)' },
      { label: 'Donnees de scouting', desc: "fiches joueurs, rapports d'observation, notes, evaluations, watchlists, shadow teams" },
      { label: 'Donnees financieres', desc: "traitees exclusivement par Stripe (PCI-DSS) ; aucune donnee bancaire n'est stockee sur nos serveurs" },
    ],
    art2_2_title: '2.2 Donnees collectees automatiquement',
    art2_2_items: [
      { label: 'Donnees techniques', desc: "adresse IP, type et version du navigateur, systeme d'exploitation, resolution d'ecran" },
      { label: 'Donnees de connexion', desc: "date et heure de connexion, pages visitees, duree de session" },
      { label: 'Cookies strictement necessaires', desc: "session d'authentification, preferences de langue et de theme" },
    ],
    art2_3_title: "2.3 Donnees issues de l'enrichissement automatique",
    art2_3_p: "Pour les utilisateurs ayant active l'enrichissement, des donnees de joueurs (photo, valeur marchande, statistiques de carriere) sont collectees depuis des sources publiques (Transfermarkt, TheSportsDB, API-Football). Ces donnees sont stockees dans le compte de l'Utilisateur et sont soumises aux memes regles de confidentialite.",
    art3_title: 'Article 3 — Finalites et bases legales du traitement',
    art3_headers: ['Finalite', 'Base legale'],
    art3_rows: [
      ['Creation et gestion de votre compte', 'Execution du contrat (CGU)'],
      ['Fourniture du service de scouting', 'Execution du contrat'],
      ['Traitement des paiements et facturation', 'Execution du contrat'],
      ['Envoi de notifications de service', 'Interet legitime'],
      ['Amelioration du service et correction de bugs', 'Interet legitime'],
      ['Analytics anonymes (Vercel Analytics)', 'Interet legitime'],
      ['Support technique et reponse aux tickets', 'Execution du contrat'],
      ['Securite et prevention des fraudes', 'Obligation legale / Interet legitime'],
    ],
    art4_title: 'Article 4 — Duree de conservation',
    art4_items: [
      { label: 'Donnees de compte', desc: "conservees pendant toute la duree de votre inscription. Supprimees dans un delai de 30 jours apres demande de suppression du compte." },
      { label: 'Donnees de scouting', desc: "conservees pendant la duree de votre compte. Exportables a tout moment. Supprimees avec le compte." },
      { label: 'Donnees de facturation', desc: "conservees 10 ans conformement aux obligations comptables et fiscales francaises (art. L.123-22 du Code de commerce)." },
      { label: 'Logs de connexion', desc: "conserves 12 mois conformement a la legislation applicable (LCEN)." },
      { label: 'Tokens de reinitialisation de mot de passe', desc: "expires et supprimes apres 1 heure." },
      { label: 'Comptes inactifs', desc: "les comptes inactifs depuis plus de 24 mois peuvent etre supprimes apres notification par email." },
    ],
    art5_title: 'Article 5 — Destinataires et sous-traitants',
    art5_p1: 'Vos donnees personnelles sont traitees par les sous-traitants suivants, dans le strict cadre de la fourniture du service :',
    art5_headers: ['Sous-traitant', 'Finalite', 'Localisation'],
    art5_rows: [
      ['TiDB Cloud (PingCAP)', 'Hebergement de la base de donnees', 'UE (Francfort)'],
      ['Vercel Inc.', "Hebergement de l'application et analytics anonymes", 'USA (clauses contractuelles types)'],
      ['Stripe Inc.', 'Traitement des paiements', 'USA (certifie PCI-DSS, clauses contractuelles types)'],
      ['Nodemailer / SMTP', "Envoi d'emails transactionnels", 'UE'],
      ['API-Football (RapidAPI)', 'Donnees de matchs et statistiques', 'UE'],
    ],
    art5_p2: "Aucune donnee personnelle n'est vendue ou louee a des tiers. Les donnees ne sont transmises qu'aux sous-traitants listes ci-dessus, dans le cadre de contrats conformes a l'article 28 du RGPD.",
    art6_title: 'Article 6 — Transferts de donnees hors UE',
    art6_p: 'Certains de nos sous-traitants (Vercel, Stripe) sont etablis aux Etats-Unis. Ces transferts sont encadres par :',
    art6_items: [
      'Les <strong>Clauses Contractuelles Types (CCT)</strong> adoptees par la Commission europeenne (Decision 2021/914)',
      'Les <strong>mesures supplementaires</strong> de securite technique (chiffrement, pseudonymisation)',
      'Pour Stripe : la conformite <strong>PCI-DSS</strong> et le <strong>Data Privacy Framework UE-USA</strong>',
    ],
    art7_title: 'Article 7 — Vos droits',
    art7_p: 'Conformement au RGPD (articles 15 a 22) et a la loi Informatique et Libertes, vous disposez des droits suivants :',
    art7_rights: [
      { label: "Droit d'acces", art: 'art. 15', desc: 'obtenir la confirmation que vos donnees sont traitees et en recevoir une copie' },
      { label: 'Droit de rectification', art: 'art. 16', desc: 'corriger des donnees inexactes ou incompletes' },
      { label: "Droit a l'effacement / droit a l'oubli", art: 'art. 17', desc: 'demander la suppression de vos donnees' },
      { label: 'Droit a la limitation', art: 'art. 18', desc: 'restreindre le traitement de vos donnees' },
      { label: 'Droit a la portabilite', art: 'art. 20', desc: 'recevoir vos donnees dans un format structure' },
      { label: "Droit d'opposition", art: 'art. 21', desc: 'vous opposer au traitement de vos donnees' },
      { label: 'Droit de retirer votre consentement', art: 'art. 7', desc: "a tout moment, sans affecter la licite du traitement effectue avant le retrait" },
      { label: 'Droit de definir des directives post-mortem', art: '', desc: "concernant la conservation, l'effacement ou la communication de vos donnees apres votre deces" },
    ],
    art7_delete_link: 'Exercable directement depuis votre',
    art7_account_page: 'page Compte',
    art7_delete_button: '(bouton "Supprimer mon compte")',
    art7_export_button: '(bouton "Exporter mes donnees")',
    art7_how_title: 'Comment exercer vos droits',
    art7_self_service: 'En libre-service',
    art7_self_service_desc: 'depuis votre',
    art7_self_service_details: '(export de donnees, suppression de compte)',
    art7_by_email: 'Par email',
    art7_response: "Nous nous engageons a repondre dans un delai de 30 jours. Une piece d'identite pourra etre demandee pour verifier votre identite.",
    art7_complaint_title: 'Reclamation aupres de la CNIL',
    art7_complaint_p: "Si vous estimez que vos droits ne sont pas respectes, vous pouvez introduire une reclamation aupres de la Commission Nationale de l'Informatique et des Libertes (CNIL) :",
    art7_complaint_online: 'En ligne',
    art7_complaint_mail: 'Par courrier : CNIL, 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07',
    art8_title: 'Article 8 — Cookies et traceurs',
    art8_1_title: '8.1 Cookies utilises',
    art8_cookie_headers: ['Cookie', 'Finalite', 'Duree', 'Type'],
    art8_cookies: [
      ['scouthub_session', 'Authentification et maintien de connexion', 'Session', 'Strictement necessaire'],
      ['scouthub-lang', 'Preference de langue', 'Persistant', 'Strictement necessaire'],
      ['theme', 'Preference de theme (clair/sombre)', 'Persistant', 'Strictement necessaire'],
    ],
    art8_2_title: "8.2 Ce que nous n'utilisons PAS",
    art8_2_items: [
      'Aucun cookie publicitaire',
      'Aucun cookie de traçage tiers (Google Analytics, Facebook Pixel, etc.)',
      'Aucun outil de retargeting',
    ],
    art8_3_title: '8.3 Analytics',
    art8_3_p: "Scouty utilise Vercel Analytics pour des metriques anonymes de performance (temps de chargement, erreurs). Cet outil ne depose aucun cookie et ne collecte aucune donnee personnelle identifiante.",
    art8_4_title: '8.4 Base legale',
    art8_4_p: "Conformement a la directive ePrivacy (2002/58/CE) et aux lignes directrices de la CNIL, les cookies strictement necessaires au fonctionnement du service sont exemptes de consentement prealable. Scouty n'utilisant que des cookies strictement necessaires, aucun consentement prealable n'est requis.",
    art9_title: 'Article 9 — Securite des donnees',
    art9_p: "Scouty met en oeuvre les mesures de securite suivantes, inspirees du referentiel ISO/IEC 27001 :",
    art9_items: [
      { label: 'Chiffrement en transit', desc: 'TLS 1.3 sur toutes les communications' },
      { label: 'Chiffrement au repos', desc: 'AES-256 sur les donnees stockees' },
      { label: 'Hachage des mots de passe', desc: 'algorithme bcrypt avec sel unique' },
      { label: 'Isolation des donnees', desc: "chaque utilisateur ne peut acceder qu'a ses propres donnees (Row Level Security)" },
      { label: 'Authentification renforcee', desc: 'support 2FA (TOTP et email)' },
      { label: 'Sauvegardes', desc: 'sauvegardes automatiques quotidiennes de la base de donnees' },
      { label: 'Surveillance', desc: 'journalisation des acces et monitoring des anomalies' },
      { label: 'Mises a jour', desc: 'application reguliere des correctifs de securite' },
    ],
    art10_title: 'Article 10 — Violation de donnees',
    art10_p: "En cas de violation de donnees a caractere personnel :",
    art10_items: [
      "L'Editeur notifie la <strong>CNIL</strong> dans un delai de <strong>72 heures</strong> conformement a l'article 33 du RGPD",
      "Les utilisateurs concernes sont informes <strong>dans les meilleurs delais</strong> si la violation est susceptible d'engendrer un risque eleve pour leurs droits et libertes (article 34 du RGPD)",
      'Les mesures correctives sont deployees immediatement et documentees',
    ],
    art11_title: 'Article 11 — Donnees des mineurs',
    art11_p: "La Plateforme est destinee a un usage professionnel. L'inscription est reservee aux personnes agees de 16 ans minimum. Si nous apprenons que des donnees d'un mineur de moins de 16 ans ont ete collectees sans le consentement parental requis, nous les supprimerons dans les plus brefs delais.",
    art12_title: 'Article 12 — Modification de la politique',
    art12_p1: "La presente politique peut etre modifiee a tout moment. Toute modification substantielle sera notifiee par email et/ou par notification sur la plateforme au moins 30 jours avant son entree en vigueur.",
    art12_p2: 'La date de derniere mise a jour est indiquee en haut de cette page.',
    art13_title: 'Article 13 — Contact',
    art13_p: 'Pour toute question relative a la protection de vos donnees personnelles :',
    art13_dpo: 'Delegue a la protection des donnees (DPO)',
    art13_support: 'Support general',
    footer: 'Cette politique de confidentialite est consultable a tout moment sur',
  },
  en: {
    title: 'Privacy Policy',
    effective: 'Effective as of April 1, 2026',
    art1_title: 'Article 1 — Data Controller',
    art1_p1: 'The data controller for personal data collected through the Scouty platform (scouty.app) is:',
    art1_items: [
      '<strong>Scouty</strong>, a service published by [Company name to be completed], [legal form], with a share capital of [amount] euros',
      'Registered with the RCS of [city] under number [number]',
      'Registered office: [address]',
    ],
    art1_email_label: 'Contact email',
    art1_p2: "The Publisher acts as data controller for User data (account, profile, preferences) and as data processor for player data entered by the User.",
    art2_title: 'Article 2 — Data Collected',
    art2_1_title: '2.1 Data provided directly by the User',
    art2_1_items: [
      { label: 'Identification data', desc: 'last name, first name, email address' },
      { label: 'Professional data', desc: 'club/organization name, professional role (scout, recruiter, coach, agent)' },
      { label: 'Authentication data', desc: 'password (stored as a bcrypt hash, never in plain text)' },
      { label: 'Scouting data', desc: 'player profiles, observation reports, notes, evaluations, watchlists, shadow teams' },
      { label: 'Financial data', desc: 'processed exclusively by Stripe (PCI-DSS); no banking data is stored on our servers' },
    ],
    art2_2_title: '2.2 Data collected automatically',
    art2_2_items: [
      { label: 'Technical data', desc: 'IP address, browser type and version, operating system, screen resolution' },
      { label: 'Connection data', desc: 'date and time of connection, pages visited, session duration' },
      { label: 'Strictly necessary cookies', desc: 'authentication session, language and theme preferences' },
    ],
    art2_3_title: '2.3 Data from automatic enrichment',
    art2_3_p: "For users who have enabled enrichment, player data (photo, market value, career statistics) is collected from public sources (Transfermarkt, TheSportsDB, API-Football). This data is stored in the User's account and is subject to the same privacy rules.",
    art3_title: 'Article 3 — Purposes and Legal Bases for Processing',
    art3_headers: ['Purpose', 'Legal basis'],
    art3_rows: [
      ['Account creation and management', 'Performance of the contract (Terms of Use)'],
      ['Provision of scouting service', 'Performance of the contract'],
      ['Payment processing and billing', 'Performance of the contract'],
      ['Sending service notifications', 'Legitimate interest'],
      ['Service improvement and bug fixing', 'Legitimate interest'],
      ['Anonymous analytics (Vercel Analytics)', 'Legitimate interest'],
      ['Technical support and ticket response', 'Performance of the contract'],
      ['Security and fraud prevention', 'Legal obligation / Legitimate interest'],
    ],
    art4_title: 'Article 4 — Data Retention Period',
    art4_items: [
      { label: 'Account data', desc: 'retained for the duration of your subscription. Deleted within 30 days of an account deletion request.' },
      { label: 'Scouting data', desc: 'retained for the duration of your account. Exportable at any time. Deleted with the account.' },
      { label: 'Billing data', desc: 'retained for 10 years in accordance with French accounting and tax obligations (art. L.123-22 of the Commercial Code).' },
      { label: 'Connection logs', desc: 'retained for 12 months in accordance with applicable legislation (LCEN).' },
      { label: 'Password reset tokens', desc: 'expired and deleted after 1 hour.' },
      { label: 'Inactive accounts', desc: 'accounts inactive for more than 24 months may be deleted after email notification.' },
    ],
    art5_title: 'Article 5 — Recipients and Sub-processors',
    art5_p1: 'Your personal data is processed by the following sub-processors, strictly within the scope of providing the service:',
    art5_headers: ['Sub-processor', 'Purpose', 'Location'],
    art5_rows: [
      ['TiDB Cloud (PingCAP)', 'Database hosting', 'EU (Frankfurt)'],
      ['Vercel Inc.', 'Application hosting and anonymous analytics', 'USA (Standard Contractual Clauses)'],
      ['Stripe Inc.', 'Payment processing', 'USA (PCI-DSS certified, Standard Contractual Clauses)'],
      ['Nodemailer / SMTP', 'Transactional email delivery', 'EU'],
      ['API-Football (RapidAPI)', 'Match data and statistics', 'EU'],
    ],
    art5_p2: "No personal data is sold or rented to third parties. Data is only shared with the sub-processors listed above, under contracts compliant with Article 28 of the GDPR.",
    art6_title: 'Article 6 — Data Transfers Outside the EU',
    art6_p: 'Some of our sub-processors (Vercel, Stripe) are based in the United States. These transfers are governed by:',
    art6_items: [
      '<strong>Standard Contractual Clauses (SCCs)</strong> adopted by the European Commission (Decision 2021/914)',
      'Additional technical <strong>security measures</strong> (encryption, pseudonymization)',
      'For Stripe: <strong>PCI-DSS</strong> compliance and the <strong>EU-US Data Privacy Framework</strong>',
    ],
    art7_title: 'Article 7 — Your Rights',
    art7_p: 'In accordance with the GDPR (Articles 15 to 22) and the French Data Protection Act, you have the following rights:',
    art7_rights: [
      { label: 'Right of access', art: 'Art. 15', desc: 'obtain confirmation that your data is being processed and receive a copy' },
      { label: 'Right to rectification', art: 'Art. 16', desc: 'correct inaccurate or incomplete data' },
      { label: 'Right to erasure / right to be forgotten', art: 'Art. 17', desc: 'request the deletion of your data' },
      { label: 'Right to restriction', art: 'Art. 18', desc: 'restrict the processing of your data' },
      { label: 'Right to data portability', art: 'Art. 20', desc: 'receive your data in a structured format' },
      { label: 'Right to object', art: 'Art. 21', desc: 'object to the processing of your data' },
      { label: 'Right to withdraw consent', art: 'Art. 7', desc: 'at any time, without affecting the lawfulness of processing carried out before withdrawal' },
      { label: 'Right to define post-mortem directives', art: '', desc: 'regarding the retention, deletion, or communication of your data after your death' },
    ],
    art7_delete_link: 'Can be exercised directly from your',
    art7_account_page: 'Account page',
    art7_delete_button: '("Delete my account" button)',
    art7_export_button: '("Export my data" button)',
    art7_how_title: 'How to exercise your rights',
    art7_self_service: 'Self-service',
    art7_self_service_desc: 'from your',
    art7_self_service_details: '(data export, account deletion)',
    art7_by_email: 'By email',
    art7_response: "We commit to responding within 30 days. Proof of identity may be requested to verify your identity.",
    art7_complaint_title: 'Complaint to the CNIL',
    art7_complaint_p: 'If you believe your rights are not being respected, you may file a complaint with the French National Commission on Informatics and Liberty (CNIL):',
    art7_complaint_online: 'Online',
    art7_complaint_mail: 'By mail: CNIL, 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07',
    art8_title: 'Article 8 — Cookies and Trackers',
    art8_1_title: '8.1 Cookies used',
    art8_cookie_headers: ['Cookie', 'Purpose', 'Duration', 'Type'],
    art8_cookies: [
      ['scouthub_session', 'Authentication and session maintenance', 'Session', 'Strictly necessary'],
      ['scouthub-lang', 'Language preference', 'Persistent', 'Strictly necessary'],
      ['theme', 'Theme preference (light/dark)', 'Persistent', 'Strictly necessary'],
    ],
    art8_2_title: '8.2 What we do NOT use',
    art8_2_items: [
      'No advertising cookies',
      'No third-party tracking cookies (Google Analytics, Facebook Pixel, etc.)',
      'No retargeting tools',
    ],
    art8_3_title: '8.3 Analytics',
    art8_3_p: "Scouty uses Vercel Analytics for anonymous performance metrics (load times, errors). This tool does not place any cookies and does not collect any personally identifiable data.",
    art8_4_title: '8.4 Legal basis',
    art8_4_p: "In accordance with the ePrivacy Directive (2002/58/EC) and CNIL guidelines, strictly necessary cookies for the operation of the service are exempt from prior consent. Since Scouty only uses strictly necessary cookies, no prior consent is required.",
    art9_title: 'Article 9 — Data Security',
    art9_p: "Scouty implements the following security measures, based on the ISO/IEC 27001 framework:",
    art9_items: [
      { label: 'Encryption in transit', desc: 'TLS 1.3 on all communications' },
      { label: 'Encryption at rest', desc: 'AES-256 on stored data' },
      { label: 'Password hashing', desc: 'bcrypt algorithm with unique salt' },
      { label: 'Data isolation', desc: 'each user can only access their own data (Row Level Security)' },
      { label: 'Enhanced authentication', desc: '2FA support (TOTP and email)' },
      { label: 'Backups', desc: 'automatic daily database backups' },
      { label: 'Monitoring', desc: 'access logging and anomaly monitoring' },
      { label: 'Updates', desc: 'regular application of security patches' },
    ],
    art10_title: 'Article 10 — Data Breach',
    art10_p: "In the event of a personal data breach:",
    art10_items: [
      'The Publisher will notify the <strong>CNIL</strong> within <strong>72 hours</strong> in accordance with Article 33 of the GDPR',
      'Affected users will be informed <strong>as soon as possible</strong> if the breach is likely to result in a high risk to their rights and freedoms (Article 34 of the GDPR)',
      'Corrective measures will be deployed immediately and documented',
    ],
    art11_title: 'Article 11 — Data of Minors',
    art11_p: "The Platform is intended for professional use. Registration is reserved for persons aged 16 or older. If we learn that data from a minor under 16 has been collected without the required parental consent, we will delete it as soon as possible.",
    art12_title: 'Article 12 — Policy Modifications',
    art12_p1: "This policy may be modified at any time. Any substantial modification will be notified by email and/or by notification on the platform at least 30 days before it takes effect.",
    art12_p2: 'The date of the last update is indicated at the top of this page.',
    art13_title: 'Article 13 — Contact',
    art13_p: 'For any questions regarding the protection of your personal data:',
    art13_dpo: 'Data Protection Officer (DPO)',
    art13_support: 'General support',
    footer: 'This privacy policy is available at any time at',
  },
  es: {
    title: 'Politica de Privacidad',
    effective: 'En vigor desde el 1 de abril de 2026',
    art1_title: 'Articulo 1 — Responsable del tratamiento',
    art1_p1: 'El responsable del tratamiento de los datos personales recogidos a traves de la plataforma Scouty (scouty.app) es:',
    art1_items: [
      '<strong>Scouty</strong>, servicio editado por la sociedad [Razon social por completar], [forma juridica], con un capital de [importe] euros',
      'Inscrita en el RCS de [ciudad] con el numero [numero]',
      'Domicilio social: [direccion]',
    ],
    art1_email_label: 'Email de contacto',
    art1_p2: "El Editor actua como responsable del tratamiento para los datos de los Usuarios (cuenta, perfil, preferencias) y como encargado del tratamiento para los datos de jugadores introducidos por el Usuario.",
    art2_title: 'Articulo 2 — Datos recogidos',
    art2_1_title: '2.1 Datos proporcionados directamente por el Usuario',
    art2_1_items: [
      { label: 'Datos de identificacion', desc: 'apellido, nombre, direccion de correo electronico' },
      { label: 'Datos profesionales', desc: 'nombre del club/organizacion, rol profesional (ojeador, reclutador, entrenador, agente)' },
      { label: 'Datos de autenticacion', desc: 'contrasena (almacenada como hash bcrypt, nunca en texto plano)' },
      { label: 'Datos de scouting', desc: 'fichas de jugadores, informes de observacion, notas, evaluaciones, watchlists, shadow teams' },
      { label: 'Datos financieros', desc: 'tratados exclusivamente por Stripe (PCI-DSS); ningun dato bancario se almacena en nuestros servidores' },
    ],
    art2_2_title: '2.2 Datos recogidos automaticamente',
    art2_2_items: [
      { label: 'Datos tecnicos', desc: 'direccion IP, tipo y version del navegador, sistema operativo, resolucion de pantalla' },
      { label: 'Datos de conexion', desc: 'fecha y hora de conexion, paginas visitadas, duracion de la sesion' },
      { label: 'Cookies estrictamente necesarias', desc: 'sesion de autenticacion, preferencias de idioma y tema' },
    ],
    art2_3_title: '2.3 Datos procedentes del enriquecimiento automatico',
    art2_3_p: "Para los usuarios que han activado el enriquecimiento, se recogen datos de jugadores (foto, valor de mercado, estadisticas de carrera) de fuentes publicas (Transfermarkt, TheSportsDB, API-Football). Estos datos se almacenan en la cuenta del Usuario y estan sujetos a las mismas reglas de privacidad.",
    art3_title: 'Articulo 3 — Finalidades y bases legales del tratamiento',
    art3_headers: ['Finalidad', 'Base legal'],
    art3_rows: [
      ['Creacion y gestion de su cuenta', 'Ejecucion del contrato (Condiciones de uso)'],
      ['Prestacion del servicio de scouting', 'Ejecucion del contrato'],
      ['Procesamiento de pagos y facturacion', 'Ejecucion del contrato'],
      ['Envio de notificaciones del servicio', 'Interes legitimo'],
      ['Mejora del servicio y correccion de errores', 'Interes legitimo'],
      ['Analiticas anonimas (Vercel Analytics)', 'Interes legitimo'],
      ['Soporte tecnico y respuesta a tickets', 'Ejecucion del contrato'],
      ['Seguridad y prevencion de fraude', 'Obligacion legal / Interes legitimo'],
    ],
    art4_title: 'Articulo 4 — Periodo de conservacion',
    art4_items: [
      { label: 'Datos de cuenta', desc: 'conservados durante toda la duracion de su suscripcion. Eliminados en un plazo de 30 dias tras la solicitud de eliminacion de la cuenta.' },
      { label: 'Datos de scouting', desc: 'conservados durante la duracion de su cuenta. Exportables en cualquier momento. Eliminados con la cuenta.' },
      { label: 'Datos de facturacion', desc: 'conservados 10 anos conforme a las obligaciones contables y fiscales francesas (art. L.123-22 del Codigo de Comercio).' },
      { label: 'Registros de conexion', desc: 'conservados 12 meses conforme a la legislacion aplicable (LCEN).' },
      { label: 'Tokens de restablecimiento de contrasena', desc: 'caducados y eliminados despues de 1 hora.' },
      { label: 'Cuentas inactivas', desc: 'las cuentas inactivas durante mas de 24 meses pueden ser eliminadas previa notificacion por correo electronico.' },
    ],
    art5_title: 'Articulo 5 — Destinatarios y subencargados',
    art5_p1: 'Sus datos personales son tratados por los siguientes subencargados, estrictamente en el marco de la prestacion del servicio:',
    art5_headers: ['Subencargado', 'Finalidad', 'Ubicacion'],
    art5_rows: [
      ['TiDB Cloud (PingCAP)', 'Alojamiento de la base de datos', 'UE (Frankfurt)'],
      ['Vercel Inc.', 'Alojamiento de la aplicacion y analiticas anonimas', 'EE.UU. (Clausulas Contractuales Tipo)'],
      ['Stripe Inc.', 'Procesamiento de pagos', 'EE.UU. (certificado PCI-DSS, Clausulas Contractuales Tipo)'],
      ['Nodemailer / SMTP', 'Envio de correos electronicos transaccionales', 'UE'],
      ['API-Football (RapidAPI)', 'Datos de partidos y estadisticas', 'UE'],
    ],
    art5_p2: "Ningun dato personal se vende ni se alquila a terceros. Los datos solo se transmiten a los subencargados listados anteriormente, en el marco de contratos conformes al articulo 28 del RGPD.",
    art6_title: 'Articulo 6 — Transferencias de datos fuera de la UE',
    art6_p: 'Algunos de nuestros subencargados (Vercel, Stripe) estan establecidos en Estados Unidos. Estas transferencias estan reguladas por:',
    art6_items: [
      'Las <strong>Clausulas Contractuales Tipo (CCT)</strong> adoptadas por la Comision Europea (Decision 2021/914)',
      'Las <strong>medidas suplementarias</strong> de seguridad tecnica (cifrado, seudonimizacion)',
      'Para Stripe: la conformidad <strong>PCI-DSS</strong> y el <strong>Marco de Privacidad de Datos UE-EE.UU.</strong>',
    ],
    art7_title: 'Articulo 7 — Sus derechos',
    art7_p: 'De conformidad con el RGPD (articulos 15 a 22) y la Ley francesa de Proteccion de Datos, usted dispone de los siguientes derechos:',
    art7_rights: [
      { label: 'Derecho de acceso', art: 'Art. 15', desc: 'obtener confirmacion de que sus datos estan siendo tratados y recibir una copia' },
      { label: 'Derecho de rectificacion', art: 'Art. 16', desc: 'corregir datos inexactos o incompletos' },
      { label: 'Derecho de supresion / derecho al olvido', art: 'Art. 17', desc: 'solicitar la eliminacion de sus datos' },
      { label: 'Derecho a la limitacion', art: 'Art. 18', desc: 'restringir el tratamiento de sus datos' },
      { label: 'Derecho a la portabilidad', art: 'Art. 20', desc: 'recibir sus datos en un formato estructurado' },
      { label: 'Derecho de oposicion', art: 'Art. 21', desc: 'oponerse al tratamiento de sus datos' },
      { label: 'Derecho a retirar el consentimiento', art: 'Art. 7', desc: 'en cualquier momento, sin afectar la licitud del tratamiento realizado antes de la retirada' },
      { label: 'Derecho a definir directivas post-mortem', art: '', desc: 'relativas a la conservacion, eliminacion o comunicacion de sus datos tras su fallecimiento' },
    ],
    art7_delete_link: 'Ejercible directamente desde su',
    art7_account_page: 'pagina de Cuenta',
    art7_delete_button: '(boton "Eliminar mi cuenta")',
    art7_export_button: '(boton "Exportar mis datos")',
    art7_how_title: 'Como ejercer sus derechos',
    art7_self_service: 'Autoservicio',
    art7_self_service_desc: 'desde su',
    art7_self_service_details: '(exportacion de datos, eliminacion de cuenta)',
    art7_by_email: 'Por correo electronico',
    art7_response: "Nos comprometemos a responder en un plazo de 30 dias. Se podra solicitar un documento de identidad para verificar su identidad.",
    art7_complaint_title: 'Reclamacion ante la CNIL',
    art7_complaint_p: 'Si considera que sus derechos no se respetan, puede presentar una reclamacion ante la Comision Nacional de Informatica y Libertades (CNIL):',
    art7_complaint_online: 'En linea',
    art7_complaint_mail: 'Por correo postal: CNIL, 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07',
    art8_title: 'Articulo 8 — Cookies y rastreadores',
    art8_1_title: '8.1 Cookies utilizadas',
    art8_cookie_headers: ['Cookie', 'Finalidad', 'Duracion', 'Tipo'],
    art8_cookies: [
      ['scouthub_session', 'Autenticacion y mantenimiento de sesion', 'Sesion', 'Estrictamente necesaria'],
      ['scouthub-lang', 'Preferencia de idioma', 'Persistente', 'Estrictamente necesaria'],
      ['theme', 'Preferencia de tema (claro/oscuro)', 'Persistente', 'Estrictamente necesaria'],
    ],
    art8_2_title: '8.2 Lo que NO utilizamos',
    art8_2_items: [
      'Ninguna cookie publicitaria',
      'Ninguna cookie de seguimiento de terceros (Google Analytics, Facebook Pixel, etc.)',
      'Ninguna herramienta de retargeting',
    ],
    art8_3_title: '8.3 Analiticas',
    art8_3_p: "Scouty utiliza Vercel Analytics para metricas anonimas de rendimiento (tiempos de carga, errores). Esta herramienta no coloca ninguna cookie y no recoge ningun dato personal identificable.",
    art8_4_title: '8.4 Base legal',
    art8_4_p: "De conformidad con la Directiva ePrivacy (2002/58/CE) y las directrices de la CNIL, las cookies estrictamente necesarias para el funcionamiento del servicio estan exentas de consentimiento previo. Dado que Scouty solo utiliza cookies estrictamente necesarias, no se requiere consentimiento previo.",
    art9_title: 'Articulo 9 — Seguridad de los datos',
    art9_p: "Scouty implementa las siguientes medidas de seguridad, basadas en el marco ISO/IEC 27001:",
    art9_items: [
      { label: 'Cifrado en transito', desc: 'TLS 1.3 en todas las comunicaciones' },
      { label: 'Cifrado en reposo', desc: 'AES-256 en los datos almacenados' },
      { label: 'Hash de contrasenas', desc: 'algoritmo bcrypt con sal unico' },
      { label: 'Aislamiento de datos', desc: 'cada usuario solo puede acceder a sus propios datos (Row Level Security)' },
      { label: 'Autenticacion reforzada', desc: 'soporte 2FA (TOTP y correo electronico)' },
      { label: 'Copias de seguridad', desc: 'copias de seguridad automaticas diarias de la base de datos' },
      { label: 'Monitorizacion', desc: 'registro de accesos y monitorizacion de anomalias' },
      { label: 'Actualizaciones', desc: 'aplicacion regular de parches de seguridad' },
    ],
    art10_title: 'Articulo 10 — Violacion de datos',
    art10_p: "En caso de violacion de datos personales:",
    art10_items: [
      'El Editor notificara a la <strong>CNIL</strong> en un plazo de <strong>72 horas</strong> conforme al articulo 33 del RGPD',
      'Los usuarios afectados seran informados <strong>lo antes posible</strong> si la violacion puede generar un alto riesgo para sus derechos y libertades (articulo 34 del RGPD)',
      'Las medidas correctivas se desplegaran inmediatamente y se documentaran',
    ],
    art11_title: 'Articulo 11 — Datos de menores',
    art11_p: "La Plataforma esta destinada a un uso profesional. El registro esta reservado a personas de 16 anos o mas. Si descubrimos que se han recogido datos de un menor de 16 anos sin el consentimiento parental requerido, los eliminaremos lo antes posible.",
    art12_title: 'Articulo 12 — Modificacion de la politica',
    art12_p1: "La presente politica puede ser modificada en cualquier momento. Cualquier modificacion sustancial sera notificada por correo electronico y/o mediante notificacion en la plataforma al menos 30 dias antes de su entrada en vigor.",
    art12_p2: 'La fecha de la ultima actualizacion se indica en la parte superior de esta pagina.',
    art13_title: 'Articulo 13 — Contacto',
    art13_p: 'Para cualquier pregunta relativa a la proteccion de sus datos personales:',
    art13_dpo: 'Delegado de Proteccion de Datos (DPO)',
    art13_support: 'Soporte general',
    footer: 'Esta politica de privacidad esta disponible en cualquier momento en',
  },
};

type Lang = keyof typeof content;

export default function Privacy() {
  const { t, i18n } = useTranslation();
  const lang = (Object.keys(content).includes(i18n.language) ? i18n.language : 'fr') as Lang;
  const c = content[lang];

  return (
    <div className="min-h-screen bg-background">
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
        <p className="text-muted-foreground mb-10">{c.effective}</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed">

          {/* Article 1 */}
          <section>
            <h2 className="text-lg font-bold">{c.art1_title}</h2>
            <p>{c.art1_p1}</p>
            <ul>
              {c.art1_items.map((item, i) => (
                <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
              ))}
              <li>{c.art1_email_label} : <a href="mailto:dpo@scouty.app" className="text-primary hover:underline">dpo@scouty.app</a></li>
            </ul>
            <p>{c.art1_p2}</p>
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
            <p>{c.art2_3_p}</p>
          </section>

          {/* Article 3 */}
          <section>
            <h2 className="text-lg font-bold">{c.art3_title}</h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">{c.art3_headers[0]}</th>
                  <th className="text-left py-2 font-semibold">{c.art3_headers[1]}</th>
                </tr>
              </thead>
              <tbody>
                {c.art3_rows.map((row, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-2 pr-4">{row[0]}</td>
                    <td className="py-2">{row[1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Article 4 */}
          <section>
            <h2 className="text-lg font-bold">{c.art4_title}</h2>
            <ul>
              {c.art4_items.map((item, i) => (
                <li key={i}><strong>{item.label}</strong> : {item.desc}</li>
              ))}
            </ul>
          </section>

          {/* Article 5 */}
          <section>
            <h2 className="text-lg font-bold">{c.art5_title}</h2>
            <p>{c.art5_p1}</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">{c.art5_headers[0]}</th>
                  <th className="text-left py-2 pr-4 font-semibold">{c.art5_headers[1]}</th>
                  <th className="text-left py-2 font-semibold">{c.art5_headers[2]}</th>
                </tr>
              </thead>
              <tbody>
                {c.art5_rows.map((row, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-2 pr-4 font-medium">{row[0]}</td>
                    <td className="py-2 pr-4">{row[1]}</td>
                    <td className="py-2">{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3">{c.art5_p2}</p>
          </section>

          {/* Article 6 */}
          <section>
            <h2 className="text-lg font-bold">{c.art6_title}</h2>
            <p>{c.art6_p}</p>
            <ul>
              {c.art6_items.map((item, i) => (
                <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
              ))}
            </ul>
          </section>

          {/* Article 7 */}
          <section>
            <h2 className="text-lg font-bold">{c.art7_title}</h2>
            <p>{c.art7_p}</p>
            <ul>
              {c.art7_rights.map((right, i) => (
                <li key={i}>
                  <strong>{right.label}</strong>{right.art ? ` (${right.art})` : ''} : {right.desc}
                  {i === 2 && (
                    <>. {c.art7_delete_link} <Link to="/account" className="text-primary hover:underline">{c.art7_account_page}</Link> {c.art7_delete_button}</>
                  )}
                  {i === 4 && (
                    <>. {c.art7_delete_link} <Link to="/account" className="text-primary hover:underline">{c.art7_account_page}</Link> {c.art7_export_button}</>
                  )}
                </li>
              ))}
            </ul>

            <h3 className="text-base font-semibold mt-4">{c.art7_how_title}</h3>
            <ul>
              <li><strong>{c.art7_self_service}</strong> : {c.art7_self_service_desc} <Link to="/account" className="text-primary hover:underline">{c.art7_account_page}</Link> {c.art7_self_service_details}</li>
              <li><strong>{c.art7_by_email}</strong> : <a href="mailto:dpo@scouty.app" className="text-primary hover:underline">dpo@scouty.app</a></li>
            </ul>
            <p>{c.art7_response}</p>

            <h3 className="text-base font-semibold mt-4">{c.art7_complaint_title}</h3>
            <p>{c.art7_complaint_p}</p>
            <ul>
              <li>{c.art7_complaint_online} : <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">www.cnil.fr/fr/plaintes</a></li>
              <li>{c.art7_complaint_mail}</li>
            </ul>
          </section>

          {/* Article 8 */}
          <section>
            <h2 className="text-lg font-bold">{c.art8_title}</h2>
            <h3 className="text-base font-semibold mt-4">{c.art8_1_title}</h3>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {c.art8_cookie_headers.map((h, i) => (
                    <th key={i} className="text-left py-2 pr-4 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.art8_cookies.map((row, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-2 pr-4 font-mono text-xs">{row[0]}</td>
                    <td className="py-2 pr-4">{row[1]}</td>
                    <td className="py-2 pr-4">{row[2]}</td>
                    <td className="py-2">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="text-base font-semibold mt-4">{c.art8_2_title}</h3>
            <ul>
              {c.art8_2_items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>

            <h3 className="text-base font-semibold mt-4">{c.art8_3_title}</h3>
            <p>{c.art8_3_p}</p>

            <h3 className="text-base font-semibold mt-4">{c.art8_4_title}</h3>
            <p>{c.art8_4_p}</p>
          </section>

          {/* Article 9 */}
          <section>
            <h2 className="text-lg font-bold">{c.art9_title}</h2>
            <p>{c.art9_p}</p>
            <ul>
              {c.art9_items.map((item, i) => (
                <li key={i}><strong>{item.label}</strong> : {item.desc}</li>
              ))}
            </ul>
          </section>

          {/* Article 10 */}
          <section>
            <h2 className="text-lg font-bold">{c.art10_title}</h2>
            <p>{c.art10_p}</p>
            <ul>
              {c.art10_items.map((item, i) => (
                <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
              ))}
            </ul>
          </section>

          {/* Article 11 */}
          <section>
            <h2 className="text-lg font-bold">{c.art11_title}</h2>
            <p>{c.art11_p}</p>
          </section>

          {/* Article 12 */}
          <section>
            <h2 className="text-lg font-bold">{c.art12_title}</h2>
            <p>{c.art12_p1}</p>
            <p>{c.art12_p2}</p>
          </section>

          {/* Article 13 */}
          <section>
            <h2 className="text-lg font-bold">{c.art13_title}</h2>
            <p>{c.art13_p}</p>
            <ul>
              <li>{c.art13_dpo} : <a href="mailto:dpo@scouty.app" className="text-primary hover:underline">dpo@scouty.app</a></li>
              <li>{c.art13_support} : <a href="mailto:support@scouty.app" className="text-primary hover:underline">support@scouty.app</a></li>
            </ul>
          </section>

          <section className="border-t border-border pt-6">
            <p className="text-xs text-muted-foreground">
              {c.footer} <a href="/privacy" className="text-primary hover:underline">scouty.app/privacy</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
