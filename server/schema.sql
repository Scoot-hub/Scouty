-- ============================================================================
-- Scouty — Full database schema
-- All tables used by the application (server/index.js auto-migrates missing
-- columns/tables at startup, but this file is the canonical reference).
-- ============================================================================

-- ── Authentication & Users ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_sign_in_at DATETIME NULL,
  totp_secret VARCHAR(255) NULL,
  totp_secret_temp VARCHAR(255) NULL,
  totp_enabled TINYINT(1) NOT NULL DEFAULT 0,
  email_2fa_enabled TINYINT(1) NOT NULL DEFAULT 0,
  email_2fa_code VARCHAR(6) NULL,
  email_2fa_expires_at DATETIME NULL,
  -- Anti-bot & moderation
  is_banned TINYINT(1) NOT NULL DEFAULT 0,
  ban_reason TEXT NULL,
  banned_at DATETIME NULL,
  banned_by CHAR(36) NULL,
  bot_score INT NOT NULL DEFAULT 0,
  registration_ip VARCHAR(45) NULL,
  registration_ip_hash CHAR(64) NULL,
  -- Notification preferences (JSON: email_match_assigned, email_org_invite, email_community, email_weekly, web_bell)
  notification_prefs TEXT NULL,
  INDEX idx_users_banned (is_banned),
  INDEX idx_users_ip_hash (registration_ip_hash),
  UNIQUE KEY uniq_users_email (email(191))
);

