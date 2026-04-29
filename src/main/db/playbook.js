const crypto = require('crypto');

function normalizeText(value) {
  return String(value || '').trim();
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function persistPlaybookIfAvailable(context, database) {
  if (typeof context?.persistDatabase === 'function') {
    await context.persistDatabase(database);
  }
}

function mapPlaybookMapRow(row = {}) {
  return {
    mapId: normalizeText(row.map_id),
    displayName: normalizeText(row.display_name),
    radarImagePath: normalizeText(row.radar_image_path),
    hasRadarImage: Number(row.has_radar_image) === 1,
    posX: toFiniteNumber(row.pos_x),
    posY: toFiniteNumber(row.pos_y),
    scale: toFiniteNumber(row.scale),
    thresholdZ: toFiniteNumber(row.threshold_z),
    source: normalizeText(row.source),
    isActive: Number(row.is_active) !== 0,
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
  };
}

function parseJsonArray(value) {
  if (typeof value !== 'string' || !value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function toInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function toPositionFromColumns(row = {}, prefix = '') {
  return {
    x: toFiniteNumber(row[`${prefix}_x`]),
    y: toFiniteNumber(row[`${prefix}_y`]),
    z: toFiniteNumber(row[`${prefix}_z`]),
  };
}

function toPositionFromObject(value = {}) {
  return {
    x: toFiniteNumber(value.x ?? value.X),
    y: toFiniteNumber(value.y ?? value.Y),
    z: toFiniteNumber(value.z ?? value.Z),
  };
}

function mapPlaybookGrenadeRow(row = {}) {
  return {
    grenadeId: normalizeText(row.grenade_id),
    sourceDemoChecksum: normalizeText(row.source_demo_checksum),
    sourceRoundNumber: toInteger(row.source_round_number),
    sourceEntityId: normalizeText(row.source_entity_id),
    title: normalizeText(row.title),
    mapId: normalizeText(row.map_id),
    grenadeType: normalizeText(row.grenade_type),
    side: normalizeText(row.side) || 'unknown',
    throwerName: normalizeText(row.thrower_name),
    throwerSteamid: normalizeText(row.thrower_steamid),
    throwerTeamNum: toInteger(row.thrower_team_num),
    throwTick: toInteger(row.throw_tick),
    detonateTick: toInteger(row.detonate_tick),
    startPosition: toPositionFromColumns(row, 'start'),
    endPosition: toPositionFromColumns(row, 'end'),
    trajectory: parseJsonArray(String(row.trajectory_json || '')),
    tags: parseJsonArray(String(row.tags_json || '')),
    notes: normalizeText(row.notes),
    markdownPath: normalizeText(row.markdown_path),
    syncMode: normalizeText(row.sync_mode) || 'sqlite-local',
    contentHash: normalizeText(row.content_hash),
    indexedAt: normalizeText(row.indexed_at),
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
  };
}

function normalizeMapEntry(entry = {}) {
  return {
    mapId: normalizeText(entry.mapId),
    displayName: normalizeText(entry.displayName),
    radarImagePath: normalizeText(entry.radarImagePath),
    hasRadarImage: Boolean(entry.hasRadarImage),
    posX: toFiniteNumber(entry.posX),
    posY: toFiniteNumber(entry.posY),
    scale: toFiniteNumber(entry.scale),
    thresholdZ: toFiniteNumber(entry.thresholdZ),
    source: normalizeText(entry.source) || 'map-meta',
    isActive: entry.isActive !== false,
  };
}

function createStableGrenadeId(sourceDemoChecksum, sourceRoundNumber, sourceEntityId) {
  const sourceKey = `${sourceDemoChecksum}:${sourceRoundNumber}:${sourceEntityId}`;
  const digest = crypto.createHash('sha1').update(sourceKey).digest('hex').slice(0, 16);
  return `grenade_${digest}`;
}

function normalizeTrajectoryPoint(point = {}) {
  return {
    tick: toInteger(point.tick),
    x: toFiniteNumber(point.x ?? point.X),
    y: toFiniteNumber(point.y ?? point.Y),
    z: toFiniteNumber(point.z ?? point.Z),
  };
}

function normalizeGrenadeEntry(entry = {}) {
  const sourceDemoChecksum = normalizeText(entry.sourceDemoChecksum);
  const sourceRoundNumber = toInteger(entry.sourceRoundNumber);
  const rawSourceEntityId = normalizeText(entry.sourceEntityId);
  const startPosition = toPositionFromObject(entry.startPosition);
  const endPosition = toPositionFromObject(entry.endPosition);
  const trajectory = (Array.isArray(entry.trajectory) ? entry.trajectory : [])
    .map(normalizeTrajectoryPoint)
    .filter((point) => point.tick >= 0);

  const syncMode = normalizeText(entry.syncMode) || (normalizeText(entry.markdownPath) ? 'obsidian-canonical' : 'sqlite-local');
  const grenadeId = normalizeText(entry.grenadeId) || createStableGrenadeId(
      sourceDemoChecksum,
      sourceRoundNumber,
      rawSourceEntityId,
    );
  const sourceEntityId = rawSourceEntityId || (syncMode === 'obsidian-canonical' ? grenadeId : '');

  return {
    grenadeId,
    sourceDemoChecksum,
    sourceRoundNumber,
    sourceEntityId,
    title: normalizeText(entry.title) || 'Untitled grenade',
    mapId: normalizeText(entry.mapId),
    grenadeType: normalizeText(entry.grenadeType) || 'unknown',
    side: normalizeText(entry.side) || 'unknown',
    throwerName: normalizeText(entry.throwerName),
    throwerSteamid: normalizeText(entry.throwerSteamid),
    throwerTeamNum: toInteger(entry.throwerTeamNum),
    throwTick: toInteger(entry.throwTick),
    detonateTick: toInteger(entry.detonateTick),
    startPosition,
    endPosition,
    trajectory,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    notes: normalizeText(entry.notes),
    markdownPath: normalizeText(entry.markdownPath),
    syncMode,
    contentHash: normalizeText(entry.contentHash),
    indexedAt: normalizeText(entry.indexedAt),
  };
}

function normalizeTags(tagsLike) {
  const rawTags = Array.isArray(tagsLike)
    ? tagsLike
    : String(tagsLike || '').split(',');
  const seen = new Set();
  const tags = [];
  rawTags.forEach((tag) => {
    const normalizedTag = normalizeText(tag);
    if (!normalizedTag || seen.has(normalizedTag.toLowerCase())) {
      return;
    }
    seen.add(normalizedTag.toLowerCase());
    tags.push(normalizedTag);
  });
  return tags;
}

async function syncPlaybookMaps(context, entries = [], syncedAt = '') {
  const database = await context.getDatabase();
  const updatedAt = normalizeText(syncedAt) || new Date().toISOString();
  const stats = {
    insertedMaps: 0,
    updatedMaps: 0,
  };

  for (const rawEntry of Array.isArray(entries) ? entries : []) {
    const entry = normalizeMapEntry(rawEntry);
    if (!entry.mapId) {
      continue;
    }

    const existing = context.getOne(
      database,
      'SELECT map_id, created_at FROM playbook_maps WHERE map_id = ?',
      [entry.mapId],
    );

    database.run(
      `
        INSERT INTO playbook_maps (
          map_id,
          display_name,
          radar_image_path,
          has_radar_image,
          pos_x,
          pos_y,
          scale,
          threshold_z,
          source,
          is_active,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(map_id) DO UPDATE SET
          display_name = excluded.display_name,
          radar_image_path = excluded.radar_image_path,
          has_radar_image = excluded.has_radar_image,
          pos_x = excluded.pos_x,
          pos_y = excluded.pos_y,
          scale = excluded.scale,
          threshold_z = excluded.threshold_z,
          source = excluded.source,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
      `,
      [
        entry.mapId,
        entry.displayName,
        entry.radarImagePath,
        entry.hasRadarImage ? 1 : 0,
        entry.posX,
        entry.posY,
        entry.scale,
        entry.thresholdZ,
        entry.source,
        entry.isActive ? 1 : 0,
        normalizeText(existing?.created_at) || updatedAt,
        updatedAt,
      ],
    );

    if (existing) {
      stats.updatedMaps += 1;
    } else {
      stats.insertedMaps += 1;
    }
  }

  await persistPlaybookIfAvailable(context, database);
  return stats;
}

async function listPlaybookMaps(context) {
  const database = await context.getDatabase();
  const rows = context.getAll(
    database,
    `
      SELECT *
      FROM playbook_maps
      WHERE is_active = 1
      ORDER BY display_name ASC, map_id ASC
    `,
  );
  return rows.map(mapPlaybookMapRow);
}

function hasCanonicalSync(entry) {
  return entry.syncMode === 'obsidian-canonical' || Boolean(entry.markdownPath);
}

function buildGrenadeInsertParams(entry, updatedAt, createdAt = updatedAt) {
  return [
    entry.grenadeId,
    entry.sourceDemoChecksum,
    entry.sourceRoundNumber,
    entry.sourceEntityId,
    entry.title,
    entry.mapId,
    entry.grenadeType,
    entry.side,
    entry.throwerName,
    entry.throwerSteamid,
    entry.throwerTeamNum,
    entry.throwTick,
    entry.detonateTick,
    entry.startPosition.x,
    entry.startPosition.y,
    entry.startPosition.z,
    entry.endPosition.x,
    entry.endPosition.y,
    entry.endPosition.z,
    JSON.stringify(entry.trajectory),
    JSON.stringify(entry.tags),
    entry.notes,
    entry.markdownPath,
    entry.syncMode,
    entry.contentHash,
    entry.indexedAt,
    createdAt,
    updatedAt,
  ];
}

function updateCanonicalGrenadeRow(database, entry, existing, updatedAt) {
  database.run(
    `
      UPDATE playbook_grenades
      SET
        grenade_id = ?,
        title = ?,
        map_id = ?,
        grenade_type = ?,
        side = ?,
        thrower_name = ?,
        thrower_steamid = ?,
        thrower_team_num = ?,
        throw_tick = ?,
        detonate_tick = ?,
        start_x = ?,
        start_y = ?,
        start_z = ?,
        end_x = ?,
        end_y = ?,
        end_z = ?,
        trajectory_json = ?,
        tags_json = ?,
        notes = ?,
        markdown_path = ?,
        sync_mode = ?,
        content_hash = ?,
        indexed_at = ?,
        updated_at = ?
      WHERE source_demo_checksum = ?
        AND source_round_number = ?
        AND source_entity_id = ?
    `,
    [
      entry.grenadeId || normalizeText(existing.grenade_id),
      entry.title,
      entry.mapId,
      entry.grenadeType,
      entry.side,
      entry.throwerName,
      entry.throwerSteamid,
      entry.throwerTeamNum,
      entry.throwTick,
      entry.detonateTick,
      entry.startPosition.x,
      entry.startPosition.y,
      entry.startPosition.z,
      entry.endPosition.x,
      entry.endPosition.y,
      entry.endPosition.z,
      JSON.stringify(entry.trajectory),
      JSON.stringify(entry.tags),
      entry.notes,
      entry.markdownPath,
      entry.syncMode,
      entry.contentHash,
      entry.indexedAt,
      updatedAt,
      entry.sourceDemoChecksum,
      entry.sourceRoundNumber,
      entry.sourceEntityId,
    ],
  );
}

async function importPlaybookGrenades(context, entries = [], importedAt = '') {
  const database = await context.getDatabase();
  const updatedAt = normalizeText(importedAt) || new Date().toISOString();
  const stats = {
    insertedGrenades: 0,
    existingGrenades: 0,
    skippedGrenades: 0,
    grenades: [],
  };

  for (const rawEntry of Array.isArray(entries) ? entries : []) {
    const entry = normalizeGrenadeEntry(rawEntry);
    if (
      !hasCanonicalSync(entry)
      && (!entry.sourceDemoChecksum || entry.sourceRoundNumber <= 0 || !entry.sourceEntityId)
    ) {
      stats.skippedGrenades += 1;
      continue;
    }

    const existing = context.getOne(
      database,
      `
        SELECT *
        FROM playbook_grenades
        WHERE source_demo_checksum = ?
          AND source_round_number = ?
          AND source_entity_id = ?
      `,
      [entry.sourceDemoChecksum, entry.sourceRoundNumber, entry.sourceEntityId],
    );

    if (existing) {
      stats.existingGrenades += 1;
      if (hasCanonicalSync(entry)) {
        updateCanonicalGrenadeRow(database, entry, existing, updatedAt);
        const updated = context.getOne(
          database,
          'SELECT * FROM playbook_grenades WHERE source_demo_checksum = ? AND source_round_number = ? AND source_entity_id = ?',
          [entry.sourceDemoChecksum, entry.sourceRoundNumber, entry.sourceEntityId],
        );
        stats.grenades.push(mapPlaybookGrenadeRow(updated || existing));
      } else {
        stats.grenades.push(mapPlaybookGrenadeRow(existing));
      }
      continue;
    }

    database.run(
      `
        INSERT INTO playbook_grenades (
          grenade_id,
          source_demo_checksum,
          source_round_number,
          source_entity_id,
          title,
          map_id,
          grenade_type,
          side,
          thrower_name,
          thrower_steamid,
          thrower_team_num,
          throw_tick,
          detonate_tick,
          start_x,
          start_y,
          start_z,
          end_x,
          end_y,
          end_z,
          trajectory_json,
          tags_json,
          notes,
          markdown_path,
          sync_mode,
          content_hash,
          indexed_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      buildGrenadeInsertParams(entry, updatedAt),
    );
    stats.insertedGrenades += 1;

    const inserted = context.getOne(
      database,
      'SELECT * FROM playbook_grenades WHERE grenade_id = ?',
      [entry.grenadeId],
    );
    if (inserted) {
      stats.grenades.push(mapPlaybookGrenadeRow(inserted));
    }
  }

  await persistPlaybookIfAvailable(context, database);
  return stats;
}

async function listPlaybookGrenades(context) {
  const database = await context.getDatabase();
  const rows = context.getAll(
    database,
    `
      SELECT *
      FROM playbook_grenades
      ORDER BY map_id ASC, grenade_type ASC, title ASC, grenade_id ASC
    `,
  );
  return rows.map(mapPlaybookGrenadeRow);
}

async function getPlaybookGrenadeById(context, grenadeId) {
  const database = await context.getDatabase();
  const row = context.getOne(
    database,
    'SELECT * FROM playbook_grenades WHERE grenade_id = ?',
    [normalizeText(grenadeId)],
  );
  return row ? mapPlaybookGrenadeRow(row) : null;
}

async function updatePlaybookGrenade(context, payload = {}, updatedAt = '') {
  const database = await context.getDatabase();
  const grenadeId = normalizeText(payload.grenadeId);
  if (!grenadeId) {
    return null;
  }

  const existing = context.getOne(
    database,
    'SELECT * FROM playbook_grenades WHERE grenade_id = ?',
    [grenadeId],
  );
  if (!existing) {
    return null;
  }

  const hasNotes = Object.prototype.hasOwnProperty.call(payload, 'notes');
  const hasTags = Object.prototype.hasOwnProperty.call(payload, 'tags');
  const nextTitle = normalizeText(payload.title) || normalizeText(existing.title);
  const nextNotes = hasNotes ? normalizeText(payload.notes) : normalizeText(existing.notes);
  const nextTags = hasTags
    ? normalizeTags(payload.tags)
    : normalizeTags(parseJsonArray(String(existing.tags_json || '')));
  const nextUpdatedAt = normalizeText(updatedAt) || new Date().toISOString();

  database.run(
    `
      UPDATE playbook_grenades
      SET
        title = ?,
        notes = ?,
        tags_json = ?,
        updated_at = ?
      WHERE grenade_id = ?
    `,
    [
      nextTitle,
      nextNotes,
      JSON.stringify(nextTags),
      nextUpdatedAt,
      grenadeId,
    ],
  );

  await persistPlaybookIfAvailable(context, database);
  const updated = context.getOne(
    database,
    'SELECT * FROM playbook_grenades WHERE grenade_id = ?',
    [grenadeId],
  );
  return updated ? mapPlaybookGrenadeRow(updated) : null;
}

async function getPlaybookSummary(context) {
  const database = await context.getDatabase();
  const mapRow = context.getOne(
    database,
    `
      SELECT COUNT(*) AS maps, MAX(updated_at) AS latest_updated_at
      FROM playbook_maps
      WHERE is_active = 1
    `,
  ) || {};
  const grenadeRow = context.getOne(
    database,
    `
      SELECT COUNT(*) AS grenades, MAX(updated_at) AS latest_updated_at
      FROM playbook_grenades
    `,
  ) || {};
  const mapLatestUpdatedAt = normalizeText(mapRow.latest_updated_at);
  const grenadeLatestUpdatedAt = normalizeText(grenadeRow.latest_updated_at);
  const latestUpdatedAt = [mapLatestUpdatedAt, grenadeLatestUpdatedAt]
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || '';

  return {
    maps: Number(mapRow.maps) || 0,
    grenades: Number(grenadeRow.grenades) || 0,
    tactics: 0,
    setups: 0,
    latestUpdatedAt,
  };
}

module.exports = {
  getPlaybookSummary,
  getPlaybookGrenadeById,
  importPlaybookGrenades,
  listPlaybookGrenades,
  listPlaybookMaps,
  mapPlaybookGrenadeRow,
  mapPlaybookMapRow,
  syncPlaybookMaps,
  updatePlaybookGrenade,
};
