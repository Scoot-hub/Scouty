# Scouty - CRM de Scouting Footballistique

Application web de gestion de scouting footballistique. Fiches joueurs, rapports, watchlists, shadow teams, enrichissement automatique, et outils collaboratifs.

## Stack technique

- **Frontend** : React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend** : Node.js, Express.js
- **Base de donnees** : MySQL / TiDB Cloud
- **Paiements** : Stripe (Embedded Checkout + Payment Links)
- **Emails** : Brevo (SMTP)
- **Reservation** : Cal.com / Cal.eu (embed)

## Installation

```bash
git clone <repo-url>
cd scouting-hub
npm install
```

## Variables d'environnement

Creer un fichier `.env` a la racine du projet avec les variables suivantes.

### Base de donnees (obligatoire)

**TiDB Cloud (production)** :

```env
TIDB_HOST=gateway01.xxx.tidbcloud.com
TIDB_USER=votre-user
TIDB_PASSWORD=votre-password
TIDB_DATABASE=scoutinghub
TIDB_PORT=4000
```

**MySQL local (developpement)** :

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=scoutinghub
DB_PORT=3306
```

Priorite de connexion : `DATABASE_URL` > `TIDB_*` > `DB_*`

### Serveur API

```env
API_PORT=3001                    # Port du serveur Express (defaut: 3001)
API_JWT_SECRET=votre-secret-jwt  # Secret JWT (CHANGER en production)
VITE_API_URL=/api                # URL de l'API cote client
VITE_API_PUBLIC_URL=             # URL publique (si differente)
```

### SMTP / Brevo (emails)

Utilise pour : reset mot de passe, 2FA par email, tickets support.

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=votre-login@smtp-brevo.com
SMTP_PASS=xsmtpsib-votre-cle-smtp
SMTP_FROM=noreply@scouty.app
REPORT_ISSUE_TO=support@scouty.app
```

> Creer un compte sur [brevo.com](https://www.brevo.com) > Parametres > SMTP & API > Copier login + generer cle SMTP.

### Stripe (paiements)

```env
STRIPE_SECRET_KEY=sk_test_...         # Cle secrete (backend)
VITE_STRIPE_PUBLIC_KEY=pk_test_...    # Cle publique (frontend)
STRIPE_WEBHOOK_SECRET=whsec_...       # Secret webhook

# Price IDs Stripe (creer dans Dashboard > Products)
STRIPE_PRICE_SCOUT_MONTHLY=price_xxx
STRIPE_PRICE_SCOUT_ANNUAL=price_xxx
STRIPE_PRICE_PRO_MONTHLY=price_xxx
STRIPE_PRICE_PRO_ANNUAL=price_xxx

# Payment Links (optionnel, alternative)
VITE_STRIPE_LINK_SCOUT_MONTHLY=https://buy.stripe.com/...
VITE_STRIPE_LINK_SCOUT_ANNUAL=https://buy.stripe.com/...
VITE_STRIPE_LINK_PRO_MONTHLY=https://buy.stripe.com/...
VITE_STRIPE_LINK_PRO_ANNUAL=https://buy.stripe.com/...
```

> Configuration webhook : Developers > Webhooks > Ajouter endpoint `https://votre-domaine/api/stripe/webhook`
> Events : `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

### Cal.com (reservation)

```env
VITE_CAL_USERNAME=votre-username
VITE_CAL_EVENT_SLUG=              # Optionnel (slug d'event specifique)
VITE_CAL_URL=https://www.cal.eu   # ou https://cal.com
```

### APIs externes (optionnel)

```env
RAPIDAPI_KEY=votre-cle            # API-Football via RapidAPI (matchs, classements)
THESPORTSDB_API_KEY=3             # TheSportsDB (3 = cle publique gratuite)
```

## Demarrage

### Developpement

```bash
npm run dev
```

Lance le frontend Vite (`http://localhost:5173`) + le backend Express (`http://localhost:3001`) en parallele.

### Production

```bash
npm run build     # Build frontend
npm run api       # Lancer le serveur (sert le build + API)
```

### Commandes

| Commande | Description |
|---|---|
| `npm run dev` | Frontend + Backend en parallele |
| `npm run dev:client` | Frontend Vite seul |
| `npm run api` | Backend Express seul |
| `npm run build` | Build de production |
| `npm run lint` | Lint ESLint |
| `npm run test` | Tests Vitest |
| `npm run preview` | Preview du build |

## Deploiement

### Vercel

1. Connecter le repo sur [vercel.com](https://vercel.com)
2. Ajouter **toutes** les variables d'environnement dans Settings > Environment Variables
3. Build command : `npm run build`
4. Output directory : `dist`

> Les variables `VITE_*` sont injectees au build et doivent etre presentes dans Vercel.

### VPS / PM2

```bash
git clone <repo> && cd scouting-hub
npm install
cp .env.example .env && nano .env
npm run build
pm2 start server/index.js --name scouty
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["node", "server/index.js"]
```

## Base de donnees

Le schema complet est dans `server/schema.sql`. Les migrations sont executees automatiquement au demarrage via `runMigrations()` dans `server/index.js`.

Pour un fresh install MySQL local :

```bash
mysql -u root -e "CREATE DATABASE scoutinghub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Les tables sont creees automatiquement au premier lancement du serveur.

## Structure

```
scouting-hub/
  server/
    index.js           # API Express (auth, CRUD, enrichissement, webhooks)
    schema.sql         # Schema DB complet
    db-config.js       # Config connexion DB (TiDB / MySQL)
  src/
    assets/            # Logo, images
    components/
      layout/          # AppLayout, AppSidebar, ProtectedRoute
      ui/              # Composants shadcn/ui + custom (ClubBadge, ClubLink...)
    contexts/          # AuthContext
    hooks/             # React Query hooks (players, notifications, clubs...)
    i18n/locales/      # Traductions FR, EN, ES
    integrations/      # Client API supabase-like
    lib/               # Utilitaires (TheSportsDB, scouting notes...)
    pages/             # Pages de l'application
    types/             # Types TypeScript (Player, Position, Opinion...)
  public/              # Favicon, manifest.json
  .env                 # Variables d'environnement (ne pas commiter)
```

## Fonctionnalites

| Categorie | Fonctionnalites |
|---|---|
| **Joueurs** | Fiches, enrichissement auto (Transfermarkt/TheSportsDB/Wikidata), import Excel, export Excel/PDF |
| **Scouting** | Rapports avec opinions, notes par zone, onglets historique + recherche perso (YouTube, articles) |
| **Listes** | Watchlists, shadow teams, effectif du club |
| **Decouverte** | Recherche par nom ou par club sur Transfermarkt (Premium) |
| **Clubs** | Fiches clubs, suivi de clubs, liens cliquables partout |
| **Matchs** | Calendrier, fixtures, mes matchs, API-Football / Livescore |
| **Organisation** | Multi-utilisateurs, roles, joueurs partages, feuille de route |
| **Abonnements** | 4 plans (Starter, Scout+, Pro, Elite), Stripe Checkout |
| **Securite** | 2FA email + app TOTP, RGPD (export/suppression), CGV/CGU |
| **Communication** | Notifications, tickets support, communaute (PRO) |
| **Autres** | Affiliation, reservation Cal.com, carte du monde, 3 themes, multilingue FR/EN/ES |