-- Tracks hashed registration IPs to enforce multi-account limits (SHA-256, privacy-safe)
CREATE TABLE IF NOT EXISTS signup_ip_log (
  ip_hash       CHAR(64)   NOT NULL PRIMARY KEY,
  account_count INT        NOT NULL DEFAULT 1,
  first_seen    DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen     DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_flagged    TINYINT(1) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  full_name VARCHAR(100) NOT NULL DEFAULT '',
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  club VARCHAR(100) NOT NULL DEFAULT '',
  role VARCHAR(50) NOT NULL DEFAULT 'scout',
  photo_url TEXT NULL,
  company VARCHAR(200) NULL,
  siret VARCHAR(20) NULL,
  phone VARCHAR(30) NULL,
  civility ENUM('M.','Mme','Non précisé') NULL DEFAULT NULL,
  address TEXT NULL,
  country VARCHAR(100) NULL,
  date_of_birth DATE NULL,
  reference_club VARCHAR(200) NULL,
  social_x VARCHAR(100) NULL,
  social_instagram VARCHAR(100) NULL,
  social_linkedin VARCHAR(255) NULL,
  social_facebook VARCHAR(255) NULL,
  social_snapchat VARCHAR(100) NULL,
  social_tiktok VARCHAR(100) NULL,
  social_telegram VARCHAR(100) NULL,
  social_whatsapp VARCHAR(30) NULL,
  social_public TINYINT(1) NOT NULL DEFAULT 0,
  referred_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_reset_token (token),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_roles (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  role ENUM('admin','user') NOT NULL DEFAULT 'user',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_role (user_id, role),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  is_premium TINYINT(1) NOT NULL DEFAULT 0,
  premium_since DATETIME NULL,
  stripe_customer_id VARCHAR(255) NULL,
  stripe_subscription_id VARCHAR(255) NULL,
  plan_type VARCHAR(30) NOT NULL DEFAULT 'starter',
  billing_cycle VARCHAR(20) NULL,
  subscription_end DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_credit_events (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  direction ENUM('earn','spend') NOT NULL DEFAULT 'spend',
  amount INT NOT NULL DEFAULT 1,
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_uce_user_date (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS page_permissions (
  id CHAR(36) PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  page_key VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL DEFAULT 'view',
  allowed TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_role_page_action (role, page_key, action)
);

-- ── Players & Scouting ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS players (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  photo_url TEXT NULL,
  generation INT NOT NULL DEFAULT 2000,
  nationality VARCHAR(120) NOT NULL DEFAULT 'France',
  foot VARCHAR(30) NOT NULL DEFAULT 'Droit',
  club VARCHAR(255) NOT NULL DEFAULT '',
  league VARCHAR(255) NOT NULL DEFAULT '',
  zone VARCHAR(50) NOT NULL DEFAULT 'Milieu',
  position VARCHAR(20) NOT NULL DEFAULT 'MC',
  position_secondaire VARCHAR(50) NULL,
  role VARCHAR(255) NULL,
  current_level DECIMAL(3,1) NOT NULL DEFAULT 5.0,
  potential DECIMAL(3,1) NOT NULL DEFAULT 5.0,
  general_opinion VARCHAR(30) NOT NULL DEFAULT 'À revoir',
  contract_end DATE NULL,
  notes TEXT NULL,
  ts_report_published TINYINT(1) NOT NULL DEFAULT 0,
  date_of_birth DATE NULL,
  market_value VARCHAR(100) NULL,
  transfermarkt_id VARCHAR(100) NULL,
  external_data JSON NULL,
  external_data_fetched_at DATETIME NULL,
  shared_with_org TINYINT(1) NOT NULL DEFAULT 0,
  task VARCHAR(30) NULL DEFAULT NULL,
  has_news VARCHAR(50) NULL DEFAULT NULL,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  -- Wyscout / stats import fields (bio/physical stored here, stats in player_wyscout_stats)
  height INT NULL,
  weight INT NULL,
  on_loan TINYINT(1) NOT NULL DEFAULT 0,
  matches_played INT NULL,
  minutes_played INT NULL,
  passport_country VARCHAR(255) NULL,
  wyscout_season VARCHAR(20) NULL,
  wyscout_division VARCHAR(20) NULL,
  wyscout_team_in_timeframe VARCHAR(255) NULL,
  wyscout_stats JSON NULL,
  social_instagram VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_players_user_name (user_id, name(191)),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  player_id CHAR(36) NOT NULL,
  report_date DATE NOT NULL,
  title VARCHAR(255) NULL,
  opinion VARCHAR(30) NOT NULL DEFAULT 'À revoir',
  drive_link TEXT NULL,
  file_url TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reports_player_date (player_id, report_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS custom_fields (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  field_name VARCHAR(255) NOT NULL,
  field_type VARCHAR(30) NOT NULL DEFAULT 'text',
  field_options JSON NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_custom_fields_user_order (user_id, display_order),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  custom_field_id CHAR(36) NOT NULL,
  player_id CHAR(36) NOT NULL,
  value TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_custom_field_player (custom_field_id, player_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (custom_field_id) REFERENCES custom_fields(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_research (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  player_id CHAR(36) NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'note',
  title VARCHAR(500) NOT NULL,
  url TEXT NULL,
  content TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_player_research (user_id, player_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_videos (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  player_id CHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  url TEXT NULL,
  file_url TEXT NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_player_videos (user_id, player_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_org_shares (
  id CHAR(36) PRIMARY KEY,
  player_id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_player_org (player_id, organization_id),
  INDEX idx_player_org_shares_org (organization_id),
  INDEX idx_player_org_shares_user (user_id),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Watchlists & Shadow Teams ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watchlists (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_watchlists_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS watchlist_players (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  watchlist_id CHAR(36) NOT NULL,
  player_id CHAR(36) NOT NULL,
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_watchlist_player (watchlist_id, player_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shadow_teams (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  formation VARCHAR(20) NOT NULL DEFAULT '4-3-3',
  logo_url TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_shadow_teams_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shadow_team_players (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  shadow_team_id CHAR(36) NOT NULL,
  player_id CHAR(36) NOT NULL,
  position_slot VARCHAR(20) NOT NULL,
  `rank` INT NOT NULL DEFAULT 0,
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_shadow_slot_player (shadow_team_id, position_slot, player_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shadow_team_id) REFERENCES shadow_teams(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- ── Organizations ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'club',
  invite_code VARCHAR(32) NOT NULL,
  logo_url TEXT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_invite_code (invite_code),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS organization_members (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'member',
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_org_user (organization_id, user_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS squad_players (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  photo_url TEXT NULL,
  date_of_birth DATE NULL,
  nationality VARCHAR(120) NOT NULL DEFAULT '',
  club VARCHAR(255) NOT NULL DEFAULT '',
  league VARCHAR(255) NOT NULL DEFAULT '',
  foot VARCHAR(30) NOT NULL DEFAULT '',
  market_value VARCHAR(100) NULL,
  position VARCHAR(20) NOT NULL DEFAULT 'MC',
  position_secondaire VARCHAR(50) NULL,
  jersey_number INT NULL,
  contract_start DATE NULL,
  contract_end DATE NULL,
  monthly_salary DECIMAL(12,2) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  agent_name VARCHAR(255) NOT NULL DEFAULT '',
  agent_phone VARCHAR(100) NOT NULL DEFAULT '',
  agent_email VARCHAR(255) NOT NULL DEFAULT '',
  notes TEXT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_squad_org (organization_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Fixtures & Matches ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fixtures (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  match_date DATE NOT NULL,
  match_time TIME NULL,
  competition VARCHAR(255) NOT NULL DEFAULT '',
  venue VARCHAR(255) NOT NULL DEFAULT '',
  score_home INT NULL,
  score_away INT NULL,
  notes TEXT NULL,
  is_favorite TINYINT(1) NOT NULL DEFAULT 0,
  source ENUM('manual','api') NOT NULL DEFAULT 'manual',
  api_fixture_id INT NULL,
  api_league_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_fixtures_user_date (user_id, match_date),
  UNIQUE KEY uniq_user_api_fixture (user_id, api_fixture_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_assignments (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  organization_id CHAR(36) NULL,
  assigned_to CHAR(36) NULL,
  assigned_by CHAR(36) NULL,
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  match_date DATE NOT NULL,
  match_time VARCHAR(10) NULL,
  competition VARCHAR(255) NOT NULL DEFAULT '',
  venue VARCHAR(255) NOT NULL DEFAULT '',
  home_badge TEXT NULL,
  away_badge TEXT NULL,
  notes TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'planned',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_match_assignments_user (user_id, match_date),
  INDEX idx_match_assignments_org (organization_id, match_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ── Clubs & Leagues ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS club_logos (
  club_name VARCHAR(255) NOT NULL PRIMARY KEY,
  logo_url TEXT NOT NULL,
  name_fr VARCHAR(255) NULL,
  name_en VARCHAR(255) NULL,
  name_es VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_club_logos_fr (name_fr),
  INDEX idx_club_logos_en (name_en),
  INDEX idx_club_logos_es (name_es)
);

CREATE TABLE IF NOT EXISTS club_directory (
  club_name VARCHAR(255) NOT NULL PRIMARY KEY,
  competition VARCHAR(255) NOT NULL DEFAULT '',
  country VARCHAR(255) NOT NULL DEFAULT '',
  country_code VARCHAR(10) NOT NULL DEFAULT '',
  logo_url TEXT NULL,
  lat DECIMAL(9,6) NULL,
  lng DECIMAL(9,6) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_club_dir_competition (competition),
  INDEX idx_club_dir_country (country)
);

CREATE TABLE IF NOT EXISTS followed_clubs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  club_name VARCHAR(255) NOT NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_club (user_id, club_name(191)),
  INDEX idx_followed_clubs_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_followed_leagues (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  league_id INT NOT NULL,
  league_name VARCHAR(255) NOT NULL,
  league_country VARCHAR(255) NOT NULL DEFAULT '',
  league_logo VARCHAR(500) NULL,
  season INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_league_season (user_id, league_id, season),
  INDEX idx_followed_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS league_name_mappings (
  id CHAR(36) PRIMARY KEY,
  app_league_name VARCHAR(255) NOT NULL,
  api_league_id INT NOT NULL,
  api_league_name VARCHAR(255) NOT NULL,
  api_country VARCHAR(255) NOT NULL DEFAULT '',
  api_league_logo VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_app_league (app_league_name(191))
);

-- Role metadata (color)
CREATE TABLE IF NOT EXISTS role_metadata (
  role VARCHAR(50) NOT NULL PRIMARY KEY,
  color VARCHAR(20) NOT NULL DEFAULT '#6366f1',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS custom_championships (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  country VARCHAR(255) NOT NULL DEFAULT 'Autre',
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_custom_champ_name (name(191)),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS championship_players (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  championship_name VARCHAR(255) NOT NULL,
  player_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_champ_player (user_id, championship_name(150), player_id),
  INDEX idx_champ_players_name (championship_name(191)),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- ── Community ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_posts (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  author_name VARCHAR(255) NOT NULL,
  category ENUM('question','suggestion','match','player','general') NOT NULL DEFAULT 'general',
  title VARCHAR(120) NOT NULL,
  content TEXT NOT NULL,
  likes INT NOT NULL DEFAULT 0,
  replies_count INT NOT NULL DEFAULT 0,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_community_posts_user (user_id),
  INDEX idx_community_posts_category (category),
  INDEX idx_community_posts_created (created_at DESC),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_replies (
  id CHAR(36) PRIMARY KEY,
  post_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  author_name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_community_replies_post (post_id),
  FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_likes (
  id CHAR(36) PRIMARY KEY,
  post_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_post_user (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Tickets & Support ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tickets (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'bug',
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  page_url VARCHAR(500) NULL,
  user_agent VARCHAR(500) NULL,
  status ENUM('open','in_progress','closed') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tickets_user (user_id),
  INDEX idx_tickets_status (status, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id CHAR(36) PRIMARY KEY,
  ticket_id CHAR(36) NOT NULL,
  sender_id CHAR(36) NOT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ticket_messages_ticket (ticket_id, created_at),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Notifications ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NULL,
  icon VARCHAR(50) NULL,
  link VARCHAR(255) NULL,
  player_id CHAR(36) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user (user_id, is_read, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Feedback & Referrals ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feedback (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message TEXT NULL,
  page_url VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_feedback_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS referrals (
  id CHAR(36) PRIMARY KEY,
  referrer_id CHAR(36) NOT NULL,
  referred_id CHAR(36) NOT NULL,
  referral_code VARCHAR(50) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_referred (referred_id),
  INDEX idx_referrals_referrer (referrer_id),
  FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Contacts ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contacts (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  first_name VARCHAR(255) NOT NULL DEFAULT '',
  last_name VARCHAR(255) NOT NULL DEFAULT '',
  photo_url TEXT NULL,
  organization VARCHAR(255) NOT NULL DEFAULT '',
  role_title VARCHAR(255) NOT NULL DEFAULT '',
  phone VARCHAR(100) NOT NULL DEFAULT '',
  email VARCHAR(255) NOT NULL DEFAULT '',
  linkedin_url TEXT NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_contacts_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Caches & Internal ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_football_cache (
  cache_key VARCHAR(255) PRIMARY KEY,
  response_json JSON NOT NULL,
  fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  INDEX idx_cache_expires (expires_at)
);

CREATE TABLE IF NOT EXISTS club_geocoding_cache (
  cache_key    VARCHAR(512) NOT NULL PRIMARY KEY,
  lat          DECIMAL(9,6) NOT NULL,
  lng          DECIMAL(9,6) NOT NULL,
  cached_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS thesportsdb_team_cache (
  club_name VARCHAR(255) NOT NULL PRIMARY KEY,
  tsdb_team_id INT NOT NULL,
  tsdb_team_name VARCHAR(255) NOT NULL,
  tsdb_league_name VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uploaded_images (
  id VARCHAR(255) PRIMARY KEY,
  data LONGBLOB NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Nightly enrichment logs (cron) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cron_enrichment_logs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  total_players INT NOT NULL DEFAULT 0,
  enriched INT NOT NULL DEFAULT 0,
  errors INT NOT NULL DEFAULT 0,
  status ENUM('running', 'done', 'failed') NOT NULL DEFAULT 'running',
  error_detail TEXT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Inactive-user cleanup logs (cron) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cron_cleanup_logs (
  id CHAR(36) PRIMARY KEY,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  users_deleted INT NOT NULL DEFAULT 0,
  users_warned INT NOT NULL DEFAULT 0,
  status ENUM('running', 'done', 'failed') NOT NULL DEFAULT 'running',
  error_detail TEXT NULL
);

CREATE TABLE IF NOT EXISTS cron_job_logs (
  id CHAR(36) PRIMARY KEY,
  job_name VARCHAR(50) NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  status ENUM('running','done','failed') NOT NULL DEFAULT 'running',
  result_json JSON NULL,
  error_detail TEXT NULL,
  INDEX idx_cjl_job_date (job_name, started_at)
);

-- ── Feature flags (admin toggles) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value VARCHAR(500) NOT NULL DEFAULT '1',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_integrations (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  service VARCHAR(50) NOT NULL,
  api_key TEXT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  last_tested_at DATETIME NULL,
  test_status VARCHAR(20) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_service (user_id, service),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Session analytics ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  device_type ENUM('desktop','mobile','tablet') NOT NULL DEFAULT 'desktop',
  browser VARCHAR(50) NULL,
  os VARCHAR(100) NULL,
  screen_width INT NULL,
  screen_height INT NULL,
  language VARCHAR(10) NULL,
  current_page VARCHAR(255) NULL,
  page_category VARCHAR(30) NULL,
  ip_address VARCHAR(45) NULL,
  country VARCHAR(100) NULL,
  country_code CHAR(2) NULL,
  city VARCHAR(100) NULL,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  geo_from_client TINYINT(1) NOT NULL DEFAULT 0,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_session (user_id, session_id),
  INDEX idx_last_seen (last_seen_at),
  INDEX idx_country (country_code),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tracks cumulative time (seconds) per page pole per session
CREATE TABLE IF NOT EXISTS session_page_time (
  user_id      CHAR(36)    NOT NULL,
  session_id   VARCHAR(64) NOT NULL,
  category     VARCHAR(30) NOT NULL,
  seconds_spent INT        NOT NULL DEFAULT 30,
  last_updated  DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, session_id, category),
  INDEX idx_spt_user (user_id),
  INDEX idx_spt_category (category),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── News & Buzz ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS news_articles (
  id CHAR(36) PRIMARY KEY,
  external_id VARCHAR(255) NULL,
  title VARCHAR(1000) NOT NULL,
  description TEXT NULL,
  content TEXT NULL,
  image_url TEXT NULL,
  article_url TEXT NOT NULL,
  category VARCHAR(100) NULL,
  tags JSON NULL,
  author VARCHAR(255) NULL,
  published_at DATETIME NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'sofascore',
  scraped_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_news_url (article_url(191)),
  INDEX idx_news_published (published_at DESC),
  INDEX idx_news_category (category),
  INDEX idx_news_source (source, published_at)
);

CREATE TABLE IF NOT EXISTS football_buzz (
  id CHAR(36) PRIMARY KEY,
  source_name VARCHAR(100) NOT NULL,
  source_handle VARCHAR(100) NOT NULL,
  source_color VARCHAR(20) NOT NULL DEFAULT '#3B82F6',
  content TEXT NOT NULL,
  image_url TEXT NULL,
  external_url TEXT NOT NULL,
  buzz_score INT NOT NULL DEFAULT 0,
  is_hot TINYINT(1) NOT NULL DEFAULT 0,
  published_at DATETIME NOT NULL,
  scraped_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  content_hash CHAR(64) NOT NULL,
  UNIQUE KEY uniq_buzz_hash (content_hash),
  INDEX idx_buzz_score (buzz_score DESC, published_at DESC),
  INDEX idx_buzz_date (published_at DESC)
);

-- ── Championships ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_saved_championships (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  championship_name VARCHAR(255) NOT NULL,
  championship_country VARCHAR(100) NULL,
  championship_logo TEXT NULL,
  sofascore_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_champ (user_id, championship_name(191)),
  INDEX idx_saved_champs_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Club staff cache ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS club_staff_cache (
  id CHAR(36) PRIMARY KEY,
  club_name VARCHAR(255) NOT NULL,
  sofascore_team_id INT NULL,
  sofascore_team_slug VARCHAR(255) NULL,
  coach_id INT NULL,
  coach_name VARCHAR(255) NULL,
  coach_slug VARCHAR(255) NULL,
  coach_photo_url TEXT NULL,
  coach_nationality VARCHAR(100) NULL,
  coach_date_born DATE NULL,
  coach_sofascore_url TEXT NULL,
  president_name VARCHAR(255) NULL,
  president_photo_url TEXT NULL,
  president_wikidata_id VARCHAR(50) NULL,
  fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_club_staff_name (club_name(191)),
  INDEX idx_club_staff_fetched (fetched_at)
);

-- ── Editorial articles ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS editorial_articles (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL,
  content LONGTEXT NOT NULL,
  banner_url TEXT NULL,
  keywords JSON NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  views INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_editorial_slug (slug(191)),
  INDEX idx_editorial_user (user_id),
  INDEX idx_editorial_status (status, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS editorial_reactions (
  user_id    CHAR(36)    NOT NULL,
  article_id CHAR(36)    NOT NULL,
  reaction   ENUM('like','dislike') NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, article_id),
  INDEX idx_er_article (article_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (article_id) REFERENCES editorial_articles(id) ON DELETE CASCADE
);

-- ── Scout opinions (par organisation) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scout_opinions (
  id CHAR(36) PRIMARY KEY,
  player_id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  current_level DECIMAL(3,1) NOT NULL DEFAULT 5.0,
  potential DECIMAL(3,1) NOT NULL DEFAULT 5.0,
  opinion VARCHAR(20) NOT NULL DEFAULT 'À revoir',
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_scout_opinions_player (player_id),
  INDEX idx_scout_opinions_org (organization_id),
  INDEX idx_scout_opinions_user (user_id),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Wyscout statistical import ────────────────────────────────────────────────
-- 130+ colonnes de statistiques par joueur / saison / division

CREATE TABLE IF NOT EXISTS player_wyscout_stats (
  id CHAR(36) PRIMARY KEY,
  player_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  season VARCHAR(20) NOT NULL,
  division VARCHAR(20) NULL,
  team VARCHAR(255) NULL,
  continent VARCHAR(100) NULL,
  country VARCHAR(100) NULL,
  country_raw VARCHAR(100) NULL,
  year_start SMALLINT NULL,
  year_end SMALLINT NULL,
  source_filename TEXT NULL,
  source_file_path TEXT NULL,
  -- Base counting stats
  matches_played INT NULL,
  minutes_played INT NULL,
  goals INT NULL,
  xg DECIMAL(6,2) NULL,
  assists INT NULL,
  xa DECIMAL(6,2) NULL,
  yellow_cards INT NULL,
  red_cards INT NULL,
  shots INT NULL,
  np_goals INT NULL,
  head_goals INT NULL,
  conceded_goals INT NULL,
  shots_against INT NULL,
  clean_sheets INT NULL,
  penalties_taken INT NULL,
  -- Defensive per-90
  defensive_actions_per90 DECIMAL(6,2) NULL,
  defensive_duels_per90 DECIMAL(6,2) NULL,
  defensive_duels_won_pct DECIMAL(5,2) NULL,
  aerial_duels_per90 DECIMAL(6,2) NULL,
  aerial_duels_won_pct DECIMAL(5,2) NULL,
  sliding_tackles_per90 DECIMAL(6,2) NULL,
  padj_sliding_tackles DECIMAL(6,2) NULL,
  shots_blocked_per90 DECIMAL(6,2) NULL,
  interceptions_per90 DECIMAL(6,2) NULL,
  padj_interceptions DECIMAL(6,2) NULL,
  fouls_per90 DECIMAL(6,2) NULL,
  yellow_cards_per90 DECIMAL(6,2) NULL,
  red_cards_per90 DECIMAL(6,2) NULL,
  duels_per90 DECIMAL(6,2) NULL,
  duels_won_pct DECIMAL(5,2) NULL,
  -- Attacking per-90
  attacking_actions_per90 DECIMAL(6,2) NULL,
  goals_per90 DECIMAL(6,2) NULL,
  np_goals_per90 DECIMAL(6,2) NULL,
  xg_per90 DECIMAL(6,2) NULL,
  head_goals_per90 DECIMAL(6,2) NULL,
  shots_per90 DECIMAL(6,2) NULL,
  shots_on_target_pct DECIMAL(5,2) NULL,
  goal_conversion_pct DECIMAL(5,2) NULL,
  assists_per90 DECIMAL(6,2) NULL,
  xa_per90 DECIMAL(6,2) NULL,
  crosses_per90 DECIMAL(6,2) NULL,
  crosses_accurate_pct DECIMAL(5,2) NULL,
  crosses_left_per90 DECIMAL(6,2) NULL,
  crosses_left_accurate_pct DECIMAL(5,2) NULL,
  crosses_right_per90 DECIMAL(6,2) NULL,
  crosses_right_accurate_pct DECIMAL(5,2) NULL,
  crosses_to_box_per90 DECIMAL(6,2) NULL,
  dribbles_per90 DECIMAL(6,2) NULL,
  dribbles_success_pct DECIMAL(5,2) NULL,
  offensive_duels_per90 DECIMAL(6,2) NULL,
  offensive_duels_won_pct DECIMAL(5,2) NULL,
  touches_in_box_per90 DECIMAL(6,2) NULL,
  progressive_runs_per90 DECIMAL(6,2) NULL,
  accelerations_per90 DECIMAL(6,2) NULL,
  received_passes_per90 DECIMAL(6,2) NULL,
  received_long_passes_per90 DECIMAL(6,2) NULL,
  fouls_suffered_per90 DECIMAL(6,2) NULL,
  -- Passing per-90
  passes_per90 DECIMAL(6,2) NULL,
  passes_accurate_pct DECIMAL(5,2) NULL,
  forward_passes_per90 DECIMAL(6,2) NULL,
  forward_passes_accurate_pct DECIMAL(5,2) NULL,
  back_passes_per90 DECIMAL(6,2) NULL,
  back_passes_accurate_pct DECIMAL(5,2) NULL,
  lateral_passes_per90 DECIMAL(6,2) NULL,
  lateral_passes_accurate_pct DECIMAL(5,2) NULL,
  short_medium_passes_per90 DECIMAL(6,2) NULL,
  short_medium_passes_accurate_pct DECIMAL(5,2) NULL,
  long_passes_per90 DECIMAL(6,2) NULL,
  long_passes_accurate_pct DECIMAL(5,2) NULL,
  avg_pass_length DECIMAL(5,2) NULL,
  avg_long_pass_length DECIMAL(5,2) NULL,
  shot_assists_per90 DECIMAL(6,2) NULL,
  second_assists_per90 DECIMAL(6,2) NULL,
  third_assists_per90 DECIMAL(6,2) NULL,
  smart_passes_per90 DECIMAL(6,2) NULL,
  smart_passes_accurate_pct DECIMAL(5,2) NULL,
  key_passes_per90 DECIMAL(6,2) NULL,
  passes_final_third_per90 DECIMAL(6,2) NULL,
  passes_final_third_accurate_pct DECIMAL(5,2) NULL,
  passes_penalty_area_per90 DECIMAL(6,2) NULL,
  passes_penalty_area_accurate_pct DECIMAL(5,2) NULL,
  through_passes_per90 DECIMAL(6,2) NULL,
  through_passes_accurate_pct DECIMAL(5,2) NULL,
  deep_completions_per90 DECIMAL(6,2) NULL,
  deep_completed_crosses_per90 DECIMAL(6,2) NULL,
  progressive_passes_per90 DECIMAL(6,2) NULL,
  progressive_passes_accurate_pct DECIMAL(5,2) NULL,
  -- Set pieces
  free_kicks_per90 DECIMAL(6,2) NULL,
  direct_free_kicks_per90 DECIMAL(6,2) NULL,
  direct_free_kicks_on_target_pct DECIMAL(5,2) NULL,
  corners_per90 DECIMAL(6,2) NULL,
  penalty_conversion_pct DECIMAL(5,2) NULL,
  -- Goalkeeper
  conceded_goals_per90 DECIMAL(6,2) NULL,
  shots_against_per90 DECIMAL(6,2) NULL,
  save_rate_pct DECIMAL(5,2) NULL,
  xg_against DECIMAL(6,2) NULL,
  xg_against_per90 DECIMAL(6,2) NULL,
  prevented_goals DECIMAL(6,2) NULL,
  prevented_goals_per90 DECIMAL(6,2) NULL,
  gk_back_passes_per90 DECIMAL(6,2) NULL,
  gk_exits_per90 DECIMAL(6,2) NULL,
  gk_aerial_duels_per90 DECIMAL(6,2) NULL,
  -- Physical / athletic
  total_distance_per90 DECIMAL(8,2) NULL,
  running_distance_per90 DECIMAL(8,2) NULL,
  hsr_distance_per90 DECIMAL(8,2) NULL,
  sprint_distance_per90 DECIMAL(8,2) NULL,
  hi_distance_per90 DECIMAL(8,2) NULL,
  meters_per_min DECIMAL(6,2) NULL,
  max_speed DECIMAL(5,2) NULL,
  medium_accel_per90 DECIMAL(6,2) NULL,
  high_accel_per90 DECIMAL(6,2) NULL,
  medium_decel_per90 DECIMAL(6,2) NULL,
  high_decel_per90 DECIMAL(6,2) NULL,
  hsr_count_per90 DECIMAL(6,2) NULL,
  sprint_count_per90 DECIMAL(6,2) NULL,
  hi_count_per90 DECIMAL(6,2) NULL,
  -- Meta
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_player_season_div (player_id, season(20), division(20)),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Championship standings cache — permanent for historical seasons, refreshed daily for current season
CREATE TABLE IF NOT EXISTS championship_standings (
  tournament_id  INT           NOT NULL,
  season_year    INT           NOT NULL,
  espn_slug      VARCHAR(60)   NULL,
  season_name    VARCHAR(200)  NULL,
  standings_json LONGTEXT      NOT NULL,  -- full JSON result (teams[], season, source, etc.)
  source         VARCHAR(20)   NOT NULL DEFAULT 'espn',
  fetched_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, season_year),
  INDEX idx_cs_fetched (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Logic: historical seasons (season_year < current football year) are never re-fetched.

-- ── Organization chat ─────────────────────────────────────────────────────────

-- Messages (soft-deleted via deleted_at, editable within 10 min)
CREATE TABLE IF NOT EXISTS org_messages (
  id          CHAR(36)  NOT NULL PRIMARY KEY,
  org_id      CHAR(36)  NOT NULL,
  user_id     CHAR(36)  NOT NULL,
  content     TEXT      NOT NULL,
  reply_to_id CHAR(36)  NULL,
  edited_at   DATETIME  NULL,
  deleted_at  DATETIME  NULL,
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_om_org_created (org_id, created_at),
  FOREIGN KEY (org_id)      REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)     REFERENCES users(id)         ON DELETE CASCADE,
  FOREIGN KEY (reply_to_id) REFERENCES org_messages(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Emoji reactions (one per emoji per user per message)
CREATE TABLE IF NOT EXISTS org_message_reactions (
  message_id  CHAR(36)     NOT NULL,
  user_id     CHAR(36)     NOT NULL,
  emoji       VARCHAR(10)  NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id, emoji),
  FOREIGN KEY (message_id) REFERENCES org_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Last-read cursor per user per org (for unread badge)
CREATE TABLE IF NOT EXISTS org_message_reads (
  org_id       CHAR(36)  NOT NULL,
  user_id      CHAR(36)  NOT NULL,
  last_read_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, user_id),
  FOREIGN KEY (org_id)   REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)          ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Current season is re-fetched if fetched_at is older than 24h, or on manual refresh.

-- ── StatsBomb Open Data ─────────────────────────────────────────────────────
-- Import log & versioning (tracks last GitHub commit SHA to enable incremental imports)
CREATE TABLE IF NOT EXISTS sb_import_log (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  commit_sha    CHAR(40)     NOT NULL,
  status        ENUM('running','done','failed') NOT NULL DEFAULT 'running',
  competitions_imported INT NOT NULL DEFAULT 0,
  matches_imported      INT NOT NULL DEFAULT 0,
  players_imported      INT NOT NULL DEFAULT 0,
  started_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at   DATETIME     NULL,
  error_message TEXT         NULL,
  INDEX idx_sb_import_sha (commit_sha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Competition & season catalog
CREATE TABLE IF NOT EXISTS sb_competitions (
  competition_id   INT NOT NULL,
  season_id        INT NOT NULL,
  competition_name VARCHAR(100) NOT NULL,
  season_name      VARCHAR(50)  NOT NULL,
  country_name     VARCHAR(100) NULL,
  competition_gender VARCHAR(20) NOT NULL DEFAULT 'male',
  PRIMARY KEY (competition_id, season_id),
  INDEX idx_sb_comp_name (competition_name(50))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Team catalog
CREATE TABLE IF NOT EXISTS sb_teams (
  team_id   INT PRIMARY KEY,
  team_name VARCHAR(150) NOT NULL,
  country   VARCHAR(100) NULL,
  INDEX idx_sb_team_name (team_name(50))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Player catalog (deduplicated across all competitions)
CREATE TABLE IF NOT EXISTS sb_players (
  player_id       INT PRIMARY KEY,
  player_name     VARCHAR(150) NOT NULL,
  player_nickname VARCHAR(150) NULL,
  country         VARCHAR(100) NULL,
  INDEX idx_sb_player_name (player_name(50))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Match metadata
CREATE TABLE IF NOT EXISTS sb_matches (
  match_id          INT PRIMARY KEY,
  competition_id    INT NOT NULL,
  season_id         INT NOT NULL,
  match_date        DATE NOT NULL,
  kick_off          TIME NULL,
  home_team_id      INT NOT NULL,
  away_team_id      INT NOT NULL,
  home_score        TINYINT UNSIGNED NULL,
  away_score        TINYINT UNSIGNED NULL,
  stadium_name      VARCHAR(150) NULL,
  competition_stage VARCHAR(100) NULL,
  match_week        TINYINT UNSIGNED NULL,
  has_360           TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_sb_matches_comp  (competition_id, season_id),
  INDEX idx_sb_matches_date  (match_date),
  INDEX idx_sb_matches_teams (home_team_id, away_team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Player appearances per match (from lineups)
CREATE TABLE IF NOT EXISTS sb_lineups (
  match_id      INT NOT NULL,
  player_id     INT NOT NULL,
  player_name   VARCHAR(150) NOT NULL,
  team_id       INT NOT NULL,
  jersey_number TINYINT UNSIGNED NULL,
  PRIMARY KEY (match_id, player_id),
  INDEX idx_sb_lineups_player (player_id),
  INDEX idx_sb_lineups_team   (match_id, team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Aggregated stats per player per match (computed from raw events at import time)
-- All per-match totals — roll up to per-season with SUM() GROUP BY
CREATE TABLE IF NOT EXISTS sb_player_match_stats (
  match_id              INT NOT NULL,
  player_id             INT NOT NULL,
  player_name           VARCHAR(150) NOT NULL,
  team_id               INT NOT NULL,
  competition_id        INT NOT NULL,
  season_id             INT NOT NULL,
  match_date            DATE NOT NULL,
  -- Shooting
  shots                 SMALLINT NOT NULL DEFAULT 0,
  shots_on_target       SMALLINT NOT NULL DEFAULT 0,
  goals                 SMALLINT NOT NULL DEFAULT 0,
  xg                    DECIMAL(6,4) NOT NULL DEFAULT 0,
  -- Passing
  passes                SMALLINT NOT NULL DEFAULT 0,
  passes_completed      SMALLINT NOT NULL DEFAULT 0,
  key_passes            SMALLINT NOT NULL DEFAULT 0,
  progressive_passes    SMALLINT NOT NULL DEFAULT 0,
  -- Carrying
  carries               SMALLINT NOT NULL DEFAULT 0,
  progressive_carries   SMALLINT NOT NULL DEFAULT 0,
  -- Dribbling
  dribbles_attempted    SMALLINT NOT NULL DEFAULT 0,
  dribbles_completed    SMALLINT NOT NULL DEFAULT 0,
  -- Defending
  pressures             SMALLINT NOT NULL DEFAULT 0,
  tackles               SMALLINT NOT NULL DEFAULT 0,
  interceptions         SMALLINT NOT NULL DEFAULT 0,
  blocks                SMALLINT NOT NULL DEFAULT 0,
  clearances            SMALLINT NOT NULL DEFAULT 0,
  -- Duels
  duels_won             SMALLINT NOT NULL DEFAULT 0,
  duels_total           SMALLINT NOT NULL DEFAULT 0,
  -- Aerial
  aerials_won           SMALLINT NOT NULL DEFAULT 0,
  aerials_total         SMALLINT NOT NULL DEFAULT 0,
  -- Fouls
  fouls_committed       SMALLINT NOT NULL DEFAULT 0,
  fouls_won             SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  INDEX idx_sb_pms_player    (player_id),
  INDEX idx_sb_pms_comp_sea  (competition_id, season_id),
  INDEX idx_sb_pms_date      (match_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
