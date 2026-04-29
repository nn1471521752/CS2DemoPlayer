const crypto = require('crypto');
const path = require('path');

function normalizeText(value) {
  return String(value ?? '').trim();
}

function toInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeSlug(value, fallback = 'untitled') {
  const slug = normalizeText(value)
    .toLowerCase()
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function normalizeMapId(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSide(value) {
  const text = normalizeText(value).toUpperCase();
  if (text === 'T' || text === 'CT') {
    return text;
  }
  return text || 'unknown';
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean);
  }
  const text = normalizeText(value);
  if (!text) {
    return [];
  }
  if (text.startsWith('[') && text.endsWith(']')) {
    return text
      .slice(1, -1)
      .split(',')
      .map((part) => normalizeText(part).replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  return text.split(',').map(normalizeText).filter(Boolean);
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  const text = normalizeText(value);
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function normalizePosition(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      x: toFiniteNumber(value.x ?? value.X),
      y: toFiniteNumber(value.y ?? value.Y),
      z: toFiniteNumber(value.z ?? value.Z),
    };
  }
  const text = normalizeText(value);
  if (!text) {
    return { x: 0, y: 0, z: 0 };
  }
  try {
    return normalizePosition(JSON.parse(text));
  } catch (_error) {
    return { x: 0, y: 0, z: 0 };
  }
}

function stripYamlQuotes(value) {
  const text = normalizeText(value);
  if (
    (text.startsWith('"') && text.endsWith('"'))
    || (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function parseScalar(value) {
  const rawText = normalizeText(value);
  const isQuoted = (
    (rawText.startsWith('"') && rawText.endsWith('"'))
    || (rawText.startsWith("'") && rawText.endsWith("'"))
  );
  const text = stripYamlQuotes(value);
  if (isQuoted) {
    return text;
  }
  if (text === '[]') {
    return [];
  }
  if (text.startsWith('[') && text.endsWith(']')) {
    return normalizeArray(text);
  }
  return text;
}

function parseMarkdownFrontmatter(markdownText) {
  const text = String(markdownText || '').replace(/^\uFEFF/, '');
  if (!text.startsWith('---')) {
    return {
      attributes: {},
      body: text,
    };
  }

  const endIndex = text.indexOf('\n---', 3);
  if (endIndex < 0) {
    return {
      attributes: {},
      body: text,
    };
  }

  const rawFrontmatter = text.slice(3, endIndex).replace(/^\r?\n/, '');
  const body = text.slice(endIndex).replace(/^\r?\n---\r?\n?/, '');
  const attributes = {};
  let activeListKey = '';

  rawFrontmatter.split(/\r?\n/).forEach((line) => {
    if (!line.trim() || line.trimStart().startsWith('#')) {
      return;
    }
    const listMatch = line.match(/^\s*-\s*(.*)$/);
    if (listMatch && activeListKey) {
      attributes[activeListKey].push(stripYamlQuotes(listMatch[1]));
      return;
    }
    activeListKey = '';
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!keyMatch) {
      return;
    }
    const key = keyMatch[1];
    const rawValue = keyMatch[2] ?? '';
    if (!rawValue) {
      attributes[key] = [];
      activeListKey = key;
      return;
    }
    attributes[key] = parseScalar(rawValue);
  });

  return {
    attributes,
    body,
  };
}

function formatFrontmatterValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => normalizeText(item)).filter(Boolean).join(', ')}]`;
  }
  const text = normalizeText(value);
  if (!text) {
    return '';
  }
  if (/[\n\r]/.test(text)) {
    return JSON.stringify(text);
  }
  return text;
}

function buildFrontmatter(attributes, orderedKeys = []) {
  const seen = new Set();
  const lines = ['---'];
  const pushKey = (key) => {
    if (seen.has(key) || !Object.prototype.hasOwnProperty.call(attributes, key)) {
      return;
    }
    seen.add(key);
    lines.push(`${key}: ${formatFrontmatterValue(attributes[key])}`);
  };

  orderedKeys.forEach(pushKey);
  Object.keys(attributes).sort().forEach(pushKey);
  lines.push('---');
  return `${lines.join('\n')}\n`;
}

function buildPlaybookContentHash(markdownText) {
  return crypto.createHash('sha1').update(String(markdownText || ''), 'utf8').digest('hex');
}

function buildGrenadePlaybookId(entry = {}) {
  const existing = normalizeText(entry.playbookId ?? entry.playbook_id ?? entry.grenadeId);
  if (existing) {
    return normalizeSlug(existing);
  }
  const mapId = normalizeSlug(normalizeMapId(entry.mapId ?? entry.map_id) || 'unknown-map');
  const side = normalizeSlug(normalizeSide(entry.side), 'unknown');
  const grenadeType = normalizeSlug(entry.grenadeType ?? entry.grenade_type ?? 'grenade');
  const roundNumber = Math.max(0, toInteger(entry.sourceRoundNumber ?? entry.source_round_number));
  const entityId = normalizeSlug(entry.sourceEntityId ?? entry.source_entity_id ?? 'entity');
  const checksum = normalizeSlug(entry.sourceDemoChecksum ?? entry.source_demo_checksum ?? 'demo').slice(0, 8);
  return `grenade-${mapId}-${side}-${grenadeType}-r${roundNumber}-${entityId}-${checksum}`;
}

function buildGrenadeFileSlug(entry = {}) {
  const side = normalizeSlug(normalizeSide(entry.side), 'unknown');
  const grenadeType = normalizeSlug(entry.grenadeType ?? entry.grenade_type ?? 'grenade');
  const roundNumber = Math.max(0, toInteger(entry.sourceRoundNumber ?? entry.source_round_number));
  const entityId = normalizeSlug(entry.sourceEntityId ?? entry.source_entity_id ?? 'entity');
  const checksum = normalizeSlug(entry.sourceDemoChecksum ?? entry.source_demo_checksum ?? 'demo').slice(0, 8);
  return `${side}-${grenadeType}-r${roundNumber}-${entityId}-${checksum}`;
}

function resolveGrenadeMarkdownRelativePath(entry = {}) {
  const mapId = normalizeMapId(entry.mapId ?? entry.map_id);
  const fileName = `${buildGrenadeFileSlug(entry)}.md`;
  if (!mapId) {
    return path.join('_Inbox', fileName);
  }
  return path.join('Maps', mapId, 'Grenades', fileName);
}

function safeJsonString(value) {
  return JSON.stringify(value ?? null);
}

function buildGrenadeMarkdownDraft(entry = {}, options = {}) {
  const now = normalizeText(options.now) || new Date().toISOString();
  const playbookId = buildGrenadePlaybookId(entry);
  const title = normalizeText(entry.title) || 'Untitled grenade';
  const mapId = normalizeMapId(entry.mapId ?? entry.map_id);
  const sourceDemoChecksum = normalizeText(entry.sourceDemoChecksum ?? entry.source_demo_checksum);
  const sourceRoundNumber = Math.max(0, toInteger(entry.sourceRoundNumber ?? entry.source_round_number));
  const sourceEntityId = normalizeText(entry.sourceEntityId ?? entry.source_entity_id);
  const startPosition = normalizePosition(entry.startPosition);
  const endPosition = normalizePosition(entry.endPosition);
  const trajectory = normalizeJsonArray(entry.trajectory);
  const tags = normalizeArray(entry.tags);
  const notes = normalizeText(entry.notes);

  const attributes = {
    type: 'playbook-grenade',
    status: 'draft',
    project: 'CS2DemoPlayer',
    area: 'playbook',
    priority: 'P2',
    created: now,
    updated: now,
    tags,
    game: 'CS2',
    sync_mode: 'obsidian-canonical',
    playbook_id: playbookId,
    title,
    map_id: mapId,
    map_name: normalizeText(entry.mapName ?? entry.map_name),
    side: normalizeSide(entry.side),
    grenade_type: normalizeText(entry.grenadeType ?? entry.grenade_type) || 'unknown',
    lineup_area: normalizeText(entry.lineupArea ?? entry.lineup_area),
    target_area: normalizeText(entry.targetArea ?? entry.target_area),
    landing_area: normalizeText(entry.landingArea ?? entry.landing_area),
    difficulty: normalizeText(entry.difficulty),
    timing: normalizeText(entry.timing),
    lineup_type: normalizeText(entry.lineupType ?? entry.lineup_type),
    source_demos: sourceDemoChecksum ? [sourceDemoChecksum] : [],
    source_rounds: sourceRoundNumber > 0 ? [String(sourceRoundNumber)] : [],
    source_demo_checksum: sourceDemoChecksum,
    source_round_number: sourceRoundNumber > 0 ? String(sourceRoundNumber) : '',
    source_entity_id: sourceEntityId,
    throw_tick: String(Math.max(0, toInteger(entry.throwTick ?? entry.throw_tick))),
    detonate_tick: String(Math.max(0, toInteger(entry.detonateTick ?? entry.detonate_tick))),
    start_position_json: `'${safeJsonString(startPosition)}'`,
    end_position_json: `'${safeJsonString(endPosition)}'`,
    trajectory_json: `'${safeJsonString(trajectory)}'`,
    linked_tactics: [],
    linked_setups: [],
    indexed_at: '',
    content_hash: '',
    notes,
  };

  const orderedKeys = [
    'type',
    'status',
    'project',
    'area',
    'priority',
    'created',
    'updated',
    'tags',
    'game',
    'sync_mode',
    'playbook_id',
    'title',
    'map_id',
    'map_name',
    'side',
    'grenade_type',
    'lineup_area',
    'target_area',
    'landing_area',
    'difficulty',
    'timing',
    'lineup_type',
    'source_demos',
    'source_rounds',
    'source_demo_checksum',
    'source_round_number',
    'source_entity_id',
    'throw_tick',
    'detonate_tick',
    'start_position_json',
    'end_position_json',
    'trajectory_json',
    'linked_tactics',
    'linked_setups',
    'indexed_at',
    'content_hash',
    'notes',
  ];

  return `${buildFrontmatter(attributes, orderedKeys)}
