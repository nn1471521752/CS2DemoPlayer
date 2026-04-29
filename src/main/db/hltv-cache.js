const {
  normalizeHltvCacheMap,
  normalizeHltvCacheMatch,
  normalizeHltvCachePlayer,
  normalizeHltvCacheTeam,
  normalizeLocalLibraryFilters,
  normalizeText,
} = require('../hltv-cache-utils');

async function persistHltvCacheIfAvailable(context, database) {
  if (typeof context?.persistDatabase === 'function') {
    await context.persistDatabase(database);
  }
}

function mapHltvMapRow(row = {}) {
  return {
    matchId: normalizeText(row.match_id),
    mapIndex: Number(row.map_index) || 0,
    mapName: normalizeText(row.map_name),
    mapSlug: normalizeText(row.map_slug),
    team1Score: row.team1_score === null || row.team1_score === undefined ? null : Number(row.team1_score),
    team2Score: row.team2_score === null || row.team2_score === undefined ? null : Number(row.team2_score),
    demoUrl: normalizeText(row.demo_url),
    demoFileName: normalizeText(row.demo_file_name),
    localDemoPath: normalizeText(row.local_demo_path),
    parsedDemoChecksum: normalizeText(row.parsed_demo_checksum),
    cacheUpdatedAt: normalizeText(row.cache_updated_at),
  };
}

function mapHltvMatchRow(row = {}) {
  return {
    matchId: normalizeText(row.match_id),
    matchUrl: normalizeText(row.match_url),
    team1Id: normalizeText(row.team1_id),
    team1Name: normalizeText(row.team1_name),
    team1LogoPath: normalizeText(row.team1_logo_path),
    team1LogoUrl: normalizeText(row.team1_logo_url),
    team2Id: normalizeText(row.team2_id),
    team2Name: normalizeText(row.team2_name),
    team2LogoPath: normalizeText(row.team2_logo_path),
    team2LogoUrl: normalizeText(row.team2_logo_url),
    team1Score: row.team1_score === null || row.team1_score === undefined ? null : Number(row.team1_score),
    team2Score: row.team2_score === null || row.team2_score === undefined ? null : Number(row.team2_score),
    eventId: normalizeText(row.event_id),
    eventName: normalizeText(row.event_name),
    matchFormat: normalizeText(row.match_format),
    matchTimeLabel: normalizeText(row.match_time_label),
    matchTimestampMs: row.match_timestamp_ms === null || row.match_timestamp_ms === undefined ? null : Number(row.match_timestamp_ms),
    hltvStarRating: Number(row.hltv_star_rating) || 0,
    hasDemo: Number(row.has_demo) === 1,
    downloadedDemoPath: normalizeText(row.downloaded_demo_path),
    downloadedFileSize: Number(row.downloaded_file_size) || 0,
    addedToGameLibraryAt: normalizeText(row.added_to_game_library_at),
    playableDemoPaths: (() => {
      try {
        const parsedValue = JSON.parse(String(row.playable_demo_paths_json || '[]'));
        return Array.isArray(parsedValue) ? parsedValue.map((value) => normalizeText(value)).filter(Boolean) : [];
      } catch (_error) {
        return [];
      }
    })(),
    source: normalizeText(row.source),
    firstSeenAt: normalizeText(row.first_seen_at),
    lastSeenAt: normalizeText(row.last_seen_at),
    cacheUpdatedAt: normalizeText(row.cache_updated_at),
  };
}

function mapHltvTeamRow(row = {}) {
  return {
    teamId: normalizeText(row.team_id),
    teamUrl: normalizeText(row.team_url),
    displayName: normalizeText(row.display_name),
    normalizedName: normalizeText(row.normalized_name),
    logoUrl: normalizeText(row.logo_url),
    logoPath: normalizeText(row.logo_path),
    country: normalizeText(row.country),
    ranking: row.ranking === null || row.ranking === undefined ? null : Number(row.ranking),
    relatedMatchCount: Number(row.related_match_count) || 0,
    firstSeenAt: normalizeText(row.first_seen_at),
    lastSeenAt: normalizeText(row.last_seen_at),
    cacheUpdatedAt: normalizeText(row.cache_updated_at),
  };
}

