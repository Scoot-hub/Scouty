import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.png';
import PageSEO from '@/components/PageSEO';

export default function CGU() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <PageSEO
        path="/cgu"
        title="Conditions Générales d'Utilisation | Scouty"
        description="Conditions Générales d'Utilisation de la plateforme Scouty. Droits et obligations des utilisateurs, propriété intellectuelle, responsabilités et protection des données personnelles."
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
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Conditions Generales d'Utilisation</h1>
        <p className="text-muted-foreground mb-10">En vigueur au 1er avril 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold">Article 1 — Definitions</h2>
            <p>Dans le cadre des presentes Conditions Generales d'Utilisation (ci-apres "CGU"), les termes suivants sont definis comme suit :</p>
            <ul>
              <li><strong>Plateforme</strong> : le site web scouty.app et l'ensemble de ses fonctionnalites, accessible depuis un navigateur web.</li>
              <li><strong>Editeur</strong> : la societe editrice de la Plateforme Scouty, [Raison sociale a completer], [forme juridique], immatriculee au RCS de [ville] sous le numero [numero].</li>
              <li><strong>Utilisateur</strong> : toute personne physique ou morale qui accede a la Plateforme et cree un compte, qu'elle dispose d'un abonnement gratuit ou payant.</li>
              <li><strong>Compte</strong> : l'espace personnel de l'Utilisateur, accessible apres authentification par identifiant et mot de passe.</li>
              <li><strong>Contenu Utilisateur</strong> : l'ensemble des donnees, textes, fichiers, rapports et informations saisis par l'Utilisateur sur la Plateforme.</li>
              <li><strong>Organisation</strong> : un espace collaboratif regroupant plusieurs Utilisateurs au sein d'une meme structure (club, agence, cellule de recrutement).</li>
              <li><strong>Services</strong> : l'ensemble des fonctionnalites proposees par la Plateforme, incluant la gestion de fiches joueurs, rapports, watchlists, shadow teams, exports, enrichissement de donnees et outils collaboratifs.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 2 — Objet et acceptation</h2>
            <p>Les presentes CGU ont pour objet de definir les conditions d'acces et d'utilisation de la Plateforme Scouty par tout Utilisateur.</p>
            <p>L'inscription sur la Plateforme implique l'acceptation pleine et entiere des presentes CGU. L'Utilisateur reconnait en avoir pris connaissance et s'engage a les respecter. Si l'Utilisateur n'accepte pas les presentes CGU, il ne doit pas utiliser la Plateforme.</p>
            <p>Les presentes CGU sont completees, le cas echeant, par les <Link to="/cgv" className="text-primary hover:underline">Conditions Generales de Vente</Link> applicables aux abonnements payants et par la <Link to="/privacy" className="text-primary hover:underline">Politique de confidentialite</Link>.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 3 — Inscription et compte utilisateur</h2>
            <h3 className="text-base font-semibold mt-4">3.1 Creation de compte</h3>
            <p>L'acces aux Services necessite la creation prealable d'un Compte. L'Utilisateur doit fournir des informations exactes, completes et a jour lors de son inscription, notamment :</p>
            <ul>
              <li>Son nom complet</li>
              <li>Une adresse email valide</li>
              <li>Le nom de son club ou organisation (le cas echeant)</li>
              <li>Son role professionnel (scout, recruteur, coach, agent, etc.)</li>
            </ul>
            <p>L'Utilisateur s'engage a mettre a jour ces informations en cas de changement.</p>

            <h3 className="text-base font-semibold mt-4">3.2 Securite du compte</h3>
            <p>L'Utilisateur est seul responsable de la confidentialite de ses identifiants de connexion (adresse email et mot de passe). Il s'engage a :</p>
            <ul>
              <li>Choisir un mot de passe robuste (minimum 8 caracteres, incluant majuscules, chiffres et caracteres speciaux)</li>
              <li>Ne pas communiquer ses identifiants a des tiers</li>
              <li>Informer immediatement l'Editeur en cas de suspicion d'utilisation non autorisee de son Compte</li>
              <li>Activer l'authentification a deux facteurs (2FA) pour une securite renforcee</li>
            </ul>
            <p>Toute activite realisee depuis le Compte de l'Utilisateur est presumee effectuee par celui-ci. L'Editeur ne saurait etre tenu responsable des consequences d'une utilisation non autorisee du Compte.</p>

            <h3 className="text-base font-semibold mt-4">3.3 Unicite du compte</h3>
            <p>Chaque personne physique ne peut detenir qu'un seul Compte. La creation de comptes multiples par une meme personne dans le but de contourner les limitations du plan gratuit est interdite et peut entrainer la suspension ou la suppression des comptes concernes.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 4 — Description des services</h2>
            <h3 className="text-base font-semibold mt-4">4.1 Plans d'abonnement</h3>
            <p>La Plateforme propose plusieurs niveaux de service :</p>
            <ul>
              <li><strong>Starter (gratuit)</strong> : acces limite a 30 fiches joueurs, 2 watchlists, 1 shadow team, rapports basiques</li>
              <li><strong>Scout+ (19 EUR/mois)</strong> : 200 fiches joueurs, watchlists illimitees, enrichissement automatique, exports PDF et Excel</li>
              <li><strong>Pro (29 EUR/mois)</strong> : joueurs illimites, shadow teams illimites, calendrier et missions, integration API-Football, tous les enrichissements et exports</li>
              <li><strong>Elite (sur devis)</strong> : tout le plan Pro, effectif complet, permissions avancees, onboarding dedie, support prioritaire et SLA, integrations sur-mesure, 2FA et audit log</li>
            </ul>
            <p>Le detail et les tarifs a jour sont disponibles sur la page <Link to="/pricing" className="text-primary hover:underline">Tarifs</Link> de la Plateforme.</p>

            <h3 className="text-base font-semibold mt-4">4.2 Enrichissement des donnees</h3>
            <p>La Plateforme propose un service d'enrichissement automatique des fiches joueurs a partir de sources de donnees publiques et partenaires. L'Editeur ne garantit pas l'exactitude, l'exhaustivite ou l'actualite des donnees enrichies. Ces donnees sont fournies a titre indicatif et ne sauraient se substituer a l'analyse professionnelle de l'Utilisateur.</p>

            <h3 className="text-base font-semibold mt-4">4.3 Integrations tierces</h3>
            <p>La Plateforme peut integrer des services tiers (API-Football, Transfermarkt, Cal.com, etc.). La disponibilite et le fonctionnement de ces integrations dependent des fournisseurs tiers et ne sont pas garantis par l'Editeur. L'Editeur se reserve le droit de modifier, ajouter ou supprimer des integrations a tout moment.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 5 — Obligations de l'Utilisateur</h2>
            <h3 className="text-base font-semibold mt-4">5.1 Utilisation licite</h3>
            <p>L'Utilisateur s'engage a utiliser la Plateforme conformement a sa destination, aux presentes CGU et a la legislation en vigueur. Il s'interdit notamment de :</p>
            <ul>
              <li>Utiliser la Plateforme a des fins illegales, frauduleuses ou portant atteinte aux droits de tiers</li>
              <li>Collecter ou traiter des donnees personnelles de joueurs en violation du RGPD ou de toute autre reglementation applicable en matiere de protection des donnees</li>
              <li>Tenter d'acceder de maniere non autorisee aux systemes, serveurs ou bases de donnees de la Plateforme</li>
              <li>Utiliser des robots, scripts ou outils automatises pour extraire des donnees de la Plateforme (scraping)</li>
              <li>Perturber ou surcharger l'infrastructure technique de la Plateforme</li>
              <li>Contourner les mesures de securite ou les limitations techniques mises en place</li>
              <li>Revendre, sous-licencier ou mettre a disposition de tiers l'acces a son Compte ou aux Services</li>
            </ul>

            <h3 className="text-base font-semibold mt-4">5.2 Contenu Utilisateur</h3>
            <p>L'Utilisateur est seul responsable du Contenu Utilisateur qu'il saisit sur la Plateforme. Il garantit que :</p>
            <ul>
              <li>Le Contenu Utilisateur est exact, licite et ne porte pas atteinte aux droits de tiers</li>
              <li>Le Contenu Utilisateur ne contient aucun element diffamatoire, injurieux, discriminatoire ou contraire a l'ordre public</li>
              <li>Il dispose de tous les droits et autorisations necessaires pour saisir et traiter les donnees personnelles de joueurs sur la Plateforme</li>
            </ul>
            <p>L'Editeur n'exerce aucun controle prealable sur le Contenu Utilisateur et ne saurait etre tenu responsable de son contenu.</p>

            <h3 className="text-base font-semibold mt-4">5.3 Donnees de joueurs et conformite RGPD</h3>
            <p>L'Utilisateur reconnait que les fiches joueurs peuvent contenir des donnees a caractere personnel au sens du RGPD. En sa qualite de responsable de traitement pour ces donnees, l'Utilisateur s'engage a :</p>
            <ul>
              <li>Disposer d'une base legale valide pour le traitement de ces donnees (interet legitime professionnel, consentement, etc.)</li>
              <li>Informer les personnes concernees de ce traitement conformement aux articles 13 et 14 du RGPD</li>
              <li>Respecter les droits des personnes concernees (acces, rectification, effacement, opposition)</li>
              <li>Ne pas traiter de categories particulieres de donnees (donnees de sante, opinions politiques, etc.) sauf base legale specifique</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 6 — Fonctionnalites collaboratives (Organisations)</h2>
            <p>Les plans Elite permettent la creation d'Organisations regroupant plusieurs Utilisateurs. Dans ce cadre :</p>
            <ul>
              <li>L'administrateur de l'Organisation est responsable de la gestion des membres et des permissions</li>
              <li>Les joueurs partages au sein d'une Organisation sont accessibles par tous les membres autorises</li>
              <li>Le retrait d'un membre de l'Organisation entraine la revocation de son acces aux donnees partagees</li>
              <li>L'administrateur de l'Organisation est responsable du respect des presentes CGU par l'ensemble de ses membres</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 7 — Propriete intellectuelle</h2>
            <h3 className="text-base font-semibold mt-4">7.1 Droits de l'Editeur</h3>
            <p>La Plateforme, son code source, son architecture technique, son interface graphique, ses algorithmes, ses bases de donnees et l'ensemble des elements la composant sont proteges par le droit de la propriete intellectuelle et constituent la propriete exclusive de l'Editeur.</p>
            <p>Toute reproduction, representation, modification, adaptation ou extraction non autorisee, en tout ou en partie, de ces elements est interdite et constitue une contrefacon sanctionnee par les articles L.335-2 et suivants du Code de la propriete intellectuelle.</p>

            <h3 className="text-base font-semibold mt-4">7.2 Droits de l'Utilisateur</h3>
            <p>L'Utilisateur conserve l'integralite de ses droits de propriete intellectuelle sur le Contenu Utilisateur. L'Utilisateur accorde a l'Editeur une licence limitee, non exclusive et revocable d'utilisation du Contenu Utilisateur, strictement necessaire a la fourniture des Services (stockage, affichage, traitement technique).</p>

            <h3 className="text-base font-semibold mt-4">7.3 Marques</h3>
            <p>Le nom "Scouty", le logo et les marques associees sont la propriete de l'Editeur. Toute utilisation, reproduction ou representation de ces marques sans autorisation prealable est interdite.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 8 — Disponibilite et maintenance</h2>
            <p>L'Editeur s'efforce d'assurer la disponibilite de la Plateforme 24 heures sur 24, 7 jours sur 7. Toutefois, l'Editeur se reserve le droit de suspendre temporairement l'acces a la Plateforme pour :</p>
            <ul>
              <li>Des operations de maintenance programmee (les Utilisateurs seront informes dans la mesure du possible)</li>
              <li>Des mises a jour de securite urgentes</li>
              <li>Des raisons techniques independantes de sa volonte</li>
            </ul>
            <p>L'Editeur ne saurait etre tenu responsable des interruptions temporaires du service, et aucune indemnite ne sera due a l'Utilisateur a ce titre, sauf stipulation contraire dans un accord de niveau de service (SLA) specifique.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 9 — Responsabilite de l'Editeur</h2>
            <p>L'Editeur fournit les Services en l'etat ("as is") et dans le cadre d'une obligation de moyens. L'Editeur ne garantit pas :</p>
            <ul>
              <li>Que les Services repondront a l'integralite des besoins specifiques de l'Utilisateur</li>
              <li>Que les Services seront exempts d'erreurs, de bugs ou d'interruptions</li>
              <li>L'exactitude ou l'exhaustivite des donnees provenant de sources tierces (enrichissement automatique, API-Football, etc.)</li>
            </ul>
            <p>En aucun cas l'Editeur ne pourra etre tenu responsable des dommages indirects, y compris mais sans s'y limiter : pertes de donnees, pertes de profits, pertes de chance, atteinte a l'image, dommages consecutifs a une decision prise sur la base des informations du service.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 10 — Suspension et resiliation du compte</h2>
            <h3 className="text-base font-semibold mt-4">10.1 Par l'Utilisateur</h3>
            <p>L'Utilisateur peut a tout moment demander la suppression de son Compte en contactant le support a l'adresse support@scouty.app. La suppression du Compte entraine la suppression definitive de l'ensemble du Contenu Utilisateur dans un delai de trente (30) jours.</p>

            <h3 className="text-base font-semibold mt-4">10.2 Par l'Editeur</h3>
            <p>L'Editeur se reserve le droit de suspendre ou de supprimer le Compte d'un Utilisateur, sans preavis ni indemnite, en cas de :</p>
            <ul>
              <li>Violation des presentes CGU</li>
              <li>Comportement portant atteinte a la securite de la Plateforme ou aux autres Utilisateurs</li>
              <li>Inactivite du Compte pendant une periode superieure a vingt-quatre (24) mois</li>
              <li>Utilisation frauduleuse ou abusive des Services</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 11 — Protection des donnees personnelles</h2>
            <p>L'Editeur traite les donnees personnelles de l'Utilisateur conformement au RGPD et a la loi Informatique et Libertes. Les details du traitement sont decrits dans notre <Link to="/privacy" className="text-primary hover:underline">Politique de confidentialite</Link>.</p>
            <p>L'Utilisateur dispose a tout moment d'un droit d'acces, de rectification, d'effacement, de portabilite et d'opposition concernant ses donnees personnelles, qu'il peut exercer en contactant support@scouty.app.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 12 — Liens hypertextes</h2>
            <p>La Plateforme peut contenir des liens vers des sites web tiers (Transfermarkt, API-Football, Cal.com, etc.). L'Editeur n'exerce aucun controle sur ces sites et decline toute responsabilite quant a leur contenu, leur disponibilite ou leurs pratiques en matiere de protection des donnees.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 13 — Modification des CGU</h2>
            <p>L'Editeur se reserve le droit de modifier les presentes CGU a tout moment. Les modifications seront portees a la connaissance des Utilisateurs par affichage sur la Plateforme et/ou par notification par email.</p>
            <p>Les CGU modifiees entrent en vigueur trente (30) jours apres leur publication. La poursuite de l'utilisation de la Plateforme apres cette date vaut acceptation des nouvelles CGU.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 14 — Droit applicable et litiges</h2>
            <p>Les presentes CGU sont regies par le droit francais.</p>
            <p>En cas de litige, les parties s'engagent a privilegier une resolution amiable. A defaut d'accord dans un delai de trente (30) jours, le litige sera porte devant les juridictions competentes du ressort du siege social de l'Editeur.</p>
            <p>Le Client consommateur peut egalement recourir a la mediation de la consommation conformement aux articles L.611-1 et suivants du Code de la consommation, ou saisir la plateforme de reglement en ligne des litiges de la Commission europeenne : <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://ec.europa.eu/consumers/odr</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 15 — Dispositions diverses</h2>
            <ul>
              <li><strong>Integralite</strong> : les presentes CGU, completees par les CGV et la Politique de confidentialite, constituent l'integralite de l'accord entre l'Utilisateur et l'Editeur.</li>
              <li><strong>Divisibilite</strong> : si une clause des presentes CGU est declaree nulle ou invalide, les autres clauses demeureront en vigueur.</li>
              <li><strong>Renonciation</strong> : le fait pour l'Editeur de ne pas exercer un droit prevu par les presentes CGU ne constitue pas une renonciation a ce droit.</li>
              <li><strong>Cession</strong> : l'Utilisateur ne peut ceder ses droits et obligations au titre des presentes CGU sans l'accord prealable ecrit de l'Editeur.</li>
              <li><strong>Force majeure</strong> : l'Editeur ne saurait etre tenu responsable de l'inexecution de ses obligations resultant d'un cas de force majeure au sens de l'article 1218 du Code civil.</li>
            </ul>
          </section>

          <section className="border-t border-border pt-6">
            <p className="text-xs text-muted-foreground">
              Pour toute question relative aux presentes CGU, contactez-nous a : <a href="mailto:support@scouty.app" className="text-primary hover:underline">support@scouty.app</a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