# ${title}

> 自动从 CS2DemoPlayer Demo 回放页导入。Markdown 是 Playbook 权威源；SQLite 仅作为索引缓存。

## 一句话用途

- 这颗道具解决什么问题：
- 最适合的局面：

## 基本信息

- 地图：${mapId}
- 阵营：${normalizeSide(entry.side)}
- 类型：${normalizeText(entry.grenadeType ?? entry.grenade_type) || 'unknown'}
- 起点 / 站位：
- 目标 / 落点：
- 使用时机：
- 难度：

## 来源与证据

- Demo / 比赛来源：${sourceDemoChecksum}
- 回合 / 时间点：R${sourceRoundNumber || ''}
- Source entity：${sourceEntityId}

## 观察备注

${notes}
`;
}

function parsePlaybookGrenadeMarkdown(markdownPath, markdownText, options = {}) {
  const { attributes, body } = parseMarkdownFrontmatter(markdownText);
  if (normalizeText(attributes.type) !== 'playbook-grenade') {
    return null;
  }

  const title = normalizeText(attributes.title)
    || normalizeText(String(body).match(/^#\s+(.+)$/m)?.[1])
    || 'Untitled grenade';
  const playbookId = normalizeText(attributes.playbook_id) || normalizeSlug(path.basename(markdownPath));
  const sourceDemoChecksum = normalizeText(attributes.source_demo_checksum || normalizeArray(attributes.source_demos)[0]);
  const sourceRoundNumber = toInteger(attributes.source_round_number || normalizeArray(attributes.source_rounds)[0]);
  const sourceEntityId = normalizeText(attributes.source_entity_id) || playbookId;
  const notes = normalizeText(attributes.notes)
    || normalizeText(String(body).match(/## 观察备注\s+([\s\S]*?)(?:\n## |\s*$)/)?.[1]);

  return {
    grenadeId: playbookId,
    sourceDemoChecksum,
    sourceRoundNumber,
    sourceEntityId,
    title,
    mapId: normalizeMapId(attributes.map_id),
    grenadeType: normalizeText(attributes.grenade_type) || 'unknown',
    side: normalizeSide(attributes.side),
    throwerName: normalizeText(attributes.thrower_name),
    throwerSteamid: normalizeText(attributes.thrower_steamid),
    throwerTeamNum: toInteger(attributes.thrower_team_num),
    throwTick: toInteger(attributes.throw_tick),
    detonateTick: toInteger(attributes.detonate_tick),
    startPosition: normalizePosition(attributes.start_position_json),
    endPosition: normalizePosition(attributes.end_position_json),
    trajectory: normalizeJsonArray(attributes.trajectory_json),
    tags: normalizeArray(attributes.tags).filter((tag) => !['playbook', 'grenade'].includes(tag.toLowerCase())),
    notes,
    markdownPath,
    syncMode: normalizeText(attributes.sync_mode) || 'obsidian-canonical',
    contentHash: buildPlaybookContentHash(markdownText),
    indexedAt: normalizeText(options.indexedAt) || new Date().toISOString(),
  };
}

function updateMarkdownNotesSection(body, notes) {
  const normalizedNotes = normalizeText(notes);
  const replacement = `## 观察备注\n\n${normalizedNotes}\n`;
  if (/## 观察备注[\s\S]*?(?=\n## |\s*$)/.test(body)) {
    return body.replace(/## 观察备注[\s\S]*?(?=\n## |\s*$)/, replacement.trimEnd());
  }
  return `${String(body || '').trimEnd()}\n\n${replacement}`;
}

function updateGrenadeMarkdownText(markdownText, payload = {}, options = {}) {
  const parsed = parseMarkdownFrontmatter(markdownText);
  const attributes = { ...parsed.attributes };
  if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
    attributes.title = normalizeText(payload.title) || normalizeText(attributes.title);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'tags')) {
    attributes.tags = normalizeArray(payload.tags);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'notes')) {
    attributes.notes = normalizeText(payload.notes);
  }
  attributes.updated = normalizeText(options.now) || new Date().toISOString();

  const body = Object.prototype.hasOwnProperty.call(payload, 'notes')
    ? updateMarkdownNotesSection(parsed.body, payload.notes)
    : parsed.body;

  return `${buildFrontmatter(attributes)}\n${body.replace(/^\s+/, '')}`;
}

module.exports = {
  buildGrenadeMarkdownDraft,
  buildGrenadePlaybookId,
  buildPlaybookContentHash,
  normalizeArray,
  normalizeMapId,
  normalizeSlug,
  parseMarkdownFrontmatter,
  parsePlaybookGrenadeMarkdown,
  resolveGrenadeMarkdownRelativePath,
  updateGrenadeMarkdownText,
};