function mapHltvPlayerRow(row = {}) {
  return {
    playerId: normalizeText(row.player_id),
    playerUrl: normalizeText(row.player_url),
    nickname: normalizeText(row.nickname),
    realName: normalizeText(row.real_name),
    normalizedNickname: normalizeText(row.normalized_nickname),
    teamId: normalizeText(row.team_id),
    teamName: normalizeText(row.team_name),
    country: normalizeText(row.country),
    relatedMatchCount: Number(row.related_match_count) || 0,
    firstSeenAt: normalizeText(row.first_seen_at),
    lastSeenAt: normalizeText(row.last_seen_at),
    cacheUpdatedAt: normalizeText(row.cache_updated_at),
  };
}

function resolveFallbackTeamId(team = {}) {
  const normalizedName = normalizeText(team.normalizedName || team.displayName).toLowerCase();
  if (!normalizedName) {
    return '';
  }
  return `name:${normalizedName.replace(/\s+/g, '-')}`;
}

function getExistingById(context, tableName, idColumn, idValue) {
  if (!normalizeText(idValue)) {
    return null;
  }
  return context.getOne(
    context.database,
    `SELECT * FROM ${tableName} WHERE ${idColumn} = ? LIMIT 1`,
    [normalizeText(idValue)],
  );
}

function parseJsonArray(value) {
  try {
    const parsedValue = JSON.parse(String(value || '[]'));
    return Array.isArray(parsedValue) ? parsedValue.map((item) => normalizeText(item)).filter(Boolean) : [];
  } catch (_error) {
    return [];
  }
}

function findPlayableDemoMapIndex(paths = [], localDemoPath = '') {
  const normalizedLocalPath = normalizeText(localDemoPath);
  const foundIndex = paths.findIndex((path) => normalizeText(path) === normalizedLocalPath);
  return foundIndex >= 0 ? foundIndex + 1 : 0;
}

function getNextMapIndex(context, database, matchId) {
  const row = context.getOne(
    database,
    'SELECT COALESCE(MAX(map_index), 0) + 1 AS next_map_index FROM hltv_match_maps WHERE match_id = ?',
    [matchId],
  );
  return Number(row?.next_map_index) || 1;
}

function upsertHltvLocalDemoMap(database, map, cachedAt) {
  database.run(
    `
      INSERT INTO hltv_match_maps (
        match_id,
        map_index,
        map_name,
        map_slug,
        local_demo_path,
        parsed_demo_checksum,
        cache_updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id, map_index) DO UPDATE SET
        map_name = COALESCE(NULLIF(excluded.map_name, ''), hltv_match_maps.map_name),
        map_slug = COALESCE(NULLIF(excluded.map_slug, ''), hltv_match_maps.map_slug),
        local_demo_path = COALESCE(NULLIF(excluded.local_demo_path, ''), hltv_match_maps.local_demo_path),
        parsed_demo_checksum = COALESCE(NULLIF(excluded.parsed_demo_checksum, ''), hltv_match_maps.parsed_demo_checksum),
        cache_updated_at = excluded.cache_updated_at
    `,
    [
      map.matchId,
      map.mapIndex,
      map.mapName,
      map.mapSlug,
      map.localDemoPath,
      map.parsedDemoChecksum,
      cachedAt,
    ],
  );
}

