import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageCircle, X, Send, Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: number;
  role: 'bot' | 'user';
  text: string;
  links?: { label: string; path: string }[];
}

// ---------------------------------------------------------------------------
// KNOWLEDGE BASE
// ---------------------------------------------------------------------------

interface RouteEntry { keywords: string[]; path: string }
interface HelpEntry { keywords: string[]; answer: string }

const ROUTE_MAP: Record<string, RouteEntry> = {
  // Core pages
  players:        { keywords: ['joueur', 'joueurs', 'player', 'players', 'liste', 'list', 'base', 'catalogue', 'talent', 'talents', 'jugador', 'jugadores', 'effectif', 'roster'], path: '/players' },
  addPlayer:      { keywords: ['ajouter joueur', 'nouveau joueur', 'creer joueur', 'add player', 'new player', 'create player', 'nuevo jugador', 'crear jugador', 'ajouter un joueur'], path: '/player/new' },
  watchlist:      { keywords: ['watchlist', 'watch list', 'surveiller', 'suivi', 'observation', 'favoris', 'shortlist', 'liste de suivi'], path: '/watchlist' },
  shadowTeam:     { keywords: ['shadow', 'equipe type', 'shadow team', 'composition', 'onze', 'xi', 'formation', 'lineup', 'meilleur onze', 'best xi'], path: '/shadow-team' },

  // Matches & calendar
  fixtures:       { keywords: ['match', 'matches', 'fixture', 'fixtures', 'calendrier', 'calendar', 'rencontre', 'partido', 'programme', 'schedule'], path: '/fixtures' },
  myMatches:      { keywords: ['mes match', 'my match', 'mes rencontres', 'missions', 'deplacement', 'mes missions', 'planning', 'mission scouting', 'planifie'], path: '/my-matches' },

  // Network
  contacts:       { keywords: ['contact', 'contacts', 'agent', 'agents', 'reseau', 'network', 'annuaire', 'intermediaire', 'directeur sportif', 'carnet d\'adresse'], path: '/contacts' },

  // Organization
  organization:   { keywords: ['organisation', 'organization', 'club', 'equipe', 'team', 'org', 'estructura', 'structure', 'membre', 'members', 'inviter', 'invite', 'rejoindre', 'join'], path: '/organization' },

  // User
  settings:       { keywords: ['parametre', 'reglage', 'setting', 'settings', 'config', 'configuration', 'preference', 'ajuste', 'langue', 'language', 'champ personnalise', 'custom field'], path: '/settings' },
  account:        { keywords: ['compte', 'account', 'profil', 'profile', 'mon compte', 'my account', 'mi cuenta', 'mot de passe', 'password', 'email', 'supprimer compte', 'delete account', 'donnees personnelles', '2fa', 'double authentification', 'two factor', 'securite', 'security'], path: '/account' },
  pricing:        { keywords: ['prix', 'tarif', 'pricing', 'plan', 'abonnement', 'subscription', 'premium', 'upgrade', 'precio', 'paiement', 'payment', 'stripe', 'facturation', 'billing', 'offre', 'offer'], path: '/pricing' },
  booking:        { keywords: ['booking', 'reservation', 'reserver', 'demo', 'rendez-vous', 'rdv', 'cal.com', 'appel', 'call', 'consultation', 'cita'], path: '/booking' },

  // Admin
  admin:          { keywords: ['admin', 'administration', 'gestion utilisateur', 'users management', 'panel admin', 'back office', 'impersonation', 'impersonate'], path: '/admin' },

  // Legal
  legal:          { keywords: ['legal', 'rgpd', 'gdpr', 'confidentialite', 'privacy', 'mention legale', 'cookies', 'donnees', 'iso 27001', 'rgaa', 'accessibilite'], path: '/legal' },
  cgv:            { keywords: ['cgv', 'conditions generales de vente', 'conditions de vente', 'terms of sale'], path: '/cgv' },
  cgu:            { keywords: ['cgu', 'conditions generales d\'utilisation', 'conditions d\'utilisation', 'terms of use'], path: '/cgu' },

  // Special views (Players page with query params)
  byLeague:       { keywords: ['par ligue', 'by league', 'par championnat', 'por liga', 'tri ligue'], path: '/players?view=by-league' },
  byPosition:     { keywords: ['par poste', 'par position', 'by position', 'por posicion', 'tri position'], path: '/players?view=by-position' },
  byAge:          { keywords: ['par age', 'by age', 'por edad', 'tri age', 'u21', 'jeune', 'young'], path: '/players?view=by-age' },
  byOpinion:      { keywords: ['par avis', 'par opinion', 'by opinion', 'por opinion', 'tri opinion', 'a suivre', 'a revoir', 'defavorable'], path: '/players?view=by-opinion' },
  byPotential:    { keywords: ['par potentiel', 'by potential', 'por potencial', 'tri potentiel', 'haut potentiel', 'elite'], path: '/players?view=by-potential' },
  contracts:      { keywords: ['contrat', 'contract', 'fin de contrat', 'expiration', 'libre', 'free agent', 'echeance'], path: '/players?view=contracts' },

  // Affiliate
  affiliate:      { keywords: ['affiliation', 'affiliate', 'parrainage', 'referral', 'parrain', 'filleul', 'commission', 'gagner argent', 'earn money', 'recommander', 'recommend', 'lien parrainage', 'referido'], path: '/affiliate' },
};

