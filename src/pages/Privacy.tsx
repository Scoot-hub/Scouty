import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.png';

export default function Privacy() {
  const { t } = useTranslation();

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
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Politique de Confidentialite</h1>
        <p className="text-muted-foreground mb-10">En vigueur au 1er avril 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-bold">Article 1 — Responsable du traitement</h2>
            <p>Le responsable du traitement des donnees personnelles collectees via la plateforme Scouty (scouty.app) est :</p>
            <ul>
              <li><strong>Scouty</strong>, service edite par la societe [Raison sociale a completer], [forme juridique], au capital de [montant] euros</li>
              <li>Immatriculee au RCS de [ville] sous le numero [numero]</li>
              <li>Siege social : [adresse]</li>
              <li>Email de contact : <a href="mailto:dpo@scouty.app" className="text-primary hover:underline">dpo@scouty.app</a></li>
            </ul>
            <p>L'Editeur agit en qualite de responsable de traitement pour les donnees des Utilisateurs (compte, profil, preferences) et en qualite de sous-traitant pour les donnees de joueurs saisies par l'Utilisateur.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 2 — Donnees collectees</h2>
            <h3 className="text-base font-semibold mt-4">2.1 Donnees fournies directement par l'Utilisateur</h3>
            <ul>
              <li><strong>Donnees d'identification</strong> : nom, prenom, adresse email</li>
              <li><strong>Donnees professionnelles</strong> : nom du club/organisation, role professionnel (scout, recruteur, coach, agent)</li>
              <li><strong>Donnees d'authentification</strong> : mot de passe (stocke sous forme de hash bcrypt, jamais en clair)</li>
              <li><strong>Donnees de scouting</strong> : fiches joueurs, rapports d'observation, notes, evaluations, watchlists, shadow teams</li>
              <li><strong>Donnees financieres</strong> : traitees exclusivement par Stripe (PCI-DSS) ; aucune donnee bancaire n'est stockee sur nos serveurs</li>
            </ul>

            <h3 className="text-base font-semibold mt-4">2.2 Donnees collectees automatiquement</h3>
            <ul>
              <li><strong>Donnees techniques</strong> : adresse IP, type et version du navigateur, systeme d'exploitation, resolution d'ecran</li>
              <li><strong>Donnees de connexion</strong> : date et heure de connexion, pages visitees, duree de session</li>
              <li><strong>Cookies strictement necessaires</strong> : session d'authentification, preferences de langue et de theme</li>
            </ul>

            <h3 className="text-base font-semibold mt-4">2.3 Donnees issues de l'enrichissement automatique</h3>
            <p>Pour les utilisateurs ayant active l'enrichissement, des donnees de joueurs (photo, valeur marchande, statistiques de carriere) sont collectees depuis des sources publiques (Transfermarkt, TheSportsDB, API-Football). Ces donnees sont stockees dans le compte de l'Utilisateur et sont soumises aux memes regles de confidentialite.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 3 — Finalites et bases legales du traitement</h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Finalite</th>
                  <th className="text-left py-2 font-semibold">Base legale</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">Creation et gestion de votre compte</td>
                  <td className="py-2">Execution du contrat (CGU)</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">Fourniture du service de scouting</td>
                  <td className="py-2">Execution du contrat</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">Traitement des paiements et facturation</td>
                  <td className="py-2">Execution du contrat</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">Envoi de notifications de service</td>
                  <td className="py-2">Interet legitime</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">Amelioration du service et correction de bugs</td>
                  <td className="py-2">Interet legitime</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">Analytics anonymes (Vercel Analytics)</td>
                  <td className="py-2">Interet legitime</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">Support technique et reponse aux tickets</td>
                  <td className="py-2">Execution du contrat</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">Securite et prevention des fraudes</td>
                  <td className="py-2">Obligation legale / Interet legitime</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 4 — Duree de conservation</h2>
            <ul>
              <li><strong>Donnees de compte</strong> : conservees pendant toute la duree de votre inscription. Supprimees dans un delai de 30 jours apres demande de suppression du compte.</li>
              <li><strong>Donnees de scouting</strong> : conservees pendant la duree de votre compte. Exportables a tout moment. Supprimees avec le compte.</li>
              <li><strong>Donnees de facturation</strong> : conservees 10 ans conformement aux obligations comptables et fiscales francaises (art. L.123-22 du Code de commerce).</li>
              <li><strong>Logs de connexion</strong> : conserves 12 mois conformement a la legislation applicable (LCEN).</li>
              <li><strong>Tokens de reinitialisation de mot de passe</strong> : expires et supprimes apres 1 heure.</li>
              <li><strong>Comptes inactifs</strong> : les comptes inactifs depuis plus de 24 mois peuvent etre supprimes apres notification par email.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 5 — Destinataires et sous-traitants</h2>
            <p>Vos donnees personnelles sont traitees par les sous-traitants suivants, dans le strict cadre de la fourniture du service :</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Sous-traitant</th>
                  <th className="text-left py-2 pr-4 font-semibold">Finalite</th>
                  <th className="text-left py-2 font-semibold">Localisation</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4 font-medium">TiDB Cloud (PingCAP)</td>
                  <td className="py-2 pr-4">Hebergement de la base de donnees</td>
                  <td className="py-2">UE (Francfort)</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4 font-medium">Vercel Inc.</td>
                  <td className="py-2 pr-4">Hebergement de l'application et analytics anonymes</td>
                  <td className="py-2">USA (clauses contractuelles types)</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4 font-medium">Stripe Inc.</td>
                  <td className="py-2 pr-4">Traitement des paiements</td>
                  <td className="py-2">USA (certifie PCI-DSS, clauses contractuelles types)</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4 font-medium">Nodemailer / SMTP</td>
                  <td className="py-2 pr-4">Envoi d'emails transactionnels</td>
                  <td className="py-2">UE</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4 font-medium">API-Football (RapidAPI)</td>
                  <td className="py-2 pr-4">Donnees de matchs et statistiques</td>
                  <td className="py-2">UE</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3">Aucune donnee personnelle n'est vendue ou louee a des tiers. Les donnees ne sont transmises qu'aux sous-traitants listes ci-dessus, dans le cadre de contrats conformes a l'article 28 du RGPD.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 6 — Transferts de donnees hors UE</h2>
            <p>Certains de nos sous-traitants (Vercel, Stripe) sont etablis aux Etats-Unis. Ces transferts sont encadres par :</p>
            <ul>
              <li>Les <strong>Clauses Contractuelles Types (CCT)</strong> adoptees par la Commission europeenne (Decision 2021/914)</li>
              <li>Les <strong>mesures supplementaires</strong> de securite technique (chiffrement, pseudonymisation)</li>
              <li>Pour Stripe : la conformite <strong>PCI-DSS</strong> et le <strong>Data Privacy Framework UE-USA</strong></li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 7 — Vos droits</h2>
            <p>Conformement au RGPD (articles 15 a 22) et a la loi Informatique et Libertes, vous disposez des droits suivants :</p>
            <ul>
              <li><strong>Droit d'acces</strong> (art. 15) : obtenir la confirmation que vos donnees sont traitees et en recevoir une copie</li>
              <li><strong>Droit de rectification</strong> (art. 16) : corriger des donnees inexactes ou incompletes</li>
              <li><strong>Droit a l'effacement / droit a l'oubli</strong> (art. 17) : demander la suppression de vos donnees. Exercable directement depuis votre <Link to="/account" className="text-primary hover:underline">page Compte</Link> (bouton "Supprimer mon compte")</li>
              <li><strong>Droit a la limitation</strong> (art. 18) : restreindre le traitement de vos donnees</li>
              <li><strong>Droit a la portabilite</strong> (art. 20) : recevoir vos donnees dans un format structure. Exercable depuis votre <Link to="/account" className="text-primary hover:underline">page Compte</Link> (bouton "Exporter mes donnees")</li>
              <li><strong>Droit d'opposition</strong> (art. 21) : vous opposer au traitement de vos donnees</li>
              <li><strong>Droit de retirer votre consentement</strong> (art. 7) : a tout moment, sans affecter la licite du traitement effectue avant le retrait</li>
              <li><strong>Droit de definir des directives post-mortem</strong> : concernant la conservation, l'effacement ou la communication de vos donnees apres votre deces</li>
            </ul>

            <h3 className="text-base font-semibold mt-4">Comment exercer vos droits</h3>
            <ul>
              <li><strong>En libre-service</strong> : depuis votre <Link to="/account" className="text-primary hover:underline">page Compte</Link> (export de donnees, suppression de compte)</li>
              <li><strong>Par email</strong> : <a href="mailto:dpo@scouty.app" className="text-primary hover:underline">dpo@scouty.app</a></li>
            </ul>
            <p>Nous nous engageons a repondre dans un delai de 30 jours. Une piece d'identite pourra etre demandee pour verifier votre identite.</p>

            <h3 className="text-base font-semibold mt-4">Reclamation aupres de la CNIL</h3>
            <p>Si vous estimez que vos droits ne sont pas respectes, vous pouvez introduire une reclamation aupres de la Commission Nationale de l'Informatique et des Libertes (CNIL) :</p>
            <ul>
              <li>En ligne : <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">www.cnil.fr/fr/plaintes</a></li>
              <li>Par courrier : CNIL, 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 8 — Cookies et traceurs</h2>
            <h3 className="text-base font-semibold mt-4">8.1 Cookies utilises</h3>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Cookie</th>
                  <th className="text-left py-2 pr-4 font-semibold">Finalite</th>
                  <th className="text-left py-2 pr-4 font-semibold">Duree</th>
                  <th className="text-left py-2 font-semibold">Type</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4 font-mono text-xs">scouthub_session</td>
                  <td className="py-2 pr-4">Authentification et maintien de connexion</td>
                  <td className="py-2 pr-4">Session</td>
                  <td className="py-2">Strictement necessaire</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4 font-mono text-xs">scouthub-lang</td>
                  <td className="py-2 pr-4">Preference de langue</td>
                  <td className="py-2 pr-4">Persistant</td>
                  <td className="py-2">Strictement necessaire</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4 font-mono text-xs">theme</td>
                  <td className="py-2 pr-4">Preference de theme (clair/sombre)</td>
                  <td className="py-2 pr-4">Persistant</td>
                  <td className="py-2">Strictement necessaire</td>
                </tr>
              </tbody>
            </table>

            <h3 className="text-base font-semibold mt-4">8.2 Ce que nous n'utilisons PAS</h3>
            <ul>
              <li>Aucun cookie publicitaire</li>
              <li>Aucun cookie de traçage tiers (Google Analytics, Facebook Pixel, etc.)</li>
              <li>Aucun outil de retargeting</li>
            </ul>

            <h3 className="text-base font-semibold mt-4">8.3 Analytics</h3>
            <p>Scouty utilise Vercel Analytics pour des metriques anonymes de performance (temps de chargement, erreurs). Cet outil ne depose aucun cookie et ne collecte aucune donnee personnelle identifiante.</p>

            <h3 className="text-base font-semibold mt-4">8.4 Base legale</h3>
            <p>Conformement a la directive ePrivacy (2002/58/CE) et aux lignes directrices de la CNIL, les cookies strictement necessaires au fonctionnement du service sont exemptes de consentement prealable. Scouty n'utilisant que des cookies strictement necessaires, aucun consentement prealable n'est requis.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 9 — Securite des donnees</h2>
            <p>Scouty met en oeuvre les mesures de securite suivantes, inspirees du referentiel ISO/IEC 27001 :</p>
            <ul>
              <li><strong>Chiffrement en transit</strong> : TLS 1.3 sur toutes les communications</li>
              <li><strong>Chiffrement au repos</strong> : AES-256 sur les donnees stockees</li>
              <li><strong>Hachage des mots de passe</strong> : algorithme bcrypt avec sel unique</li>
              <li><strong>Isolation des donnees</strong> : chaque utilisateur ne peut acceder qu'a ses propres donnees (Row Level Security)</li>
              <li><strong>Authentification renforcee</strong> : support 2FA (TOTP et email)</li>
              <li><strong>Sauvegardes</strong> : sauvegardes automatiques quotidiennes de la base de donnees</li>
              <li><strong>Surveillance</strong> : journalisation des acces et monitoring des anomalies</li>
              <li><strong>Mises a jour</strong> : application reguliere des correctifs de securite</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 10 — Violation de donnees</h2>
            <p>En cas de violation de donnees a caractere personnel :</p>
            <ul>
              <li>L'Editeur notifie la <strong>CNIL</strong> dans un delai de <strong>72 heures</strong> conformement a l'article 33 du RGPD</li>
              <li>Les utilisateurs concernes sont informes <strong>dans les meilleurs delais</strong> si la violation est susceptible d'engendrer un risque eleve pour leurs droits et libertes (article 34 du RGPD)</li>
              <li>Les mesures correctives sont deployees immediatement et documentees</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 11 — Donnees des mineurs</h2>
            <p>La Plateforme est destinee a un usage professionnel. L'inscription est reservee aux personnes agees de 16 ans minimum. Si nous apprenons que des donnees d'un mineur de moins de 16 ans ont ete collectees sans le consentement parental requis, nous les supprimerons dans les plus brefs delais.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 12 — Modification de la politique</h2>
            <p>La presente politique peut etre modifiee a tout moment. Toute modification substantielle sera notifiee par email et/ou par notification sur la plateforme au moins 30 jours avant son entree en vigueur.</p>
            <p>La date de derniere mise a jour est indiquee en haut de cette page.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 13 — Contact</h2>
            <p>Pour toute question relative a la protection de vos donnees personnelles :</p>
            <ul>
              <li>Delegue a la protection des donnees (DPO) : <a href="mailto:dpo@scouty.app" className="text-primary hover:underline">dpo@scouty.app</a></li>
              <li>Support general : <a href="mailto:support@scouty.app" className="text-primary hover:underline">support@scouty.app</a></li>
            </ul>
          </section>

          <section className="border-t border-border pt-6">
            <p className="text-xs text-muted-foreground">
              Cette politique de confidentialite est consultable a tout moment sur <a href="/privacy" className="text-primary hover:underline">scouty.app/privacy</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