async function upsertHltvCacheMatches(context, payload = {}) {
  const database = await context.getDatabase();
  context.database = database;

  const cachedAt = normalizeText(payload.cachedAt) || new Date().toISOString();
  const stats = {
    insertedMatches: 0,
    updatedMatches: 0,
    insertedTeams: 0,
    updatedTeams: 0,
    insertedPlayers: 0,
    updatedPlayers: 0,
    insertedMaps: 0,
    updatedMaps: 0,
  };

  const explicitTeams = Array.isArray(payload.teams) ? payload.teams.map((team) => normalizeHltvCacheTeam(team)) : [];
  const explicitTeamIds = new Set();

  explicitTeams.forEach((team) => {
    const resolvedTeam = {
      ...team,
      teamId: team.teamId || resolveFallbackTeamId(team),
      normalizedName: team.normalizedName || normalizeText(team.displayName).toLowerCase(),
    };
    if (!resolvedTeam.teamId || !resolvedTeam.displayName) {
      return;
    }

    explicitTeamIds.add(resolvedTeam.teamId);
    const existingRow = getExistingById(context, 'hltv_teams', 'team_id', resolvedTeam.teamId);
    database.run(
      `
        INSERT INTO hltv_teams (
          team_id,
          team_url,
          display_name,
          normalized_name,
          logo_url,
          logo_path,
          country,
          ranking,
          related_match_count,
          first_seen_at,
          last_seen_at,
          cache_updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(team_id) DO UPDATE SET
          team_url = excluded.team_url,
          display_name = excluded.display_name,
          normalized_name = excluded.normalized_name,
          logo_url = excluded.logo_url,
          logo_path = excluded.logo_path,
          country = excluded.country,
          ranking = excluded.ranking,
          related_match_count = MAX(hltv_teams.related_match_count, excluded.related_match_count),
          last_seen_at = excluded.last_seen_at,
          cache_updated_at = excluded.cache_updated_at
      `,
      [
        resolvedTeam.teamId,
        resolvedTeam.teamUrl,
        resolvedTeam.displayName,
        resolvedTeam.normalizedName,
        resolvedTeam.logoUrl,
        resolvedTeam.logoPath,
        resolvedTeam.country,
        resolvedTeam.ranking,
        Number(resolvedTeam.relatedMatchCount) || 0,
        normalizeText(existingRow?.first_seen_at) || cachedAt,
        cachedAt,
        cachedAt,
      ],
    );
    if (existingRow) {
      stats.updatedTeams += 1;
    } else {
      stats.insertedTeams += 1;
    }
  });

  const players = Array.isArray(payload.players) ? payload.players.map((player) => normalizeHltvCachePlayer(player)) : [];
  players.forEach((player) => {
    if (!player.playerId || !player.nickname) {
      return;
    }

    const existingRow = getExistingById(context, 'hltv_players', 'player_id', player.playerId);
    database.run(
      `
        INSERT INTO hltv_players (
          player_id,
          player_url,
          nickname,
          real_name,
          normalized_nickname,
          team_id,
          team_name,
          country,
          related_match_count,
          first_seen_at,
          last_seen_at,
          cache_updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(player_id) DO UPDATE SET
          player_url = excluded.player_url,
          nickname = excluded.nickname,
          real_name = excluded.real_name,
          normalized_nickname = excluded.normalized_nickname,
          team_id = excluded.team_id,
          team_name = excluded.team_name,
          country = excluded.country,
          related_match_count = MAX(hltv_players.related_match_count, excluded.related_match_count),
          last_seen_at = excluded.last_seen_at,
          cache_updated_at = excluded.cache_updated_at
      `,
      [
        player.playerId,
        player.playerUrl,
        player.nickname,
        player.realName,
        player.normalizedNickname || player.nickname.toLowerCase(),
        player.teamId,
        player.teamName,
        player.country,
        Number(player.relatedMatchCount) || 0,
        normalizeText(existingRow?.first_seen_at) || cachedAt,
        cachedAt,
        cachedAt,
      ],
    );
    if (existingRow) {
      stats.updatedPlayers += 1;
    } else {
      stats.insertedPlayers += 1;
    }
  });

  const matches = Array.isArray(payload.matches) ? payload.matches.map((match) => normalizeHltvCacheMatch(match)) : [];
  matches.forEach((match) => {
    if (!match.matchId) {
      return;
    }

    const minimalTeams = [
      {
        teamId: match.team1Id || resolveFallbackTeamId({ displayName: match.team1Name }),
        displayName: match.team1Name,
        normalizedName: normalizeText(match.team1Name).toLowerCase(),
        logoUrl: match.team1LogoUrl,
      },
      {
        teamId: match.team2Id || resolveFallbackTeamId({ displayName: match.team2Name }),
        displayName: match.team2Name,
        normalizedName: normalizeText(match.team2Name).toLowerCase(),
        logoUrl: match.team2LogoUrl,
      },
    ].filter((team) => team.teamId && team.displayName && !explicitTeamIds.has(team.teamId));

    minimalTeams.forEach((team) => {
      const existingRow = getExistingById(context, 'hltv_teams', 'team_id', team.teamId);
      database.run(
        `
          INSERT INTO hltv_teams (
            team_id,
            display_name,
            normalized_name,
            logo_url,
            related_match_count,
            first_seen_at,
            last_seen_at,
            cache_updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(team_id) DO UPDATE SET
            display_name = excluded.display_name,
            normalized_name = excluded.normalized_name,
            logo_url = COALESCE(NULLIF(excluded.logo_url, ''), hltv_teams.logo_url),
            related_match_count = hltv_teams.related_match_count + 1,
            last_seen_at = excluded.last_seen_at,
            cache_updated_at = excluded.cache_updated_at
        `,
        [
          team.teamId,
          team.displayName,
          team.normalizedName,
          normalizeText(team.logoUrl),
          1,
          normalizeText(existingRow?.first_seen_at) || cachedAt,
          cachedAt,
          cachedAt,
        ],
      );
      if (existingRow) {
        stats.updatedTeams += 1;
      } else {
        stats.insertedTeams += 1;
      }
      explicitTeamIds.add(team.teamId);
    });

    const existingMatch = getExistingById(context, 'hltv_matches', 'match_id', match.matchId);
    database.run(
      `
        INSERT INTO hltv_matches (
          match_id,
          match_url,
          team1_id,
          team1_name,
          team2_id,
          team2_name,
          team1_score,
          team2_score,
          event_id,
          event_name,
          match_format,
          match_time_label,
          match_timestamp_ms,
          hltv_star_rating,
          has_demo,
          downloaded_demo_path,
          downloaded_file_size,
          playable_demo_paths_json,
          added_to_game_library_at,
          source,
          first_seen_at,
          last_seen_at,
          cache_updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(match_id) DO UPDATE SET
          match_url = excluded.match_url,
          team1_id = excluded.team1_id,
          team1_name = excluded.team1_name,
          team2_id = excluded.team2_id,
          team2_name = excluded.team2_name,
          team1_score = excluded.team1_score,
          team2_score = excluded.team2_score,
          event_id = excluded.event_id,
          event_name = excluded.event_name,
          match_format = excluded.match_format,
          match_time_label = excluded.match_time_label,
          match_timestamp_ms = excluded.match_timestamp_ms,
          hltv_star_rating = excluded.hltv_star_rating,
          has_demo = excluded.has_demo,
          downloaded_demo_path = excluded.downloaded_demo_path,
          downloaded_file_size = excluded.downloaded_file_size,
          playable_demo_paths_json = excluded.playable_demo_paths_json,
          added_to_game_library_at = COALESCE(NULLIF(hltv_matches.added_to_game_library_at, ''), excluded.added_to_game_library_at),
          source = excluded.source,
          last_seen_at = excluded.last_seen_at,
          cache_updated_at = excluded.cache_updated_at
      `,
      [
        match.matchId,
        match.matchUrl,
        match.team1Id || resolveFallbackTeamId({ displayName: match.team1Name }),
        match.team1Name,
        match.team2Id || resolveFallbackTeamId({ displayName: match.team2Name }),
        match.team2Name,
        match.team1Score,
        match.team2Score,
        match.eventId,
        match.eventName,
        match.matchFormat,
        match.matchTimeLabel,
        match.matchTimestampMs,
        match.hltvStarRating,
        match.hasDemo ? 1 : 0,
        match.downloadedDemoPath,
        match.downloadedFileSize,
        JSON.stringify(match.playableDemoPaths || []),
        normalizeText(existingMatch?.added_to_game_library_at),
        match.source,
        normalizeText(existingMatch?.first_seen_at) || cachedAt,
        cachedAt,
        cachedAt,
      ],
    );
    if (existingMatch) {
      stats.updatedMatches += 1;
    } else {
      stats.insertedMatches += 1;
    }
  });

  const maps = Array.isArray(payload.maps) ? payload.maps.map((map) => normalizeHltvCacheMap(map)) : [];
  maps.forEach((map) => {
    if (!map.matchId) {
      return;
    }

    const existingMap = context.getOne(
      database,
      `
        SELECT *
        FROM hltv_match_maps
        WHERE match_id = ? AND map_index = ?
        LIMIT 1
      `,
      [map.matchId, map.mapIndex],
    );

    database.run(
      `
        INSERT INTO hltv_match_maps (
          match_id,
          map_index,
          map_name,
          map_slug,
          team1_score,
          team2_score,
          demo_url,
          demo_file_name,
          local_demo_path,
          parsed_demo_checksum,
          cache_updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(match_id, map_index) DO UPDATE SET
          map_name = excluded.map_name,
          map_slug = excluded.map_slug,
          team1_score = excluded.team1_score,
          team2_score = excluded.team2_score,
          demo_url = excluded.demo_url,
          demo_file_name = excluded.demo_file_name,
          local_demo_path = excluded.local_demo_path,
          parsed_demo_checksum = excluded.parsed_demo_checksum,
          cache_updated_at = excluded.cache_updated_at
      `,
      [
        map.matchId,
        map.mapIndex,
        map.mapName,
        map.mapSlug,
        map.team1Score,
        map.team2Score,
        map.demoUrl,
        map.demoFileName,
        map.localDemoPath,
        map.parsedDemoChecksum,
        cachedAt,
      ],
    );
    if (existingMap) {
      stats.updatedMaps += 1;
    } else {
      stats.insertedMaps += 1;
    }
  });

  await persistHltvCacheIfAvailable(context, database);
  delete context.database;
  return stats;
}