const HELP_TOPICS: Record<string, HelpEntry> = {
  // Player actions
  report:         { keywords: ['rapport', 'report', 'rediger', 'note scouting', 'evaluation', 'informe', 'observation', 'fiche', 'compte rendu', 'cr'], answer: 'chatbot.help_report' },
  exportData:     { keywords: ['export', 'exporter', 'excel', 'telecharger', 'download', 'exportar', 'extraction'], answer: 'chatbot.help_export' },
  searchFilter:   { keywords: ['chercher', 'recherche', 'search', 'trouver', 'find', 'filtrer', 'filter', 'buscar', 'tri', 'trier', 'sort', 'classer'], answer: 'chatbot.help_search' },
  importData:     { keywords: ['import', 'importer', 'upload', 'charger', 'importar', 'fichier excel', 'fichier csv'], answer: 'chatbot.help_import' },
  enrichment:     { keywords: ['enrichir', 'enrichissement', 'enrich', 'transfermarkt', 'donnees externes', 'external data', 'auto-complete', 'completer', 'ia', 'ai'], answer: 'chatbot.help_enrich' },
  customFields:   { keywords: ['champ personnalise', 'custom field', 'champ custom', 'ajouter champ', 'nouveau champ', 'field', 'campo personalizado'], answer: 'chatbot.help_custom_fields' },
  pdf:            { keywords: ['pdf', 'generer pdf', 'generate pdf', 'telecharger rapport', 'download report', 'imprimer', 'print'], answer: 'chatbot.help_pdf' },

  // Watchlist & shadow
  watchlistHelp:  { keywords: ['creer watchlist', 'nouvelle watchlist', 'ajouter watchlist', 'create watchlist', 'gerer watchlist', 'manage watchlist'], answer: 'chatbot.help_watchlist' },
  shadowHelp:     { keywords: ['creer shadow', 'shadow team help', 'equipe type aide', 'comment shadow', 'how shadow'], answer: 'chatbot.help_shadow' },

  // Organization
  orgCreate:      { keywords: ['creer organisation', 'creer org', 'create organization', 'nouvelle organisation', 'new organization', 'fonder'], answer: 'chatbot.help_org_create' },
  orgJoin:        { keywords: ['rejoindre', 'join', 'code invitation', 'invite code', 'unirse', 'codigo'], answer: 'chatbot.help_org_join' },
  orgShare:       { keywords: ['partager joueur', 'share player', 'partage', 'sharing', 'collaborer', 'collaborate', 'equipe', 'compartir'], answer: 'chatbot.help_org_share' },
  orgSquad:       { keywords: ['effectif organisation', 'org squad', 'squad management', 'gestion effectif'], answer: 'chatbot.help_org_squad' },
  orgRoadmap:     { keywords: ['roadmap', 'planning org', 'missions organisation', 'assigner match', 'assign match', 'repartition'], answer: 'chatbot.help_org_roadmap' },

  // Account & security
  changePassword: { keywords: ['changer mot de passe', 'change password', 'modifier mot de passe', 'reset password', 'cambiar contrasena', 'nouveau mot de passe'], answer: 'chatbot.help_password' },
  twoFA:          { keywords: ['2fa', 'double authentification', 'two factor', 'totp', 'authentificateur', 'authenticator', 'securiser', 'secure'], answer: 'chatbot.help_2fa' },
  deleteAccount:  { keywords: ['supprimer compte', 'delete account', 'fermer compte', 'close account', 'eliminar cuenta', 'desinscrire', 'unsubscribe'], answer: 'chatbot.help_delete_account' },
  downloadData:   { keywords: ['telecharger donnees', 'download data', 'mes donnees', 'my data', 'donnees personnelles', 'personal data', 'rgpd export'], answer: 'chatbot.help_download_data' },

  // Contacts
  contactAdd:     { keywords: ['ajouter contact', 'add contact', 'nouveau contact', 'new contact', 'creer contact', 'create contact'], answer: 'chatbot.help_contact_add' },
  contactShare:   { keywords: ['partager contact', 'share contact', 'envoyer contact', 'send contact', 'whatsapp', 'sms'], answer: 'chatbot.help_contact_share' },

  // Matches
  matchAdd:       { keywords: ['ajouter match', 'add match', 'planifier match', 'plan match', 'programmer', 'assister', 'attend'], answer: 'chatbot.help_match_add' },
  matchStatus:    { keywords: ['statut match', 'match status', 'confirmer match', 'confirm match', 'annuler match', 'cancel match', 'planifie', 'planned'], answer: 'chatbot.help_match_status' },

  // Subscription
  subscriptionHelp: { keywords: ['gerer abonnement', 'manage subscription', 'annuler abonnement', 'cancel subscription', 'facturation', 'billing portal', 'facture', 'invoice', 'renouvellement'], answer: 'chatbot.help_subscription' },

  // Notifications
  notifications:  { keywords: ['notification', 'notifications', 'alerte', 'alert', 'cloche', 'bell', 'notificacion'], answer: 'chatbot.help_notifications' },

  // Feedback & bug
  feedback:       { keywords: ['feedback', 'avis', 'retour', 'opinion app', 'suggestion', 'ameliorer', 'improve'], answer: 'chatbot.help_feedback' },
  bugReport:      { keywords: ['bug', 'probleme', 'erreur', 'error', 'signaler', 'report issue', 'ne fonctionne pas', 'doesn\'t work', 'crash', 'plante', 'panne'], answer: 'chatbot.help_bug' },

  // Misc
  language:       { keywords: ['changer langue', 'change language', 'francais', 'english', 'espanol', 'cambiar idioma', 'switch language'], answer: 'chatbot.help_language' },
  premium:        { keywords: ['fonctionnalite premium', 'premium feature', 'avantage premium', 'premium benefit', 'quoi premium', 'what premium', 'difference gratuit'], answer: 'chatbot.help_premium' },
  bulkActions:    { keywords: ['action groupee', 'bulk action', 'selection multiple', 'multi select', 'selectionner tout', 'select all', 'masse', 'bulk'], answer: 'chatbot.help_bulk' },
  affiliateHelp:  { keywords: ['programme affiliation', 'affiliate program', 'parrainage aide', 'comment parrainer', 'how to refer', 'lien parrainage', 'commission parrainage'], answer: 'chatbot.help_affiliate' },
};

