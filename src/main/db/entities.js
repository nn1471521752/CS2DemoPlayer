function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeIsoTimestamp(value) {
  const normalized = normalizeText(value);
  return normalized || new Date().toISOString();
}

function normalizeStringArray(values) {
  return Array.isArray(values)
    ? values.map((value) => normalizeText(value)).filter(Boolean)
    : [];
}

function mapTeamCandidateRow(row = {}) {
  return {
    teamKey: normalizeText(row.team_key),
    displayName: normalizeText(row.display_name),
    normalizedName: normalizeText(row.normalized_name),
    evidenceHash: normalizeText(row.evidence_hash),
    state: normalizeText(row.state) || 'pending',
    demoCount: normalizeInteger(row.demo_count, 0),
    lastDemoChecksum: normalizeText(row.last_demo_checksum),
    lastDemoName: normalizeText(row.last_demo_name),
    lastSeenAt: normalizeText(row.last_seen_at),
    lastScannedAt: normalizeText(row.last_scanned_at),
    reviewedAt: normalizeText(row.reviewed_at),
  };
}

function mapPlayerCandidateRow(row = {}) {
  return {
    steamid: normalizeText(row.steamid),
    displayName: normalizeText(row.display_name),
    lastTeamKey: normalizeText(row.last_team_key),
    lastTeamName: normalizeText(row.last_team_name),
    evidenceHash: normalizeText(row.evidence_hash),
    state: normalizeText(row.state) || 'pending',
    demoCount: normalizeInteger(row.demo_count, 0),
    lastDemoChecksum: normalizeText(row.last_demo_checksum),
    lastDemoName: normalizeText(row.last_demo_name),
    lastSeenAt: normalizeText(row.last_seen_at),
    lastScannedAt: normalizeText(row.last_scanned_at),
    reviewedAt: normalizeText(row.reviewed_at),
  };
}

function mapTeamRow(row = {}) {
  return {
    teamKey: normalizeText(row.team_key),
    displayName: normalizeText(row.display_name),
    normalizedName: normalizeText(row.normalized_name),
    demoCount: normalizeInteger(row.demo_count, 0),
    approvedAt: normalizeText(row.approved_at),
    lastSeenAt: normalizeText(row.last_seen_at),
    hltvTeamUrl: normalizeText(row.hltv_team_url),
    hltvLogoPath: normalizeText(row.hltv_logo_path),
    hltvLogoUpdatedAt: normalizeText(row.hltv_logo_updated_at),
  };
}

function mapPlayerRow(row = {}) {
  return {
    steamid: normalizeText(row.steamid),
    displayName: normalizeText(row.display_name),
    lastTeamKey: normalizeText(row.last_team_key),
    lastTeamName: normalizeText(row.last_team_name),
    demoCount: normalizeInteger(row.demo_count, 0),
    approvedAt: normalizeText(row.approved_at),
    lastSeenAt: normalizeText(row.last_seen_at),
  };
}

function parseJsonObject(value, fallback = {}) {
  const rawValue = normalizeText(value);
  if (!rawValue) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
}