async function loadMapsByMatchIds(context, matchIds = []) {
  if (!Array.isArray(matchIds) || matchIds.length === 0) {
    return new Map();
  }

  const database = await context.getDatabase();
  const placeholders = matchIds.map(() => '?').join(', ');
  const rows = context.getAll(
    database,
    `
      SELECT *
      FROM hltv_match_maps
      WHERE match_id IN (${placeholders})
      ORDER BY match_id ASC, map_index ASC
    `,
    matchIds,
  );

  return rows.reduce((mapByMatchId, row) => {
    const matchId = normalizeText(row.match_id);
    const maps = mapByMatchId.get(matchId) || [];
    maps.push(mapHltvMapRow(row));
    mapByMatchId.set(matchId, maps);
    return mapByMatchId;
  }, new Map());
}

async function searchHltvCachedMatches(context, filters = {}) {
  const database = await context.getDatabase();
  const normalizedFilters = normalizeLocalLibraryFilters({ ...filters, tab: 'matches' });
  const clauses = [];
  const params = [];

  if (normalizedFilters.query) {
    clauses.push(`(
      LOWER(match_id) LIKE ?
      OR LOWER(team1_name) LIKE ?
      OR LOWER(team2_name) LIKE ?
      OR LOWER(event_name) LIKE ?
    )`);
    const likeValue = `%${normalizedFilters.query}%`;
    params.push(likeValue, likeValue, likeValue, likeValue);
  }

  if (normalizedFilters.map) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM hltv_match_maps map_filter
        WHERE map_filter.match_id = hltv_matches.match_id
          AND LOWER(map_filter.map_slug) = ?
      )
    `);
    params.push(normalizedFilters.map);
  }

  if (normalizedFilters.hasDemoOnly) {
    clauses.push('has_demo = 1');
  }

  if (normalizedFilters.downloadedOnly) {
    clauses.push(`TRIM(downloaded_demo_path) <> ''`);
  }

  if (normalizedFilters.parsedOnly) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM hltv_match_maps parsed_filter
        WHERE parsed_filter.match_id = hltv_matches.match_id
          AND TRIM(parsed_filter.parsed_demo_checksum) <> ''
      )
    `);
  }


  params.push(normalizedFilters.limit, normalizedFilters.offset);

  const rows = context.getAll(
    database,
    `
      SELECT
        hltv_matches.*,
        team1_logo.logo_path AS team1_logo_path,
        team1_logo.logo_url AS team1_logo_url,
        team2_logo.logo_path AS team2_logo_path,
        team2_logo.logo_url AS team2_logo_url
      FROM hltv_matches
      LEFT JOIN hltv_teams team1_logo ON team1_logo.team_id = hltv_matches.team1_id
      LEFT JOIN hltv_teams team2_logo ON team2_logo.team_id = hltv_matches.team2_id
      ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY hltv_matches.cache_updated_at DESC, hltv_matches.match_id DESC
      LIMIT ?
      OFFSET ?
    `,
    params,
  );

  const matches = rows.map((row) => mapHltvMatchRow(row));
  const mapsByMatchId = await loadMapsByMatchIds(context, matches.map((match) => match.matchId));
  return matches.map((match) => ({
    ...match,
    maps: mapsByMatchId.get(match.matchId) || [],
  }));
}