// Quick-action suggestions shown as chips
const QUICK_ACTIONS = [
  { label: 'chatbot.quick_players', query: 'joueurs' },
  { label: 'chatbot.quick_add', query: 'ajouter joueur' },
  { label: 'chatbot.quick_report', query: 'rapport' },
  { label: 'chatbot.quick_export', query: 'export' },
  { label: 'chatbot.quick_watchlist', query: 'watchlist' },
  { label: 'chatbot.quick_org', query: 'organisation' },
  { label: 'chatbot.quick_settings', query: 'paramètres' },
  { label: 'chatbot.quick_bug', query: 'bug' },
];

// ---------------------------------------------------------------------------
// MATCHING ENGINE
// ---------------------------------------------------------------------------

function normalize(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['']/g, "'");
}

function matchQuery(input: string): { routes: { label: string; path: string }[]; helps: string[] } {
  const normalized = normalize(input);
  const routes: { label: string; path: string }[] = [];
  const helps: string[] = [];
  const seenRoutes = new Set<string>();

  for (const [key, { keywords, path }] of Object.entries(ROUTE_MAP)) {
    for (const kw of keywords) {
      if (normalized.includes(normalize(kw))) {
        if (!seenRoutes.has(path)) {
          seenRoutes.add(path);
          routes.push({ label: `chatbot.route_${key}`, path });
        }
        break;
      }
    }
  }

  const seenHelps = new Set<string>();
  for (const [, { keywords, answer }] of Object.entries(HELP_TOPICS)) {
    for (const kw of keywords) {
      if (normalized.includes(normalize(kw))) {
        if (!seenHelps.has(answer)) {
          seenHelps.add(answer);
          helps.push(answer);
        }
        break;
      }
    }
  }

  return { routes, helps };
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [idCounter, setIdCounter] = useState(1);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ id: 0, role: 'bot', text: t('chatbot.welcome') }]);
    }
  }, [open, messages.length, t]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const processQuery = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: Message = { id: idCounter, role: 'user', text: trimmed };
    const nextId = idCounter + 1;

    const { routes, helps } = matchQuery(trimmed);

    let botText: string;
    let links: { label: string; path: string }[] | undefined;

    if (routes.length > 0 || helps.length > 0) {
      const parts: string[] = [];
      if (helps.length > 0) {
        parts.push(...helps.map(h => t(h)));
      }
      if (routes.length > 0) {
        parts.push(t('chatbot.found_pages'));
      }
      botText = parts.join('\n\n');
      links = routes.length > 0 ? routes.map(r => ({ ...r, label: t(r.label) })) : undefined;
    } else {
      botText = t('chatbot.no_result');
    }

    const botMsg: Message = { id: nextId, role: 'bot', text: botText, links };

    setMessages(prev => [...prev, userMsg, botMsg]);
    setIdCounter(nextId + 1);
    setInput('');
    setShowQuickActions(false);
  };

  const handleSend = () => processQuery(input);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleLinkClick = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-105',
          open
            ? 'bg-muted text-muted-foreground hover:bg-muted/80'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        )}
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>

      {/* Chat panel */}
      <div
        className={cn(
          'fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden transition-all duration-300 origin-bottom-right',
          open ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-95 opacity-0 pointer-events-none'
        )}
        style={{ height: '520px' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-primary/10 to-accent/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold">{t('chatbot.title')}</h3>
              <p className="text-xs text-muted-foreground">{t('chatbot.subtitle')}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth">
          {messages.map(msg => (
            <div key={msg.id} className={cn('flex gap-2.5', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'bot' && (
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted text-foreground rounded-bl-md'
                )}
              >
                <p className="whitespace-pre-line">{msg.text}</p>
                {msg.links && msg.links.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {msg.links.map((link, i) => (
                      <button
                        key={i}
                        onClick={() => handleLinkClick(link.path)}
                        className={cn(
                          'flex items-center gap-1.5 text-xs font-medium w-full text-left hover:underline',
                          msg.role === 'user' ? 'text-primary-foreground/80' : 'text-primary'
                        )}
                      >
                        <span>→</span> {link.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-accent-foreground" />
                </div>
              )}
            </div>
          ))}

          {/* Quick action chips */}
          {showQuickActions && messages.length <= 1 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK_ACTIONS.map((qa, i) => (
                <button
                  key={i}
                  onClick={() => processQuery(qa.query)}
                  className="px-3 py-1.5 rounded-full border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  {t(qa.label)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-1.5">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chatbot.placeholder')}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
