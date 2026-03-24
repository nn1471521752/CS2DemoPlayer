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

module.exports = {
  getEntityRegistryMeta,
  listPendingTeamCandidates,
  setEntityRegistryMeta,
  upsertTeamCandidate,
};