async function searchHltvCachedTeams(context, filters = {}) {
  const database = await context.getDatabase();
  const query = normalizeText(filters.query).toLowerCase();
  const clauses = [];
  const params = [];

  if (query) {
    clauses.push('(LOWER(display_name) LIKE ? OR LOWER(normalized_name) LIKE ? OR LOWER(team_id) LIKE ?)');
    const likeValue = `%${query}%`;
    params.push(likeValue, likeValue, likeValue);
  }

  return context.getAll(
    database,
    `
      SELECT *
      FROM hltv_teams
      ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY cache_updated_at DESC, display_name ASC
    `,
    params,
  ).map((row) => mapHltvTeamRow(row));
}

async function searchHltvCachedPlayers(context, filters = {}) {
  const database = await context.getDatabase();
  const query = normalizeText(filters.query).toLowerCase();
  const clauses = [];
  const params = [];

  if (query) {
    clauses.push('(LOWER(nickname) LIKE ? OR LOWER(real_name) LIKE ? OR LOWER(player_id) LIKE ?)');
    const likeValue = `%${query}%`;
    params.push(likeValue, likeValue, likeValue);
  }

  return context.getAll(
    database,
    `
      SELECT *
      FROM hltv_players
      ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY cache_updated_at DESC, nickname ASC
    `,
    params,
  ).map((row) => mapHltvPlayerRow(row));
}

