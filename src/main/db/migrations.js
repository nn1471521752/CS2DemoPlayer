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
    PRIMARY KEY (checksum, round_number, tick, player_key),
    FOREIGN KEY (checksum) REFERENCES demos(checksum) ON DELETE CASCADE
  );
`;

const CREATE_PLAYER_POSITIONS_ROUND_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_player_positions_checksum_round_tick
  ON player_positions (checksum, round_number, tick);
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

  if (!hasColumn(database, 'round_frames', 'has_grenades')) {
    database.run(`ALTER TABLE round_frames ADD COLUMN has_grenades INTEGER NOT NULL DEFAULT 0;`);
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
