const CREATE_DEMOS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS demos (
    checksum TEXT PRIMARY KEY,
    demo_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    file_size INTEGER NOT NULL,
    file_mtime_ms INTEGER NOT NULL,
    map_name TEXT NOT NULL,
    map_raw TEXT NOT NULL,
    tickrate REAL NOT NULL,
    rounds_count INTEGER NOT NULL DEFAULT 0,
    is_parsed INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

const UPDATE_DISPLAY_NAME_SQL = `
  UPDATE demos
  SET display_name = file_name
  WHERE display_name IS NULL OR TRIM(display_name) = ''
`;

const CREATE_ROUNDS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS rounds (
    checksum TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    start_tick INTEGER NOT NULL,
    end_tick INTEGER NOT NULL,
    start_seconds REAL NOT NULL DEFAULT 0,
    end_seconds REAL NOT NULL DEFAULT 0,
    duration_seconds REAL NOT NULL DEFAULT 0,
    ct_economy TEXT NOT NULL DEFAULT 'unknown',
    t_economy TEXT NOT NULL DEFAULT 'unknown',
    ct_equip_value INTEGER NOT NULL DEFAULT 0,
    t_equip_value INTEGER NOT NULL DEFAULT 0,
    winner_team TEXT NOT NULL DEFAULT '',
    winner_reason TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (checksum, round_number),
    FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
  );
`;

const CREATE_ROUNDS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_rounds_checksum
  ON rounds (checksum);
`;

const CREATE_ROUND_FRAMES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS round_frames (
    checksum TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    start_tick INTEGER NOT NULL,
    end_tick INTEGER NOT NULL,
    tickrate REAL NOT NULL DEFAULT 64,
    has_grenades INTEGER NOT NULL DEFAULT 0,
    team_display_json TEXT NOT NULL DEFAULT '{}',
    frames_json TEXT NOT NULL,
    frames_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (checksum, round_number),
    FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
  );
`;

const CREATE_ROUND_FRAMES_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_round_frames_checksum
  ON round_frames (checksum);
`;

const CREATE_PLAYER_POSITIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS player_positions (
    checksum TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    player_key TEXT NOT NULL,
    user_id INTEGER NOT NULL DEFAULT 0,
    player_name TEXT NOT NULL DEFAULT '',
    team_num INTEGER NOT NULL DEFAULT 0,
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    yaw REAL NOT NULL DEFAULT 0,
    is_alive INTEGER NOT NULL DEFAULT 0,
    health INTEGER NOT NULL DEFAULT 0,
    balance INTEGER NOT NULL DEFAULT 0,
    active_weapon_name TEXT NOT NULL DEFAULT '',
    inventory_json TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (checksum, round_number, tick, player_key),
    FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
  );
`;

const CREATE_PLAYER_POSITIONS_ROUND_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_player_positions_checksum_round_tick
  ON player_positions (checksum, round_number, tick);
`;

const CREATE_ROUND_KILLS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS round_kills (
    checksum TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    row_index INTEGER NOT NULL,
    attacker_name TEXT NOT NULL DEFAULT '',
    victim_name TEXT NOT NULL DEFAULT '',
    weapon TEXT NOT NULL DEFAULT '',
    headshot INTEGER NOT NULL DEFAULT 0,
    assister_name TEXT NOT NULL DEFAULT '',
    attacker_team_num INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (checksum, round_number, tick, row_index),
    FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
  );
`;

const CREATE_ROUND_KILLS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_round_kills_checksum_round_tick
  ON round_kills (checksum, round_number, tick);
`;

const CREATE_ROUND_SHOTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS round_shots (
    checksum TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    row_index INTEGER NOT NULL,
    shooter_name TEXT NOT NULL DEFAULT '',
    shooter_steamid TEXT NOT NULL DEFAULT '',
    shooter_team_num INTEGER NOT NULL DEFAULT 0,
    weapon TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (checksum, round_number, tick, row_index),
    FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
  );
`;

const CREATE_ROUND_SHOTS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_round_shots_checksum_round_tick
  ON round_shots (checksum, round_number, tick);
`;

const CREATE_ROUND_BLINDS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS round_blinds (
    checksum TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    row_index INTEGER NOT NULL,
    attacker_name TEXT NOT NULL DEFAULT '',
    attacker_steamid TEXT NOT NULL DEFAULT '',
    attacker_team_num INTEGER NOT NULL DEFAULT 0,
    victim_name TEXT NOT NULL DEFAULT '',
    victim_steamid TEXT NOT NULL DEFAULT '',
    victim_team_num INTEGER NOT NULL DEFAULT 0,
    blind_duration REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (checksum, round_number, tick, row_index),
    FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
  );
`;

const CREATE_ROUND_BLINDS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_round_blinds_checksum_round_tick
  ON round_blinds (checksum, round_number, tick);
`;

const CREATE_ROUND_DAMAGES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS round_damages (
    checksum TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    row_index INTEGER NOT NULL,
    attacker_name TEXT NOT NULL DEFAULT '',
    attacker_steamid TEXT NOT NULL DEFAULT '',
    attacker_team_num INTEGER NOT NULL DEFAULT 0,
    victim_name TEXT NOT NULL DEFAULT '',
    victim_steamid TEXT NOT NULL DEFAULT '',
    victim_team_num INTEGER NOT NULL DEFAULT 0,
    weapon TEXT NOT NULL DEFAULT '',
    hitgroup TEXT NOT NULL DEFAULT '',
    dmg_health INTEGER NOT NULL DEFAULT 0,
    dmg_armor INTEGER NOT NULL DEFAULT 0,
    health INTEGER NOT NULL DEFAULT 0,
    armor INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (checksum, round_number, tick, row_index),
    FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
  );
`;

const CREATE_ROUND_DAMAGES_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_round_damages_checksum_round_tick
  ON round_damages (checksum, round_number, tick);
`;

const CREATE_ROUND_GRENADES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS round_grenades (
    checksum TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    row_index INTEGER NOT NULL,
    entity_id INTEGER NOT NULL DEFAULT 0,
    grenade_type TEXT NOT NULL DEFAULT '',
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    z REAL NOT NULL DEFAULT 0,
    thrower_name TEXT NOT NULL DEFAULT '',
    thrower_steamid TEXT NOT NULL DEFAULT '',
    thrower_team_num INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (checksum, round_number, tick, row_index),
    FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
  );
`;

const CREATE_ROUND_GRENADES_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_round_grenades_checksum_round_tick
  ON round_grenades (checksum, round_number, tick);
`;

const CREATE_ROUND_GRENADE_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS round_grenade_events (
    checksum TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    row_index INTEGER NOT NULL,
    event_type TEXT NOT NULL DEFAULT '',
    grenade_type TEXT NOT NULL DEFAULT '',
    entity_id INTEGER NOT NULL DEFAULT 0,
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    z REAL NOT NULL DEFAULT 0,
    thrower_name TEXT NOT NULL DEFAULT '',
    thrower_steamid TEXT NOT NULL DEFAULT '',
    thrower_team_num INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (checksum, round_number, tick, row_index),
    FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
  );
`;

const CREATE_ROUND_GRENADE_EVENTS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_round_grenade_events_checksum_round_tick
  ON round_grenade_events (checksum, round_number, tick);
`;

const CREATE_ROUND_BOMB_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS round_bomb_events (
    checksum TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    row_index INTEGER NOT NULL,
    event_type TEXT NOT NULL DEFAULT '',
    site INTEGER NOT NULL DEFAULT 0,
    user_name TEXT NOT NULL DEFAULT '',
    user_steamid TEXT NOT NULL DEFAULT '',
    team_num INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (checksum, round_number, tick, row_index),
    FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
  );
`;

const CREATE_ROUND_BOMB_EVENTS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_round_bomb_events_checksum_round_tick
  ON round_bomb_events (checksum, round_number, tick);
`;

const CREATE_ROUND_CLOCK_STATES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS round_clock_states (
    checksum TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    phase TEXT NOT NULL DEFAULT 'round',
    label TEXT NOT NULL DEFAULT 'Round',
    remaining_seconds REAL NOT NULL DEFAULT 0,
    total_seconds REAL NOT NULL DEFAULT 0,
    is_paused INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (checksum, round_number, tick),
    FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
  );
`;

const CREATE_ROUND_CLOCK_STATES_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_round_clock_states_checksum_round_tick
  ON round_clock_states (checksum, round_number, tick);
`;

const CREATE_ENTITY_REGISTRY_META_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS entity_registry_meta (
    meta_key TEXT PRIMARY KEY,
    meta_value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );
`;

const CREATE_TEAMS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS teams (
    team_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    normalized_name TEXT NOT NULL DEFAULT '',
    demo_count INTEGER NOT NULL DEFAULT 0,
    approved_at TEXT NOT NULL DEFAULT '',
    last_seen_at TEXT NOT NULL DEFAULT '',
    hltv_team_url TEXT NOT NULL DEFAULT '',
    hltv_logo_path TEXT NOT NULL DEFAULT '',
    hltv_logo_updated_at TEXT NOT NULL DEFAULT ''
  );
`;

const CREATE_TEAMS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_teams_normalized_name
  ON teams (normalized_name);
`;

const CREATE_PLAYERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS players (
    steamid TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    last_team_key TEXT NOT NULL DEFAULT '',
    last_team_name TEXT NOT NULL DEFAULT '',
    demo_count INTEGER NOT NULL DEFAULT 0,
    approved_at TEXT NOT NULL DEFAULT '',
    last_seen_at TEXT NOT NULL DEFAULT ''
  );
`;

const CREATE_PLAYERS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_players_last_team_key
  ON players (last_team_key);
`;

const CREATE_TEAM_CANDIDATES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS team_candidates (
    team_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    normalized_name TEXT NOT NULL DEFAULT '',
    evidence_hash TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'pending',
    demo_count INTEGER NOT NULL DEFAULT 0,
    last_demo_checksum TEXT NOT NULL DEFAULT '',
    last_demo_name TEXT NOT NULL DEFAULT '',
    last_seen_at TEXT NOT NULL DEFAULT '',
    last_scanned_at TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT NOT NULL DEFAULT ''
  );
`;

const CREATE_TEAM_CANDIDATES_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_team_candidates_state
  ON team_candidates (state, last_scanned_at);
`;

const CREATE_PLAYER_CANDIDATES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS player_candidates (
    steamid TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    last_team_key TEXT NOT NULL DEFAULT '',
    last_team_name TEXT NOT NULL DEFAULT '',
    evidence_hash TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'pending',
    demo_count INTEGER NOT NULL DEFAULT 0,
    last_demo_checksum TEXT NOT NULL DEFAULT '',
    last_demo_name TEXT NOT NULL DEFAULT '',
    last_seen_at TEXT NOT NULL DEFAULT '',
    last_scanned_at TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT NOT NULL DEFAULT ''
  );
`;

const CREATE_PLAYER_CANDIDATES_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_player_candidates_state
  ON player_candidates (state, last_scanned_at);
`;

const CREATE_TEAM_DEMO_LINKS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS team_demo_links (
    team_key TEXT NOT NULL,
    checksum TEXT NOT NULL,
    first_seen_at TEXT NOT NULL DEFAULT '',
    last_seen_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (team_key, checksum),
    FOREIGN KEY (team_key) REFERENCES teams(team_key) ON DELETE CASCADE,
    FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
  );
`;

const CREATE_TEAM_DEMO_LINKS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_team_demo_links_checksum
  ON team_demo_links (checksum);
`;

const CREATE_PLAYER_DEMO_LINKS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS player_demo_links (
    steamid TEXT NOT NULL,
    checksum TEXT NOT NULL,
    team_key TEXT NOT NULL DEFAULT '',
    first_seen_at TEXT NOT NULL DEFAULT '',
    last_seen_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (steamid, checksum),
    FOREIGN KEY (steamid) REFERENCES players(steamid) ON DELETE CASCADE,
    FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
  );
`;

const CREATE_PLAYER_DEMO_LINKS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_player_demo_links_checksum
  ON player_demo_links (checksum);
`;

const DROP_HLTV_ANALYSIS_QUEUE_INDEX_SQL = `
  DROP INDEX IF EXISTS idx_hltv_analysis_queue_status_updated_at;
`;

const DROP_HLTV_ANALYSIS_QUEUE_TABLE_SQL = `
  DROP TABLE IF EXISTS hltv_analysis_queue;
`;

const DROP_HLTV_INSPIRATION_CARDS_INDEX_SQL = `
  DROP INDEX IF EXISTS idx_hltv_inspiration_cards_updated_at;
`;

const DROP_HLTV_INSPIRATION_CARDS_TABLE_SQL = `
  DROP TABLE IF EXISTS hltv_inspiration_cards;
`;

const CREATE_HLTV_MATCHES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS hltv_matches (
    match_id TEXT PRIMARY KEY,
    match_url TEXT NOT NULL DEFAULT '',
    team1_id TEXT NOT NULL DEFAULT '',
    team1_name TEXT NOT NULL DEFAULT '',
    team2_id TEXT NOT NULL DEFAULT '',
    team2_name TEXT NOT NULL DEFAULT '',
    team1_score INTEGER,
    team2_score INTEGER,
    event_id TEXT NOT NULL DEFAULT '',
    event_name TEXT NOT NULL DEFAULT '',
    match_format TEXT NOT NULL DEFAULT '',
    match_time_label TEXT NOT NULL DEFAULT '',
    match_timestamp_ms INTEGER,
    hltv_star_rating INTEGER NOT NULL DEFAULT 0,
    has_demo INTEGER NOT NULL DEFAULT 0,
    downloaded_demo_path TEXT NOT NULL DEFAULT '',
    downloaded_file_size INTEGER NOT NULL DEFAULT 0,
    playable_demo_paths_json TEXT NOT NULL DEFAULT '[]',
    added_to_game_library_at TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'hltv',
    first_seen_at TEXT NOT NULL DEFAULT '',
    last_seen_at TEXT NOT NULL DEFAULT '',
    cache_updated_at TEXT NOT NULL DEFAULT ''
  );
`;

const CREATE_HLTV_MATCHES_HAS_DEMO_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_hltv_matches_has_demo
  ON hltv_matches (has_demo);
`;

const CREATE_HLTV_MATCHES_CACHE_UPDATED_AT_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_hltv_matches_cache_updated_at
  ON hltv_matches (cache_updated_at);
`;

const CREATE_HLTV_MATCHES_TEAM1_NAME_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_hltv_matches_team1_name
  ON hltv_matches (team1_name);
`;

const CREATE_HLTV_MATCHES_TEAM2_NAME_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_hltv_matches_team2_name
  ON hltv_matches (team2_name);
`;

const CREATE_HLTV_MATCHES_EVENT_NAME_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_hltv_matches_event_name
  ON hltv_matches (event_name);
`;

const CREATE_HLTV_MATCH_MAPS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS hltv_match_maps (
    match_id TEXT NOT NULL,
    map_index INTEGER NOT NULL DEFAULT 0,
    map_name TEXT NOT NULL DEFAULT '',
    map_slug TEXT NOT NULL DEFAULT '',
    team1_score INTEGER,
    team2_score INTEGER,
    demo_url TEXT NOT NULL DEFAULT '',
    demo_file_name TEXT NOT NULL DEFAULT '',
    local_demo_path TEXT NOT NULL DEFAULT '',
    parsed_demo_checksum TEXT NOT NULL DEFAULT '',
    cache_updated_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (match_id, map_index),
    FOREIGN KEY (match_id) REFERENCES hltv_matches(match_id) ON DELETE CASCADE
  );
`;

const CREATE_HLTV_MATCH_MAPS_MAP_SLUG_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_hltv_match_maps_map_slug
  ON hltv_match_maps (map_slug);
`;

const CREATE_HLTV_MATCH_MAPS_MATCH_ID_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_hltv_match_maps_match_id
  ON hltv_match_maps (match_id);
`;

const CREATE_HLTV_MATCH_MAPS_LOCAL_DEMO_PATH_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_hltv_match_maps_local_demo_path
  ON hltv_match_maps (local_demo_path);
`;

const CREATE_HLTV_TEAMS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS hltv_teams (
    team_id TEXT PRIMARY KEY,
    team_url TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    normalized_name TEXT NOT NULL DEFAULT '',
    logo_url TEXT NOT NULL DEFAULT '',
    logo_path TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    ranking INTEGER,
    related_match_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL DEFAULT '',
    last_seen_at TEXT NOT NULL DEFAULT '',
    cache_updated_at TEXT NOT NULL DEFAULT ''
  );
`;

const CREATE_HLTV_TEAMS_NORMALIZED_NAME_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_hltv_teams_normalized_name
  ON hltv_teams (normalized_name);
`;

const CREATE_HLTV_PLAYERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS hltv_players (
    player_id TEXT PRIMARY KEY,
    player_url TEXT NOT NULL DEFAULT '',
    nickname TEXT NOT NULL DEFAULT '',
    real_name TEXT NOT NULL DEFAULT '',
    normalized_nickname TEXT NOT NULL DEFAULT '',
    team_id TEXT NOT NULL DEFAULT '',
    team_name TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    related_match_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL DEFAULT '',
    last_seen_at TEXT NOT NULL DEFAULT '',
    cache_updated_at TEXT NOT NULL DEFAULT ''
  );
`;

const CREATE_HLTV_PLAYERS_NORMALIZED_NICKNAME_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_hltv_players_normalized_nickname
  ON hltv_players (normalized_nickname);
`;

const CREATE_HLTV_PLAYERS_TEAM_ID_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_hltv_players_team_id
  ON hltv_players (team_id);
`;

const CREATE_PLAYBOOK_MAPS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS playbook_maps (
    map_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    radar_image_path TEXT NOT NULL DEFAULT '',
    has_radar_image INTEGER NOT NULL DEFAULT 0,
    pos_x REAL NOT NULL DEFAULT 0,
    pos_y REAL NOT NULL DEFAULT 0,
    scale REAL NOT NULL DEFAULT 0,
    threshold_z REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'map-meta',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );
`;

const CREATE_PLAYBOOK_MAPS_DISPLAY_NAME_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_playbook_maps_display_name
  ON playbook_maps (display_name);
`;

const CREATE_PLAYBOOK_GRENADES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS playbook_grenades (
    grenade_id TEXT PRIMARY KEY,
    source_demo_checksum TEXT NOT NULL DEFAULT '',
    source_round_number INTEGER NOT NULL DEFAULT 0,
    source_entity_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    map_id TEXT NOT NULL DEFAULT '',
    grenade_type TEXT NOT NULL DEFAULT '',
    side TEXT NOT NULL DEFAULT 'unknown',
    thrower_name TEXT NOT NULL DEFAULT '',
    thrower_steamid TEXT NOT NULL DEFAULT '',
    thrower_team_num INTEGER NOT NULL DEFAULT 0,
    throw_tick INTEGER NOT NULL DEFAULT 0,
    detonate_tick INTEGER NOT NULL DEFAULT 0,
    start_x REAL NOT NULL DEFAULT 0,
    start_y REAL NOT NULL DEFAULT 0,
    start_z REAL NOT NULL DEFAULT 0,
    end_x REAL NOT NULL DEFAULT 0,
    end_y REAL NOT NULL DEFAULT 0,
    end_z REAL NOT NULL DEFAULT 0,
    trajectory_json TEXT NOT NULL DEFAULT '[]',
    tags_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    markdown_path TEXT NOT NULL DEFAULT '',
    sync_mode TEXT NOT NULL DEFAULT 'sqlite-local',
    content_hash TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    UNIQUE(source_demo_checksum, source_round_number, source_entity_id),
    FOREIGN KEY (map_id) REFERENCES playbook_maps(map_id) ON DELETE SET DEFAULT
  );
`;

const CREATE_PLAYBOOK_GRENADES_SOURCE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_playbook_grenades_source
  ON playbook_grenades (source_demo_checksum, source_round_number);
`;

const CREATE_PLAYBOOK_GRENADES_MAP_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_playbook_grenades_map
  ON playbook_grenades (map_id, grenade_type);
`;

const MIGRATION_BATCH = [
  CREATE_DEMOS_TABLE_SQL,
  UPDATE_DISPLAY_NAME_SQL,
  CREATE_ROUNDS_TABLE_SQL,
  CREATE_ROUNDS_INDEX_SQL,
  CREATE_ROUND_FRAMES_TABLE_SQL,
  CREATE_ROUND_FRAMES_INDEX_SQL,
  CREATE_PLAYER_POSITIONS_TABLE_SQL,
  CREATE_PLAYER_POSITIONS_ROUND_INDEX_SQL,
  CREATE_ROUND_KILLS_TABLE_SQL,
  CREATE_ROUND_KILLS_INDEX_SQL,
  CREATE_ROUND_SHOTS_TABLE_SQL,
  CREATE_ROUND_SHOTS_INDEX_SQL,
  CREATE_ROUND_BLINDS_TABLE_SQL,
  CREATE_ROUND_BLINDS_INDEX_SQL,
  CREATE_ROUND_DAMAGES_TABLE_SQL,
  CREATE_ROUND_DAMAGES_INDEX_SQL,
  CREATE_ROUND_GRENADES_TABLE_SQL,
  CREATE_ROUND_GRENADES_INDEX_SQL,
  CREATE_ROUND_GRENADE_EVENTS_TABLE_SQL,
  CREATE_ROUND_GRENADE_EVENTS_INDEX_SQL,
  CREATE_ROUND_BOMB_EVENTS_TABLE_SQL,
  CREATE_ROUND_BOMB_EVENTS_INDEX_SQL,
  CREATE_ROUND_CLOCK_STATES_TABLE_SQL,
  CREATE_ROUND_CLOCK_STATES_INDEX_SQL,
  CREATE_ENTITY_REGISTRY_META_TABLE_SQL,
  CREATE_TEAMS_TABLE_SQL,
  CREATE_TEAMS_INDEX_SQL,
  CREATE_PLAYERS_TABLE_SQL,
  CREATE_PLAYERS_INDEX_SQL,
  CREATE_TEAM_CANDIDATES_TABLE_SQL,
  CREATE_TEAM_CANDIDATES_INDEX_SQL,
  CREATE_PLAYER_CANDIDATES_TABLE_SQL,
  CREATE_PLAYER_CANDIDATES_INDEX_SQL,
  CREATE_TEAM_DEMO_LINKS_TABLE_SQL,
  CREATE_TEAM_DEMO_LINKS_INDEX_SQL,
  CREATE_PLAYER_DEMO_LINKS_TABLE_SQL,
  CREATE_PLAYER_DEMO_LINKS_INDEX_SQL,
  DROP_HLTV_ANALYSIS_QUEUE_INDEX_SQL,
  DROP_HLTV_ANALYSIS_QUEUE_TABLE_SQL,
  DROP_HLTV_INSPIRATION_CARDS_INDEX_SQL,
  DROP_HLTV_INSPIRATION_CARDS_TABLE_SQL,
  CREATE_HLTV_MATCHES_TABLE_SQL,
  CREATE_HLTV_MATCHES_HAS_DEMO_INDEX_SQL,
  CREATE_HLTV_MATCHES_CACHE_UPDATED_AT_INDEX_SQL,
  CREATE_HLTV_MATCHES_TEAM1_NAME_INDEX_SQL,
  CREATE_HLTV_MATCHES_TEAM2_NAME_INDEX_SQL,
  CREATE_HLTV_MATCHES_EVENT_NAME_INDEX_SQL,
  CREATE_HLTV_MATCH_MAPS_TABLE_SQL,
  CREATE_HLTV_MATCH_MAPS_MAP_SLUG_INDEX_SQL,
  CREATE_HLTV_MATCH_MAPS_MATCH_ID_INDEX_SQL,
  CREATE_HLTV_MATCH_MAPS_LOCAL_DEMO_PATH_INDEX_SQL,
  CREATE_HLTV_TEAMS_TABLE_SQL,
  CREATE_HLTV_TEAMS_NORMALIZED_NAME_INDEX_SQL,
  CREATE_HLTV_PLAYERS_TABLE_SQL,
  CREATE_HLTV_PLAYERS_NORMALIZED_NICKNAME_INDEX_SQL,
  CREATE_HLTV_PLAYERS_TEAM_ID_INDEX_SQL,
  CREATE_PLAYBOOK_MAPS_TABLE_SQL,
  CREATE_PLAYBOOK_MAPS_DISPLAY_NAME_INDEX_SQL,
  CREATE_PLAYBOOK_GRENADES_TABLE_SQL,
  CREATE_PLAYBOOK_GRENADES_SOURCE_INDEX_SQL,
  CREATE_PLAYBOOK_GRENADES_MAP_INDEX_SQL,
];

function runBatch(database, statements) {
  for (const statement of statements) {
    database.run(statement);
  }
}

function ensureColumns(database, hasColumn) {
  if (!hasColumn(database, 'demos', 'display_name')) {
    database.run(`ALTER TABLE demos ADD COLUMN display_name TEXT NOT NULL DEFAULT '';`);
  }

  if (!hasColumn(database, 'rounds', 'ct_economy')) {
    database.run(`ALTER TABLE rounds ADD COLUMN ct_economy TEXT NOT NULL DEFAULT 'unknown';`);
  }

  if (!hasColumn(database, 'rounds', 't_economy')) {
    database.run(`ALTER TABLE rounds ADD COLUMN t_economy TEXT NOT NULL DEFAULT 'unknown';`);
  }

  if (!hasColumn(database, 'rounds', 'ct_equip_value')) {
    database.run(`ALTER TABLE rounds ADD COLUMN ct_equip_value INTEGER NOT NULL DEFAULT 0;`);
  }

  if (!hasColumn(database, 'rounds', 't_equip_value')) {
    database.run(`ALTER TABLE rounds ADD COLUMN t_equip_value INTEGER NOT NULL DEFAULT 0;`);
  }

  if (!hasColumn(database, 'rounds', 'winner_team')) {
    database.run(`ALTER TABLE rounds ADD COLUMN winner_team TEXT NOT NULL DEFAULT '';`);
  }

  if (!hasColumn(database, 'rounds', 'winner_reason')) {
    database.run(`ALTER TABLE rounds ADD COLUMN winner_reason TEXT NOT NULL DEFAULT '';`);
  }

  if (!hasColumn(database, 'round_frames', 'has_grenades')) {
    database.run(`ALTER TABLE round_frames ADD COLUMN has_grenades INTEGER NOT NULL DEFAULT 0;`);
  }

  if (!hasColumn(database, 'round_frames', 'team_display_json')) {
    database.run(`ALTER TABLE round_frames ADD COLUMN team_display_json TEXT NOT NULL DEFAULT '{}';`);
  }

  if (!hasColumn(database, 'player_positions', 'inventory_json')) {
    database.run(`ALTER TABLE player_positions ADD COLUMN inventory_json TEXT NOT NULL DEFAULT '[]';`);
  }

  if (!hasColumn(database, 'teams', 'demo_count')) {
    database.run(`ALTER TABLE teams ADD COLUMN demo_count INTEGER NOT NULL DEFAULT 0;`);
  }

  if (!hasColumn(database, 'teams', 'hltv_team_url')) {
    database.run(`ALTER TABLE teams ADD COLUMN hltv_team_url TEXT NOT NULL DEFAULT '';`);
  }

  if (!hasColumn(database, 'teams', 'hltv_logo_path')) {
    database.run(`ALTER TABLE teams ADD COLUMN hltv_logo_path TEXT NOT NULL DEFAULT '';`);
  }

  if (!hasColumn(database, 'teams', 'hltv_logo_updated_at')) {
    database.run(`ALTER TABLE teams ADD COLUMN hltv_logo_updated_at TEXT NOT NULL DEFAULT '';`);
  }

  if (!hasColumn(database, 'players', 'last_team_name')) {
    database.run(`ALTER TABLE players ADD COLUMN last_team_name TEXT NOT NULL DEFAULT '';`);
  }

  if (!hasColumn(database, 'players', 'demo_count')) {
    database.run(`ALTER TABLE players ADD COLUMN demo_count INTEGER NOT NULL DEFAULT 0;`);
  }

  if (!hasColumn(database, 'hltv_matches', 'hltv_star_rating')) {
    database.run(`ALTER TABLE hltv_matches ADD COLUMN hltv_star_rating INTEGER NOT NULL DEFAULT 0;`);
  }

  if (!hasColumn(database, 'hltv_matches', 'added_to_game_library_at')) {
    database.run(`ALTER TABLE hltv_matches ADD COLUMN added_to_game_library_at TEXT NOT NULL DEFAULT '';`);
  }

  if (!hasColumn(database, 'playbook_grenades', 'markdown_path')) {
    database.run(`ALTER TABLE playbook_grenades ADD COLUMN markdown_path TEXT NOT NULL DEFAULT '';`);
  }

  if (!hasColumn(database, 'playbook_grenades', 'sync_mode')) {
    database.run(`ALTER TABLE playbook_grenades ADD COLUMN sync_mode TEXT NOT NULL DEFAULT 'sqlite-local';`);
  }

  if (!hasColumn(database, 'playbook_grenades', 'content_hash')) {
    database.run(`ALTER TABLE playbook_grenades ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';`);
  }

  if (!hasColumn(database, 'playbook_grenades', 'indexed_at')) {
    database.run(`ALTER TABLE playbook_grenades ADD COLUMN indexed_at TEXT NOT NULL DEFAULT '';`);
  }
}

function runMigrations(database, hasColumn) {
  database.run('PRAGMA foreign_keys = ON;');
  runBatch(database, MIGRATION_BATCH);
  ensureColumns(database, hasColumn);
}

module.exports = {
  runMigrations,
};