async function getHltvCacheSummary(context) {
  const database = await context.getDatabase();
  const count = (tableName) => Number(context.getOne(database, `SELECT COUNT(*) AS count FROM ${tableName}`)?.count || 0);
  const latestRow = context.getOne(
    database,
    `
      SELECT MAX(cache_updated_at) AS latest_cache_updated_at
      FROM (
        SELECT cache_updated_at FROM hltv_matches
        UNION ALL
        SELECT cache_updated_at FROM hltv_match_maps
        UNION ALL
        SELECT cache_updated_at FROM hltv_teams
        UNION ALL
        SELECT cache_updated_at FROM hltv_players
      )
    `,
  );

  return {
    matches: count('hltv_matches'),
    teams: count('hltv_teams'),
    players: count('hltv_players'),
    maps: count('hltv_match_maps'),
    latestCacheUpdatedAt: normalizeText(latestRow?.latest_cache_updated_at),
  };
}

async function updateHltvCachedDemoDownload(context, payload = {}) {
  const database = await context.getDatabase();
  const cachedAt = normalizeText(payload.cachedAt) || new Date().toISOString();
  const matchId = normalizeText(payload.matchId);
  const downloadedDemoPath = normalizeText(payload.downloadedDemoPath);
  const downloadedFileSize = Number(payload.downloadedFileSize) || 0;
  const playableDemoPaths = Array.isArray(payload.playableDemoPaths)
    ? payload.playableDemoPaths.map((value) => normalizeText(value)).filter(Boolean)
    : [];

  const existingMatch = matchId
    ? context.getOne(database, 'SELECT * FROM hltv_matches WHERE match_id = ? LIMIT 1', [matchId])
    : null;
  if (!existingMatch) {
    return { ok: false, reason: matchId ? 'not_found' : 'missing_match_id' };
  }

  database.run(
    `
      UPDATE hltv_matches
      SET downloaded_demo_path = ?,
          downloaded_file_size = ?,
          has_demo = CASE
            WHEN ? > 0 OR TRIM(?) <> '' THEN 1
            ELSE has_demo
          END,
          playable_demo_paths_json = ?,
          cache_updated_at = ?
      WHERE match_id = ?
    `,
    [
      downloadedDemoPath,
      downloadedFileSize,
      playableDemoPaths.length,
      downloadedDemoPath,
      JSON.stringify(playableDemoPaths),
      cachedAt,
      matchId,
    ],
  );

  playableDemoPaths.forEach((localDemoPath, index) => {
    upsertHltvLocalDemoMap(
      database,
      normalizeHltvCacheMap({
        matchId,
        mapIndex: index + 1,
        localDemoPath,
      }),
      cachedAt,
    );
  });

  await persistHltvCacheIfAvailable(context, database);
  return { ok: true };
}

