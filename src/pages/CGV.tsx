import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.png';

export default function CGV() {
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
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Conditions Generales de Vente</h1>
        <p className="text-muted-foreground mb-10">En vigueur au 1er avril 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold">Article 1 — Objet</h2>
            <p>Les presentes Conditions Generales de Vente (ci-apres "CGV") regissent les relations contractuelles entre :</p>
            <ul>
              <li><strong>Scouty</strong>, service edite par la societe [Raison sociale a completer], [forme juridique], au capital de [montant] euros, immatriculee au RCS de [ville] sous le numero [numero], dont le siege social est situe [adresse] (ci-apres "l'Editeur"),</li>
              <li>et toute personne physique ou morale souscrivant a un abonnement payant sur la plateforme Scouty (ci-apres "le Client").</li>
            </ul>
            <p>Les CGV s'appliquent a toute souscription d'abonnement effectuee via le site scouty.app, sans prejudice des conditions particulieres qui pourraient etre convenues par ecrit entre les parties.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 2 — Description des services</h2>
            <p>Scouty est une application web de gestion de scouting footballistique (CRM sportif) permettant notamment :</p>
            <ul>
              <li>La creation et la gestion de fiches joueurs enrichies (donnees biographiques, performances, evaluations, rapports)</li>
              <li>L'organisation de watchlists, shadow teams et calendriers de missions</li>
              <li>L'enrichissement automatique des donnees joueurs via des bases de donnees partenaires</li>
              <li>L'export de donnees aux formats PDF et Excel</li>
              <li>La gestion collaborative au sein d'organisations (plans Elite)</li>
              <li>L'integration de donnees API-Football (matchs, classements, statistiques)</li>
            </ul>
            <p>Le detail des fonctionnalites accessibles depend du plan souscrit par le Client (Starter, Scout+, Pro ou Elite), tel que decrit sur la page Tarifs du site.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 3 — Tarifs et modalites de paiement</h2>
            <h3 className="text-base font-semibold mt-4">3.1 Grille tarifaire</h3>
            <p>Les tarifs en vigueur sont les suivants :</p>
            <ul>
              <li><strong>Starter</strong> : gratuit, sans limitation de duree</li>
              <li><strong>Scout+</strong> : 19 EUR/mois ou 190 EUR/an (soit environ 15,83 EUR/mois)</li>
              <li><strong>Pro</strong> : 29 EUR/mois ou 290 EUR/an (soit environ 24,17 EUR/mois)</li>
              <li><strong>Elite</strong> : 99 EUR/mois + 29 EUR/mois par utilisateur supplementaire (tarification annuelle disponible sur devis)</li>
            </ul>
            <p>Les prix sont indiques en euros, toutes taxes comprises (TTC). L'Editeur se reserve le droit de modifier ses tarifs a tout moment. Toute modification tarifaire sera notifiee au Client par email au moins trente (30) jours avant son entree en vigueur et ne s'appliquera qu'au prochain renouvellement de l'abonnement.</p>

            <h3 className="text-base font-semibold mt-4">3.2 Moyens de paiement</h3>
            <p>Le paiement est effectue par carte bancaire via la plateforme de paiement securisee Stripe. Le Client garantit qu'il est titulaire de la carte bancaire utilisee et que celle-ci dispose des fonds suffisants pour couvrir le paiement. L'Editeur ne conserve aucune donnee bancaire du Client ; celles-ci sont traitees exclusivement par Stripe conformement aux normes PCI-DSS.</p>

            <h3 className="text-base font-semibold mt-4">3.3 Facturation</h3>
            <p>Le Client recoit une facture electronique a chaque echeance de paiement, transmise a l'adresse email associee a son compte. Les factures sont egalement accessibles depuis l'espace de gestion Stripe du Client.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 4 — Duree et renouvellement</h2>
            <p>L'abonnement prend effet a la date de souscription et est conclu pour une duree d'un (1) mois ou d'un (1) an selon l'option choisie par le Client.</p>
            <p>L'abonnement est reconduit tacitement a chaque echeance pour une duree identique, sauf resiliation par le Client dans les conditions prevues a l'article 5.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 5 — Resiliation</h2>
            <h3 className="text-base font-semibold mt-4">5.1 Resiliation par le Client</h3>
            <p>Le Client peut resilier son abonnement a tout moment depuis son espace personnel (rubrique "Gerer l'abonnement") ou en contactant le support a l'adresse support@scouty.app.</p>
            <p>La resiliation prend effet a la fin de la periode d'abonnement en cours. Le Client conserve l'acces aux fonctionnalites de son plan jusqu'a cette date. Aucun remboursement au prorata n'est effectue pour la periode restante.</p>

            <h3 className="text-base font-semibold mt-4">5.2 Resiliation par l'Editeur</h3>
            <p>L'Editeur se reserve le droit de resilier l'abonnement d'un Client en cas de :</p>
            <ul>
              <li>Non-paiement apres deux (2) tentatives de prelevement infructueuses</li>
              <li>Violation des Conditions Generales d'Utilisation (CGU)</li>
              <li>Usage frauduleux ou abusif du service</li>
              <li>Atteinte aux droits de tiers ou a la securite de la plateforme</li>
            </ul>
            <p>En cas de resiliation pour faute du Client, aucun remboursement ne sera effectue.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 6 — Droit de retractation</h2>
            <p>Conformement aux articles L.221-18 et suivants du Code de la consommation, le Client consommateur dispose d'un delai de quatorze (14) jours a compter de la souscription pour exercer son droit de retractation, sans avoir a justifier de motif ni a supporter de penalites.</p>
            <p>Toutefois, si le Client a expressement demande le debut d'execution du service avant l'expiration du delai de retractation (en utilisant le service), le Client reconnait perdre son droit de retractation conformement a l'article L.221-28 du Code de la consommation.</p>
            <p>Pour exercer ce droit, le Client doit adresser sa demande par email a : support@scouty.app. Le remboursement sera effectue dans un delai de quatorze (14) jours suivant la reception de la demande, par le meme moyen de paiement que celui utilise lors de la souscription.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 7 — Disponibilite du service</h2>
            <p>L'Editeur s'engage a mettre en oeuvre tous les moyens raisonnables pour assurer la disponibilite du service 24 heures sur 24, 7 jours sur 7, sous reserve des periodes de maintenance programmee ou d'urgence.</p>
            <p>L'Editeur ne saurait etre tenu responsable des interruptions de service resultant de :</p>
            <ul>
              <li>Operations de maintenance necessaires au bon fonctionnement de la plateforme</li>
              <li>Defaillance des reseaux de telecommunication ou des fournisseurs d'hebergement</li>
              <li>Cas de force majeure au sens de l'article 1218 du Code civil</li>
            </ul>
            <p>Pour les abonnements Elite, un accord de niveau de service (SLA) specifique peut etre negocie entre les parties.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 8 — Responsabilite</h2>
            <p>L'Editeur s'engage a fournir le service avec diligence et dans les regles de l'art, conformement a une obligation de moyens.</p>
            <p>La responsabilite de l'Editeur est limitee aux dommages directs et previsibles resultant d'un manquement prouve a ses obligations. En tout etat de cause, la responsabilite totale de l'Editeur ne saurait exceder le montant des sommes effectivement versees par le Client au cours des douze (12) derniers mois precedant le fait generateur du dommage.</p>
            <p>L'Editeur ne saurait etre tenu responsable :</p>
            <ul>
              <li>Des donnees saisies par le Client (exactitude, legalite, pertinence)</li>
              <li>Des decisions prises par le Client sur la base des informations fournies par le service</li>
              <li>De l'utilisation du service par des tiers ayant obtenu les identifiants du Client</li>
              <li>Des dommages indirects tels que perte de chance, perte de donnees, prejudice commercial</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 9 — Propriete intellectuelle</h2>
            <p>L'ensemble des elements composant la plateforme Scouty (code source, algorithmes, interface graphique, textes, logos, bases de donnees) sont proteges par les lois relatives a la propriete intellectuelle et demeurent la propriete exclusive de l'Editeur.</p>
            <p>L'abonnement confere au Client un droit d'utilisation personnel, non exclusif, non cessible et non sous-licenciable du service, pour la duree de l'abonnement.</p>
            <p>Le Client conserve l'integralite des droits de propriete intellectuelle sur les donnees qu'il saisit dans la plateforme.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 10 — Donnees personnelles</h2>
            <p>Le traitement des donnees personnelles du Client est regi par notre <Link to="/privacy" className="text-primary hover:underline">Politique de confidentialite</Link>, qui constitue une annexe aux presentes CGV.</p>
            <p>L'Editeur agit en qualite de sous-traitant au sens du RGPD pour les donnees de joueurs saisies par le Client. Le Client demeure responsable de traitement pour ces donnees et s'engage a les collecter et traiter dans le respect de la reglementation applicable.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 11 — Portabilite des donnees</h2>
            <p>Le Client peut a tout moment exporter l'integralite de ses donnees via les fonctionnalites d'export intergrees a la plateforme (formats Excel, PDF).</p>
            <p>En cas de resiliation ou de fermeture de compte, le Client dispose d'un delai de trente (30) jours pour exporter ses donnees. Passe ce delai, les donnees seront definitivement supprimees.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 12 — Modification des CGV</h2>
            <p>L'Editeur se reserve le droit de modifier les presentes CGV a tout moment. Les modifications entreront en vigueur trente (30) jours apres leur notification au Client par email ou par affichage sur la plateforme.</p>
            <p>La poursuite de l'utilisation du service apres l'entree en vigueur des modifications vaut acceptation des nouvelles CGV. En cas de desaccord, le Client pourra resilier son abonnement dans les conditions prevues a l'article 5.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 13 — Droit applicable et juridiction competente</h2>
            <p>Les presentes CGV sont soumises au droit francais.</p>
            <p>En cas de litige relatif a l'interpretation ou a l'execution des presentes CGV, les parties s'engagent a rechercher une solution amiable. A defaut d'accord amiable dans un delai de trente (30) jours, le litige sera soumis aux tribunaux competents du ressort du siege social de l'Editeur.</p>
            <p>Conformement aux articles L.616-1 et R.616-1 du Code de la consommation, le Client consommateur peut recourir gratuitement au service de mediation de la consommation. Le mediateur peut etre saisi en ligne via la plateforme europeenne de reglement en ligne des litiges : <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://ec.europa.eu/consumers/odr</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold">Article 14 — Dispositions generales</h2>
            <p>Si l'une quelconque des dispositions des presentes CGV etait declaree nulle ou inapplicable, les autres dispositions demeureront en vigueur.</p>
            <p>Le fait pour l'Editeur de ne pas se prevaloir d'un manquement du Client a l'une quelconque des obligations visees aux presentes ne saurait etre interprete comme une renonciation a l'obligation en cause.</p>
          </section>

          <section className="border-t border-border pt-6">
            <p className="text-xs text-muted-foreground">
              Pour toute question relative aux presentes CGV, contactez-nous a : <a href="mailto:support@scouty.app" className="text-primary hover:underline">support@scouty.app</a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
