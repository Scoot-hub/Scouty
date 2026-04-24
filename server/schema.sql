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
  UNIQUE KEY uniq_users_email (email(191))
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