async function updateHltvCachedMapParsedDemo(context, payload = {}) {
  const database = await context.getDatabase();
  const cachedAt = normalizeText(payload.cachedAt) || new Date().toISOString();
  const matchId = normalizeText(payload.matchId);
  const localDemoPath = normalizeText(payload.localDemoPath);
  const parsedDemoChecksum = normalizeText(payload.parsedDemoChecksum);
  const existingMatch = matchId
    ? context.getOne(database, 'SELECT * FROM hltv_matches WHERE match_id = ? LIMIT 1', [matchId])
    : null;
  if (!existingMatch) {
    return { ok: false, reason: matchId ? 'not_found' : 'missing_match_id' };
  }

  const existingMap = context.getOne(
    database,
    `
      SELECT *
      FROM hltv_match_maps
      WHERE match_id = ?
        AND local_demo_path = ?
      LIMIT 1
    `,
    [matchId, localDemoPath],
  );

  const playableDemoPaths = parseJsonArray(existingMatch.playable_demo_paths_json);
  const fallbackMapIndex = findPlayableDemoMapIndex(playableDemoPaths, localDemoPath)
    || getNextMapIndex(context, database, matchId);

  upsertHltvLocalDemoMap(
    database,
    normalizeHltvCacheMap({
      matchId,
      mapIndex: Number(existingMap?.map_index) || fallbackMapIndex,
      mapName: existingMap?.map_name,
      mapSlug: existingMap?.map_slug,
      localDemoPath,
      parsedDemoChecksum,
    }),
    cachedAt,
  );

  await persistHltvCacheIfAvailable(context, database);
  return { ok: true };
}

async function markHltvMatchAddedToGameLibrary(context, payload = {}) {
  const database = await context.getDatabase();
  const matchId = normalizeText(payload.matchId);
  const addedAt = normalizeText(payload.addedAt) || new Date().toISOString();
  const existingMatch = matchId
    ? context.getOne(database, 'SELECT * FROM hltv_matches WHERE match_id = ? LIMIT 1', [matchId])
    : null;
  if (!existingMatch) {
    return { ok: false, reason: matchId ? 'not_found' : 'missing_match_id' };
  }

  database.run(
    `
      UPDATE hltv_matches
      SET added_to_game_library_at = ?,
          cache_updated_at = ?
      WHERE match_id = ?
    `,
    [addedAt, addedAt, matchId],
  );

  await persistHltvCacheIfAvailable(context, database);
  return { ok: true };
}

async function clearHltvCache(context) {
  const database = await context.getDatabase();
  database.run('DELETE FROM hltv_match_maps;');
  database.run('DELETE FROM hltv_matches;');
  database.run('DELETE FROM hltv_players;');
  database.run('DELETE FROM hltv_teams;');
  await persistHltvCacheIfAvailable(context, database);
  return { ok: true };
}

module.exports = {
  clearHltvCache,
  getHltvCacheSummary,
  markHltvMatchAddedToGameLibrary,
  mapHltvMapRow,
  mapHltvMatchRow,
  mapHltvPlayerRow,
  mapHltvTeamRow,
  searchHltvCachedMatches,
  searchHltvCachedPlayers,
  searchHltvCachedTeams,
  updateHltvCachedDemoDownload,
  updateHltvCachedMapParsedDemo,
  upsertHltvCacheMatches,
};