function parseJsonArray(value) {
  const rawValue = normalizeText(value);
  if (!rawValue) {
    return [];
  }
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function runInTransaction(database, transactionBody) {
  database.run('BEGIN TRANSACTION');
  try {
    transactionBody();
    database.run('COMMIT');
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch (_rollbackError) {
      // noop
    }
    throw error;
  }
}

async function listParsedDemoEntityInputs(context) {
  const database = await context.getDatabase();
  const rows = context.getAll(
    database,
    `
      SELECT
        demos.checksum AS checksum,
        demos.display_name AS display_name,
        demos.file_name AS file_name,
        demos.updated_at AS demo_updated_at,
        round_frames.team_display_json AS team_display_json,
        round_frames.frames_json AS frames_json,
        round_frames.updated_at AS round_updated_at
      FROM demos
      INNER JOIN round_frames
        ON round_frames.checksum = demos.checksum
      WHERE demos.is_parsed = 1
        AND round_frames.frames_count > 0
      ORDER BY demos.updated_at DESC, round_frames.round_number ASC
    `,
  );

  const demosByChecksum = new Map();
  rows.forEach((row) => {
    const checksum = normalizeText(row.checksum);
    if (!checksum) {
      return;
    }

    if (!demosByChecksum.has(checksum)) {
      demosByChecksum.set(checksum, {
        checksum,
        displayName: normalizeText(row.display_name) || normalizeText(row.file_name),
        updatedAt: normalizeText(row.demo_updated_at) || normalizeText(row.round_updated_at),
        teamDisplay: {},
        frames: [],
      });
    }

    const entry = demosByChecksum.get(checksum);
    const roundUpdatedAt = normalizeText(row.round_updated_at);
    if (roundUpdatedAt && (!entry.updatedAt || roundUpdatedAt > entry.updatedAt)) {
      entry.updatedAt = roundUpdatedAt;
    }

    Object.assign(entry.teamDisplay, parseJsonObject(row.team_display_json, {}));
    entry.frames.push(...parseJsonArray(row.frames_json));
  });

  return [...demosByChecksum.values()];
}

async function getEntityRegistryMeta(context, metaKey) {
  const database = await context.getDatabase();
  const row = context.getOne(
    database,
    `
      SELECT meta_value
      FROM entity_registry_meta
      WHERE meta_key = ?
      LIMIT 1
    `,
    [normalizeText(metaKey)],
  );
  return normalizeText(row?.meta_value);
}

async function setEntityRegistryMeta(context, metaKey, metaValue, updatedAt = '') {
  const database = await context.getDatabase();
  database.run(
    `
      INSERT INTO entity_registry_meta (
        meta_key,
        meta_value,
        updated_at
      )
      VALUES (?, ?, ?)
      ON CONFLICT(meta_key) DO UPDATE SET
        meta_value = excluded.meta_value,
        updated_at = excluded.updated_at
    `,
    [
      normalizeText(metaKey),
      normalizeText(metaValue),
      normalizeIsoTimestamp(updatedAt),
    ],
  );
}

async function upsertTeamCandidate(context, candidate = {}) {
  const database = await context.getDatabase();
  database.run(
    `
      INSERT INTO team_candidates (
        team_key,
        display_name,
        normalized_name,
        evidence_hash,
        state,
        demo_count,
        last_demo_checksum,
        last_demo_name,
        last_seen_at,
        last_scanned_at,
        reviewed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_key) DO UPDATE SET
        display_name = excluded.display_name,
        normalized_name = excluded.normalized_name,
        evidence_hash = excluded.evidence_hash,
        state = excluded.state,
        demo_count = excluded.demo_count,
        last_demo_checksum = excluded.last_demo_checksum,
        last_demo_name = excluded.last_demo_name,
        last_seen_at = excluded.last_seen_at,
        last_scanned_at = excluded.last_scanned_at,
        reviewed_at = excluded.reviewed_at
    `,
    [
      normalizeText(candidate.teamKey),
      normalizeText(candidate.displayName),
      normalizeText(candidate.normalizedName),
      normalizeText(candidate.evidenceHash),
      normalizeText(candidate.state) || 'pending',
      normalizeInteger(candidate.demoCount, 0),
      normalizeText(candidate.lastDemoChecksum),
      normalizeText(candidate.lastDemoName),
      normalizeText(candidate.lastSeenAt),
      normalizeIsoTimestamp(candidate.lastScannedAt),
      normalizeText(candidate.reviewedAt),
    ],
  );
}

async function upsertPlayerCandidate(context, candidate = {}) {
  const database = await context.getDatabase();
  database.run(
    `
      INSERT INTO player_candidates (
        steamid,
        display_name,
        last_team_key,
        last_team_name,
        evidence_hash,
        state,
        demo_count,
        last_demo_checksum,
        last_demo_name,
        last_seen_at,
        last_scanned_at,
        reviewed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(steamid) DO UPDATE SET
        display_name = excluded.display_name,
        last_team_key = excluded.last_team_key,
        last_team_name = excluded.last_team_name,
        evidence_hash = excluded.evidence_hash,
        state = excluded.state,
        demo_count = excluded.demo_count,
        last_demo_checksum = excluded.last_demo_checksum,
        last_demo_name = excluded.last_demo_name,
        last_seen_at = excluded.last_seen_at,
        last_scanned_at = excluded.last_scanned_at,
        reviewed_at = excluded.reviewed_at
    `,
    [
      normalizeText(candidate.steamid),
      normalizeText(candidate.displayName),
      normalizeText(candidate.lastTeamKey),
      normalizeText(candidate.lastTeamName),
      normalizeText(candidate.evidenceHash),
      normalizeText(candidate.state) || 'pending',
      normalizeInteger(candidate.demoCount, 0),
      normalizeText(candidate.lastDemoChecksum),
      normalizeText(candidate.lastDemoName),
      normalizeText(candidate.lastSeenAt),
      normalizeIsoTimestamp(candidate.lastScannedAt),
      normalizeText(candidate.reviewedAt),
    ],
  );
}

async function replaceTeamCandidates(context, candidates = []) {
  const database = await context.getDatabase();
  runInTransaction(database, () => {
    database.run('DELETE FROM team_candidates');
    for (const candidate of candidates) {
      database.run(
        `
          INSERT INTO team_candidates (
            team_key,
            display_name,
            normalized_name,
            evidence_hash,
            state,
            demo_count,
            last_demo_checksum,
            last_demo_name,
            last_seen_at,
            last_scanned_at,
            reviewed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          normalizeText(candidate.teamKey),
          normalizeText(candidate.displayName),
          normalizeText(candidate.normalizedName),
          normalizeText(candidate.evidenceHash),
          normalizeText(candidate.state) || 'pending',
          normalizeInteger(candidate.demoCount, 0),
          normalizeText(candidate.lastDemoChecksum),
          normalizeText(candidate.lastDemoName),
          normalizeText(candidate.lastSeenAt),
          normalizeIsoTimestamp(candidate.lastScannedAt),
          normalizeText(candidate.reviewedAt),
        ],
      );
    }
  });
}

async function replacePlayerCandidates(context, candidates = []) {
  const database = await context.getDatabase();
  runInTransaction(database, () => {
    database.run('DELETE FROM player_candidates');
    for (const candidate of candidates) {
      database.run(
        `
          INSERT INTO player_candidates (
            steamid,
            display_name,
            last_team_key,
            last_team_name,
            evidence_hash,
            state,
            demo_count,
            last_demo_checksum,
            last_demo_name,
            last_seen_at,
            last_scanned_at,
            reviewed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          normalizeText(candidate.steamid),
          normalizeText(candidate.displayName),
          normalizeText(candidate.lastTeamKey),
          normalizeText(candidate.lastTeamName),
          normalizeText(candidate.evidenceHash),
          normalizeText(candidate.state) || 'pending',
          normalizeInteger(candidate.demoCount, 0),
          normalizeText(candidate.lastDemoChecksum),
          normalizeText(candidate.lastDemoName),
          normalizeText(candidate.lastSeenAt),
          normalizeIsoTimestamp(candidate.lastScannedAt),
          normalizeText(candidate.reviewedAt),
        ],
      );
    }
  });
}

async function listAllTeamCandidates(context) {
  const database = await context.getDatabase();
  const rows = context.getAll(
    database,
    `
      SELECT
        team_key,
        display_name,
        normalized_name,
        evidence_hash,
        state,
        demo_count,
        last_demo_checksum,
        last_demo_name,
        last_seen_at,
        last_scanned_at,
        reviewed_at
      FROM team_candidates
      ORDER BY last_scanned_at DESC, display_name ASC
    `,
  );
  return rows.map(mapTeamCandidateRow);
}

async function listPendingTeamCandidates(context) {
  const database = await context.getDatabase();
  const rows = context.getAll(
    database,
    `
      SELECT
        team_key,
        display_name,
        normalized_name,
        evidence_hash,
        state,
        demo_count,
        last_demo_checksum,
        last_demo_name,
        last_seen_at,
        last_scanned_at,
        reviewed_at
      FROM team_candidates
      WHERE state = 'pending'
      ORDER BY last_scanned_at DESC, display_name ASC
    `,
  );
  return rows.map(mapTeamCandidateRow);
}

async function listAllPlayerCandidates(context) {
  const database = await context.getDatabase();
  const rows = context.getAll(
    database,
    `
      SELECT
        steamid,
        display_name,
        last_team_key,
        last_team_name,
        evidence_hash,
        state,
        demo_count,
        last_demo_checksum,
        last_demo_name,
        last_seen_at,
        last_scanned_at,
        reviewed_at
      FROM player_candidates
      ORDER BY last_scanned_at DESC, display_name ASC
    `,
  );
  return rows.map(mapPlayerCandidateRow);
}

async function listPendingPlayerCandidates(context) {
  const database = await context.getDatabase();
  const rows = context.getAll(
    database,
    `
      SELECT
        steamid,
        display_name,
        last_team_key,
        last_team_name,
        evidence_hash,
        state,
        demo_count,
        last_demo_checksum,
        last_demo_name,
        last_seen_at,
        last_scanned_at,
        reviewed_at
      FROM player_candidates
      WHERE state = 'pending'
      ORDER BY last_scanned_at DESC, display_name ASC
    `,
  );
  return rows.map(mapPlayerCandidateRow);
}

async function approveTeamCandidates(context, teamKeys, approvedAt = '') {
  const safeTeamKeys = normalizeStringArray(teamKeys);
  if (safeTeamKeys.length === 0) {
    return;
  }

  const database = await context.getDatabase();
  const timestamp = normalizeIsoTimestamp(approvedAt);
  runInTransaction(database, () => {
    safeTeamKeys.forEach((teamKey) => {
      const row = context.getOne(
        database,
        `
          SELECT
            team_key,
            display_name,
            normalized_name,
            demo_count,
            last_seen_at
          FROM team_candidates
          WHERE team_key = ?
          LIMIT 1
        `,
        [teamKey],
      );
      if (!row) {
        return;
      }

      database.run(
        `
          INSERT INTO teams (
            team_key,
            display_name,
            normalized_name,
            demo_count,
            approved_at,
            last_seen_at,
            hltv_team_url,
            hltv_logo_path,
            hltv_logo_updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(team_key) DO UPDATE SET
            display_name = excluded.display_name,
            normalized_name = excluded.normalized_name,
            demo_count = excluded.demo_count,
            approved_at = excluded.approved_at,
            last_seen_at = excluded.last_seen_at
        `,
        [
          normalizeText(row.team_key),
          normalizeText(row.display_name),
          normalizeText(row.normalized_name),
          normalizeInteger(row.demo_count, 0),
          timestamp,
          normalizeText(row.last_seen_at),
          '',
          '',
          '',
        ],
      );

      database.run('DELETE FROM team_candidates WHERE team_key = ?', [teamKey]);
    });
  });
}

async function approvePlayerCandidates(context, steamids, approvedAt = '') {
  const safeSteamids = normalizeStringArray(steamids);
  if (safeSteamids.length === 0) {
    return;
  }

  const database = await context.getDatabase();
  const timestamp = normalizeIsoTimestamp(approvedAt);
  runInTransaction(database, () => {
    safeSteamids.forEach((steamid) => {
      const row = context.getOne(
        database,
        `
          SELECT
            steamid,
            display_name,
            last_team_key,
            last_team_name,
            demo_count,
            last_seen_at
          FROM player_candidates
          WHERE steamid = ?
          LIMIT 1
        `,
        [steamid],
      );
      if (!row) {
        return;
      }

      database.run(
        `
          INSERT INTO players (
            steamid,
            display_name,
            last_team_key,
            last_team_name,
            demo_count,
            approved_at,
            last_seen_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(steamid) DO UPDATE SET
            display_name = excluded.display_name,
            last_team_key = excluded.last_team_key,
            last_team_name = excluded.last_team_name,
            demo_count = excluded.demo_count,
            approved_at = excluded.approved_at,
            last_seen_at = excluded.last_seen_at
        `,
        [
          normalizeText(row.steamid),
          normalizeText(row.display_name),
          normalizeText(row.last_team_key),
          normalizeText(row.last_team_name),
          normalizeInteger(row.demo_count, 0),
          timestamp,
          normalizeText(row.last_seen_at),
        ],
      );

      database.run('DELETE FROM player_candidates WHERE steamid = ?', [steamid]);
    });
  });
}

async function ignoreTeamCandidates(context, teamKeys, reviewedAt = '') {
  const safeTeamKeys = normalizeStringArray(teamKeys);
  if (safeTeamKeys.length === 0) {
    return;
  }

  const database = await context.getDatabase();
  const timestamp = normalizeIsoTimestamp(reviewedAt);
  safeTeamKeys.forEach((teamKey) => {
    database.run(
      `
        UPDATE team_candidates
        SET state = 'ignored',
            reviewed_at = ?
        WHERE team_key = ?
      `,
      [timestamp, teamKey],
    );
  });
}

async function ignorePlayerCandidates(context, steamids, reviewedAt = '') {
  const safeSteamids = normalizeStringArray(steamids);
  if (safeSteamids.length === 0) {
    return;
  }

  const database = await context.getDatabase();
  const timestamp = normalizeIsoTimestamp(reviewedAt);
  safeSteamids.forEach((steamid) => {
    database.run(
      `
        UPDATE player_candidates
        SET state = 'ignored',
            reviewed_at = ?
        WHERE steamid = ?
      `,
      [timestamp, steamid],
    );
  });
}

async function setTeamLogoMetadata(context, teamKey, metadata = {}) {
  const normalizedTeamKey = normalizeText(teamKey);
  if (!normalizedTeamKey) {
    return;
  }

  const database = await context.getDatabase();
  database.run(
    `
      UPDATE teams
      SET hltv_team_url = ?,
          hltv_logo_path = ?,
          hltv_logo_updated_at = ?
      WHERE team_key = ?
    `,
    [
      normalizeText(metadata.hltvTeamUrl),
      normalizeText(metadata.hltvLogoPath),
      normalizeText(metadata.hltvLogoUpdatedAt),
      normalizedTeamKey,
    ],
  );
}

async function listApprovedTeams(context) {
  const database = await context.getDatabase();
  const rows = context.getAll(
    database,
    `
      SELECT
        team_key,
        display_name,
        normalized_name,
        demo_count,
        approved_at,
        last_seen_at,
        hltv_team_url,
        hltv_logo_path,
        hltv_logo_updated_at
      FROM teams
      ORDER BY display_name ASC
    `,
  );
  return rows.map(mapTeamRow);
}

async function listApprovedPlayers(context) {
  const database = await context.getDatabase();
  const rows = context.getAll(
    database,
    `
      SELECT
        steamid,
        display_name,
        last_team_key,
        last_team_name,
        demo_count,
        approved_at,
        last_seen_at
      FROM players
      ORDER BY display_name ASC
    `,
  );
  return rows.map(mapPlayerRow);
}

module.exports = {
  approvePlayerCandidates,
  approveTeamCandidates,
  getEntityRegistryMeta,
  ignorePlayerCandidates,
  ignoreTeamCandidates,
  listParsedDemoEntityInputs,
  listAllPlayerCandidates,
  listAllTeamCandidates,
  listApprovedPlayers,
  listApprovedTeams,
  listPendingPlayerCandidates,
  listPendingTeamCandidates,
  replacePlayerCandidates,
  replaceTeamCandidates,
  setTeamLogoMetadata,
  setEntityRegistryMeta,
  upsertPlayerCandidate,
  upsertTeamCandidate,
};
