function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeIsoTimestamp(value) {
  const normalizedValue = normalizeText(value);
  return normalizedValue || new Date().toISOString();
}

function mapAnalysisQueueRow(row = {}) {
  return {
    matchId: normalizeText(row.match_id),
    matchUrl: normalizeText(row.match_url),
    team1Name: normalizeText(row.team1_name),
    team2Name: normalizeText(row.team2_name),
    eventName: normalizeText(row.event_name),
    queueReason: normalizeText(row.queue_reason),
    status: normalizeText(row.status) || 'queued',
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
  };
}

function mapInspirationCardRow(row = {}) {
  return {
    matchId: normalizeText(row.match_id),
    matchUrl: normalizeText(row.match_url),
    team1Name: normalizeText(row.team1_name),
    team2Name: normalizeText(row.team2_name),
    eventName: normalizeText(row.event_name),
    title: normalizeText(row.title),
    note: normalizeText(row.note),
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
  };
}

async function listAnalysisQueueItems(context) {
  const database = await context.getDatabase();
  const rows = context.getAll(
    database,
    `
      SELECT
        match_id,
        match_url,
        team1_name,
        team2_name,
        event_name,
        queue_reason,
        status,
        created_at,
        updated_at
      FROM hltv_analysis_queue
      ORDER BY updated_at DESC, created_at DESC, match_id ASC
    `,
  );
  return rows.map((row) => mapAnalysisQueueRow(row));
}

async function upsertAnalysisQueueItem(context, item = {}) {
  const database = await context.getDatabase();
  database.run(
    `
      INSERT INTO hltv_analysis_queue (
        match_id,
        match_url,
        team1_name,
        team2_name,
        event_name,
        queue_reason,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        match_url = excluded.match_url,
        team1_name = excluded.team1_name,
        team2_name = excluded.team2_name,
        event_name = excluded.event_name,
        queue_reason = excluded.queue_reason,
        status = excluded.status,
        created_at = hltv_analysis_queue.created_at,
        updated_at = excluded.updated_at
    `,
    [
      normalizeText(item.matchId),
      normalizeText(item.matchUrl),
      normalizeText(item.team1Name),
      normalizeText(item.team2Name),
      normalizeText(item.eventName),
      normalizeText(item.queueReason),
      normalizeText(item.status) || 'queued',
      normalizeIsoTimestamp(item.createdAt),
      normalizeIsoTimestamp(item.updatedAt),
    ],
  );
}

async function deleteAnalysisQueueItem(context, matchId) {
  const database = await context.getDatabase();
  database.run(
    `
      DELETE FROM hltv_analysis_queue
      WHERE match_id = ?
    `,
    [normalizeText(matchId)],
  );
}

async function listInspirationCards(context) {
  const database = await context.getDatabase();
  const rows = context.getAll(
    database,
    `
      SELECT
        match_id,
        match_url,
        team1_name,
        team2_name,
        event_name,
        title,
        note,
        created_at,
        updated_at
      FROM hltv_inspiration_cards
      ORDER BY updated_at DESC, created_at DESC, match_id ASC
    `,
  );
  return rows.map((row) => mapInspirationCardRow(row));
}

async function getInspirationCard(context, matchId) {
  const database = await context.getDatabase();
  const row = context.getOne(
    database,
    `
      SELECT
        match_id,
        match_url,
        team1_name,
        team2_name,
        event_name,
        title,
        note,
        created_at,
        updated_at
      FROM hltv_inspiration_cards
      WHERE match_id = ?
      LIMIT 1
    `,
    [normalizeText(matchId)],
  );
  return row ? mapInspirationCardRow(row) : null;
}

async function upsertInspirationCard(context, card = {}) {
  const database = await context.getDatabase();
  database.run(
    `
      INSERT INTO hltv_inspiration_cards (
        match_id,
        match_url,
        team1_name,
        team2_name,
        event_name,
        title,
        note,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        match_url = excluded.match_url,
        team1_name = excluded.team1_name,
        team2_name = excluded.team2_name,
        event_name = excluded.event_name,
        title = excluded.title,
        note = excluded.note,
        created_at = hltv_inspiration_cards.created_at,
        updated_at = excluded.updated_at
    `,
    [
      normalizeText(card.matchId),
      normalizeText(card.matchUrl),
      normalizeText(card.team1Name),
      normalizeText(card.team2Name),
      normalizeText(card.eventName),
      normalizeText(card.title),
      normalizeText(card.note),
      normalizeIsoTimestamp(card.createdAt),
      normalizeIsoTimestamp(card.updatedAt),
    ],
  );
}

async function deleteInspirationCard(context, matchId) {
  const database = await context.getDatabase();
  database.run(
    `
      DELETE FROM hltv_inspiration_cards
      WHERE match_id = ?
    `,
    [normalizeText(matchId)],
  );
}

module.exports = {
  deleteAnalysisQueueItem,
  deleteInspirationCard,
  getInspirationCard,
  listAnalysisQueueItems,
  listInspirationCards,
  upsertAnalysisQueueItem,
  upsertInspirationCard,
};
