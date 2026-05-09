# Scouty — Suivi des fonctionnalités

> Document de suivi produit — non technique, destiné à un usage interne.  
> Mis à jour : mai 2026

---

## 🗂️ Sommaire

1. [Compte & Authentification](#1-compte--authentification)
2. [Joueurs](#2-joueurs)
3. [Enrichissement des données joueurs](#3-enrichissement-des-données-joueurs)
4. [Listes & Équipes types](#4-listes--équipes-types)
5. [Matchs & Calendrier](#5-matchs--calendrier)
6. [Championnats & Ligues](#6-championnats--ligues)
7. [Clubs](#7-clubs)
8. [Organisations & Collaboration](#8-organisations--collaboration)
9. [Discussion (chat interne)](#9-discussion-chat-interne)
10. [Feuille de route (Roadmap)](#10-feuille-de-route-roadmap)
11. [Communauté](#11-communauté)
12. [Actualités & Contenus](#12-actualités--contenus)
13. [Carte du monde](#13-carte-du-monde)
14. [Contacts](#14-contacts)
15. [Notifications](#15-notifications)
16. [Paramètres utilisateur](#16-paramètres-utilisateur)
17. [Abonnements & Crédits](#17-abonnements--crédits)
18. [Administration](#18-administration)
19. [Légal & Conformité](#19-légal--conformité)
20. [Intégrations externes](#20-intégrations-externes)

---

## 1. Compte & Authentification

### Inscription & Connexion
- Inscription par email et mot de passe
- **Connexion via Google** (OAuth — un clic, sans mot de passe)
- Réinitialisation du mot de passe par email
- Page de connexion dédiée

### Sécurité renforcée
- **Double authentification (2FA)** : via application d'authentification (code TOTP) ou via email
- Activation/désactivation de la 2FA depuis les paramètres
- Déconnexion automatique après inactivité prolongée (configurable)
- Détection et limitation des créations de comptes multiples depuis la même IP
- Système de bannissement des comptes (admin)

### Session
- Connexion persistante (token sécurisé)
- Déconnexion manuelle depuis la sidebar

---

## 2. Joueurs

### Fiche joueur
- Création manuelle d'une fiche joueur (nom, date de naissance, nationalité, poste, club, ligue, pied, etc.)
- Modification complète des informations à tout moment
- Photo de profil uploadable
- Statut d'opinion générale : À suivre / À revoir / Défavorable
- Indicateur de complétion de la fiche (% de champs remplis)
- Archivage / désarchivage (le joueur reste en base mais n'est plus visible dans la liste principale)

### Liste des joueurs
- Affichage en grille ou tableau
- Recherche par nom
- Filtres avancés : poste, ligue, club, nationalité, tranche d'âge, opinion, potentiel, pied
- Tri par nom, âge, niveau, potentiel, date de modification, fin de contrat
- Export de la liste en fichier Excel/CSV

### Rapports de scouting
- Ajout de rapports détaillés sur un joueur (observations, recommandations)
- Consultation de l'historique des rapports par joueur
- Plusieurs scouts peuvent ajouter des rapports sur le même joueur

### Tâches de suivi
- Attribution d'une tâche de suivi à un joueur (rappel de visionnage, relance agent, etc.)
- Visualisation des tâches en attente

### Comparaison de joueurs
- Sélection de 2 à 4 joueurs pour une comparaison côte à côte (radar)
- Visualisation des forces/faiblesses relatives
- Action payante en crédits (limitée par quota d'abonnement)

### Détection de doublons
- Détection automatique de joueurs probablement dupliqués dans la base
- Action payante en crédits

---

## 3. Enrichissement des données joueurs

> L'enrichissement consiste à compléter automatiquement la fiche d'un joueur en allant chercher ses données sur des sources externes.

### Sources d'enrichissement
- **Transfermarkt** : valeur marchande, clubs précédents, contrat, informations bio, historique de carrière
- **Wikidata** : données biographiques complémentaires
- **API-Football** : statistiques de saison (buts, passes, notes, minutes jouées, etc.)

### Fonctionnement
- Enrichissement joueur par joueur (bouton sur la fiche)
- **Enrichissement en masse** (tous les joueurs d'un coup, en arrière-plan)
- L'enrichissement consomme des **crédits** (quota journalier/hebdo/mensuel selon l'abonnement)
- Un voyant indique si un joueur a déjà été enrichi et quand
- Les joueurs non enrichis ou peu enrichis apparaissent en priorité dans la liste

### Crédits d'enrichissement
- Plan Starter : 10/jour, 50/semaine, 150/mois
- Plan Pro : 100/jour, 500/semaine, 2 000/mois
- Plan Elite : illimité
- Une pop-up s'affiche quand le quota est atteint, avec l'invitation à changer de plan

### Import de masse
- **Import CSV/XLSX** avec un format structuré : importe des dizaines ou centaines de joueurs en une seule opération
- **Import Wyscout** : import des données statistiques depuis un export Wyscout (format spécial reconnu automatiquement)
- L'import détecte les doublons potentiels et propose une résolution

---

## 4. Listes & Équipes types

### Liste de suivi (Watchlist)
- Création de plusieurs listes thématiques (ex : "Latéraux gauches U21", "Pistes mercato janvier")
- Ajout de joueurs depuis la liste principale ou leur fiche
- Partage d'une watchlist avec les membres de l'organisation

### Équipe type (Shadow Team)
- Construction d'une équipe fictive en plaçant des joueurs sur un schéma tactique
- Plusieurs formations disponibles
- Sauvegarde et gestion de plusieurs équipes types
- Export de l'équipe type en image

---

## 5. Matchs & Calendrier

### Live & Calendrier des matchs
- Affichage des matchs en direct et à venir (toutes compétitions mondiales)
- Navigation par date (hier, aujourd'hui, demain, n'importe quelle date)
- **La date sélectionnée est mémorisée** lors de la navigation entre pages (remise à zéro uniquement à la déconnexion)
- Sélecteur de fuseau horaire pour afficher les horaires en heure locale
- Recherche par équipe ou compétition
- Filtrage par compétition

### Fiche match
- Score final et score à la mi-temps
- Stade et arbitre
- **Événements** : buts (avec distinction but contre son camp ⚽ OG), cartons jaunes/rouges, remplacements, VAR
- Avertissement automatique si le nombre de buts dans les événements ne correspond pas au score (données incomplètes)
- **Statistiques** : possession, tirs, corners, fautes, hors-jeu, arrêts — avec mention "données approximatives"
- **xG (Expected Goals)** via FotMob (source gratuite) — affiché comme ligne spéciale dans les stats
- **Forme récente** de chaque équipe (5 derniers matchs, badges W/D/L) via football-data.org
- **Confrontations directes** (H2H — 5 derniers matchs entre les deux équipes) via football-data.org
- **Composition** : titulaires et remplaçants avec numéros et postes
- **Onglet Vidéos** : highlights et résumés du match via ScoreBat (source gratuite)

### Mes matchs
- Sauvegarde d'un match dans une liste personnelle pour y revenir
- Attribution d'un match à un membre de l'organisation (ex : "Tu scoutes ce match")
- Liste de tous ses matchs sauvegardés avec accès rapide

---

## 6. Championnats & Ligues

### Gestion des championnats
- Liste de tous les championnats du monde
- Recherche par nom ou **par pays** (filtre dédié avec drapeau)
- Ajout de championnats personnalisés

### Fiche championnat
- **Classement** : tableau complet avec points, victoires, nuls, défaites, différence de buts, zones colorées (qualification, relégation)
- Classement mis en cache en base de données : les saisons historiques sont permanentes, la saison en cours se rafraîchit toutes les 24h
- **Joueurs rattachés** : liste des joueurs de la base qui jouent dans ce championnat
- **Notes de scouting** du championnat : texte libre + note sur 5 étoiles, sauvegardées par utilisateur en base de données
- **Mes championnats** : liste personnelle des ligues bookmarkées

---

## 7. Clubs

### Recherche et profil de club
- Recherche de club mondial (Transfermarkt + TheSportsDB)
- Fiche club : logo, pays, stade, staff technique, effectif actuel
- Historique de saison du club (Transfermarkt)
- Matchs récents et prochains du club
- Articles de presse liés au club

### Suivi des clubs
- Ajout d'un club à sa liste de clubs suivis
- Accès rapide à tous les clubs suivis ("Mes clubs")
- Logos des clubs stockés en base de données

### Notes de scouting sur les clubs
- Texte libre + note sur 5 étoiles par utilisateur sur chaque club
- **Sauvegardées en base de données** — retrouvées à chaque visite (correctif appliqué)
- Visibles par les autres membres de l'organisation

---

## 8. Organisations & Collaboration

### Création et gestion
- Création d'une organisation (club, agence, groupe de scouts, autre)
- Logo de l'organisation (uploadable)
- Description de l'organisation
- Lien d'invitation pour rejoindre l'organisation
- Possibilité de rejoindre via un code d'invitation

### Membres et rôles
- Rôles : Propriétaire, Admin, Membre
- Promotion / rétrogradation des membres
- Retrait d'un membre
- Profil de chaque membre visible (réseaux sociaux si rendus publics)
- Quitter une organisation

### Joueurs partagés
- Partage de joueurs de sa propre liste vers l'organisation
- Vue dédiée des joueurs de l'organisation (visible par tous les membres)

### Effectif de l'organisation
- Gestion d'un effectif officiel de l'organisation
- Statuts des joueurs : Actif, Prêté, Blessé, Espoir, etc.
- Suivi de contrat (fin de contrat, mois restants)
- Téléchargement de l'effectif en fichier Excel

---

## 9. Discussion (chat interne)

> Onglet "Discussion" disponible dans chaque organisation.

- Messagerie en temps réel entre membres de l'organisation
- Format bulle de conversation (style messagerie moderne)
- **Réactions emoji** sur les messages (👍 ❤️ 😂 😮 😢 🔥)
- **Réponse à un message** spécifique (thread simplifié) — impossible de répondre à son propre message
- **Modification** d'un message (dans les 10 minutes suivant l'envoi)
- **Suppression** d'un message (dans les 10 minutes)
- **Indicateur de lecture** : badge rouge avec le nombre de messages non lus dans l'onglet et le menu latéral
- **Barre "Nouveaux messages"** qui s'affiche à la hauteur du premier message non lu
- **Bouton de défilement** vers les nouveaux messages ou vers le bas
- **Indicateur "X est en train d'écrire…"** en temps réel
- **Limite anti-spam** : 1 message par minute par utilisateur
- **Modération automatique** des mots interdits (liste interne, refus à l'envoi)
- Limite de 512 caractères par message
- **Notification ciblée** à l'auteur d'un message quand on lui répond
- Chargement des messages anciens (pagination au scroll vers le haut)
- Rafraîchissement automatique toutes les 5 secondes

---

## 10. Feuille de route (Roadmap)

- Gestion des tâches et projets au sein de l'organisation
- Création, modification, suppression de tâches
- Attribution à des membres de l'organisation
- Statuts et priorités

---

## 11. Communauté

- Forum interne à la plateforme
- Création de posts par catégorie (question, suggestion, match, joueur, général)
- Réponses et fils de discussion
- Système de likes
- Mentions d'utilisateurs (@pseudo)
- Épinglage de posts (modérateurs)
- Fermeture / réouverture de posts
- Modération : suppression de posts et réponses

---

## 12. Actualités & Contenus

### Football Buzz
- Agrégation des actualités football depuis plusieurs sources
- Navigation par article
- Liens vers les sources originales

### X (anciennement Twitter)
- Intégration d'un fil de tweets football dans l'application

### Instagram
- Redirections vers les comptes Instagram clubs/joueurs

### Éditorial (articles internes)
- Création d'articles éditoriaux par les membres autorisés
- Statuts : Brouillon / Publié
- Partage d'article via lien public (sans connexion nécessaire)
- Réactions sur les articles
- Compteur de vues

---

## 13. Carte du monde

- Visualisation géographique des joueurs de la base sur une carte mondiale
- Filtrage des joueurs affiché sur la carte
- Clic sur un point pour voir les infos du joueur
- Drapeaux de nationalité dans les filtres

---

## 14. Contacts

- Carnet de contacts : agents, directeurs sportifs, entraîneurs, etc.
- Informations : nom, rôle, organisation, téléphone, email, LinkedIn
- Notes et suivi sur chaque contact
- Partage de contacts avec l'organisation
- Recherche et filtrage des contacts

---

## 15. Notifications

- Centre de notifications accessible depuis la sidebar
- Types de notifications : message reçu, réponse à un message, match assigné, invitation organisation, article publié, etc.
- Badge de nombre de notifications non lues
- Marquer comme lu (individuel ou tout marquer)
- Suppression de notifications
- **Préférences de notifications** (par type, email ou in-app) dans les paramètres

---

## 16. Paramètres utilisateur

### Onglet Préférences
- Langue de l'interface (Français, Anglais, Espagnol)
- Thème : clair / sombre
- Autres préférences d'affichage

### Onglet Notifications
- Activation/désactivation par type de notification (match assigné, invitation organisation, communauté, résumé hebdo)
- Choix du canal : notification in-app ou email

### Onglet Champs personnalisés
- Ajout de champs supplémentaires sur les fiches joueur (ex : "Agent", "Vidéo test 1", "Priorité")
- Ces champs sont propres à chaque organisation

### Onglet Intégrations
- Configuration des connexions avec des services externes
- Statut des intégrations actives

### Mon compte
- Modification du nom, prénom, photo
- Changement de mot de passe
- Activation/désactivation de la double authentification
- Export de toutes ses données (GDPR)
- Suppression du compte

---

## 17. Abonnements & Crédits

### Plans d'abonnement
| Plan | Prix | Usage |
|------|------|-------|
| Starter | Gratuit | Accès limité, quotas réduits |
| Pro | Payant | Accès élargi, quotas augmentés |
| Elite | Payant | Accès complet, quotas illimités |

### Paiement
- Gestion des abonnements via **Stripe** (paiement sécurisé)
- Cycle mensuel ou annuel
- Page de confirmation après souscription

### Crédits d'enrichissement
- Les actions suivantes consomment des crédits : enrichissement joueur, enrichissement en masse, comparaison, détection de doublons
- Quotas journalier / hebdomadaire / mensuel selon le plan
- Pop-up d'information quand le quota est atteint (avec lien vers la mise à niveau)
- Historique de consommation visible dans l'espace admin

### Affiliation
- Programme d'affiliation avec liens de parrainage
- Suivi des parrainages et commissions

---

## 18. Administration

> Accessible uniquement aux administrateurs de la plateforme.

### Gestion des utilisateurs
- Liste complète des utilisateurs inscrits
- Passage en premium / retrait du premium
- Bannissement de comptes avec motif
- Réinitialisation de mot de passe
- Impersonation (se connecter en tant qu'un utilisateur pour le support)
- Export des données utilisateurs

### Rôles & Permissions
- Système de rôles personnalisés (ex : "Scout senior", "Recruteur", "Analyste")
- Permissions granulaires par page et par action (voir, créer, modifier, supprimer, exporter, enrichir)
- Attribution de plusieurs rôles à un même utilisateur (les droits s'additionnent)
- Les pages sans accès sont grisées dans la sidebar avec info-bulle indiquant le rôle requis

### Analytics & Monitoring
- Tableau de bord analytique : inscriptions, connexions, actions, abonnements
- Métriques d'utilisation par fonctionnalité

### Support & Tickets
- Système de tickets de support côté admin
- Réponse aux tickets par email ou in-app
- Statuts : ouvert, en cours, résolu

### Notifications admin
- Création et envoi de notifications globales à tous les utilisateurs ou à des groupes

### Gestion des crédits
- Consultation de la consommation de crédits par utilisateur
- Ajustement manuel des quotas

### Crons (tâches automatiques)
- Gestion des tâches planifiées : enrichissement automatique, nettoyage du cache, etc.
- Logs d'exécution par tâche

### Paramètres système
- Configuration des fonctionnalités (feature flags : activer/désactiver des fonctions)
- Test d'envoi d'email depuis l'interface
- Gestion des données de clubs (logos, informations, doublons)
- Paramètres de scraping des données externes

---

## 19. Légal & Conformité

- Page Conditions Générales d'Utilisation (CGU)
- Page Conditions Générales de Vente (CGV)
- Page Politique de confidentialité
- Page Politique de cookies
- Page Accessibilité
- Bannière de consentement cookies (obligatoire RGPD)
- Export des données personnelles (RGPD) depuis les paramètres
- Suppression du compte et de toutes les données

---

## 20. Intégrations externes

| Service | Usage dans l'app | Coût |
|---------|-----------------|------|
| **Transfermarkt** | Valeur marchande, carrière, clubs, historique joueurs | Gratuit (scraping) |
| **TheSportsDB** | Profils clubs, effectifs, stades, staff | Gratuit |
| **API-Football** | Matchs en direct, statistiques, compositions | Freemium |
| **Wikidata** | Données biographiques joueurs | Gratuit |
| **ESPN** | Classements de championnats | Gratuit |
| **StatsBomb** | Analyse avancée de matchs (xG, heatmaps, passes) | Selon accord |
| **ScoreBat** | Vidéos et highlights de matchs | Gratuit |
| **FotMob** | xG (Expected Goals) par match | Gratuit (non officiel) |
| **football-data.org** | Forme des 5 derniers matchs, confrontations directes (H2H) | Gratuit (clé requise) |
| **Wyscout** | Import de données statistiques joueurs | Via export Wyscout |
| **Google** | Authentification OAuth | Gratuit |
| **Stripe** | Paiement abonnements | Commission par transaction |
| **Brevo (Sendinblue)** | Envoi d'emails transactionnels | Freemium |

---

## 📋 Fonctionnalités transversales

- **Multi-langue** : interface disponible en Français, Anglais, Espagnol
- **Thème clair / sombre** : bascule disponible en un clic
- **Mobile-friendly** : l'app s'adapte aux smartphones, avec support de l'affichage plein-écran sur iPhone (Dynamic Island, barre d'accueil)
- **Pages sécurisées** : les pages inaccessibles selon le rôle sont grisées avec explication
- **Aide en ligne** : chatbot/widget d'aide accessible depuis toutes les pages
- **Page "À propos"** : formulaire de contact et de demande de démonstration

---

*Ce document est mis à jour manuellement lors de chaque développement significatif.*
