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
    approved_at TEXT NOT NULL DEFAULT '',
    last_seen_at TEXT NOT NULL DEFAULT ''
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
}

function runMigrations(database, hasColumn) {
  database.run('PRAGMA foreign_keys = ON;');
  runBatch(database, MIGRATION_BATCH);
  ensureColumns(database, hasColumn);
}

module.exports = {
  runMigrations,
};
