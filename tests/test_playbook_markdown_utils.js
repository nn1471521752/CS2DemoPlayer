const assert = require('assert');
const path = require('path');

const {
  buildGrenadeMarkdownDraft,
  buildGrenadePlaybookId,
  parseMarkdownFrontmatter,
  parsePlaybookGrenadeMarkdown,
  resolveGrenadeMarkdownRelativePath,
} = require('../src/main/playbook-markdown-utils.js');

const candidate = {
  sourceDemoChecksum: 'abcdef1234567890',
  sourceRoundNumber: 12,
  sourceEntityId: '42',
  title: 'Mirage T smoke by donk R12',
  mapId: 'de_mirage',
  grenadeType: 'smoke',
  side: 'T',
  throwerName: 'donk',
  throwTick: 100,
  detonateTick: 140,
  startPosition: { x: 10, y: 20, z: 30 },
  endPosition: { x: 16, y: 26, z: 36 },
  trajectory: [
    { tick: 100, x: 10, y: 20, z: 30 },
    { tick: 140, x: 16, y: 26, z: 36 },
  ],
  tags: ['smoke', 'window'],
  notes: 'Stand near T spawn.',
};

const parsed = parseMarkdownFrontmatter(`---
type: playbook-grenade
title: Mirage window smoke
tags:
  - playbook
  - smoke
source_demos: [abcdef1234567890]
source_rounds: [12]
trajectory_json: '[{"tick":100,"x":10}]'
---

# Body
`);

assert.deepStrictEqual(
  parsed.attributes,
  {
    type: 'playbook-grenade',
    title: 'Mirage window smoke',
    tags: ['playbook', 'smoke'],
    source_demos: ['abcdef1234567890'],
    source_rounds: ['12'],
    trajectory_json: '[{"tick":100,"x":10}]',
  },
  'should parse simple frontmatter, inline arrays, and YAML list values',
);
assert.strictEqual(parsed.body.trim(), '# Body', 'should return markdown body after frontmatter');

assert.strictEqual(
  buildGrenadePlaybookId(candidate),
  'grenade-de_mirage-t-smoke-r12-42-abcdef12',
  'should build stable readable grenade playbook ids from source identity',
);

assert.strictEqual(
  resolveGrenadeMarkdownRelativePath(candidate),
  path.join('Maps', 'de_mirage', 'Grenades', 't-smoke-r12-42-abcdef12.md'),
  'should place map-linked imported grenades under the map Grenades directory',
);

assert.strictEqual(
  resolveGrenadeMarkdownRelativePath({ ...candidate, mapId: '' }),
  path.join('_Inbox', 't-smoke-r12-42-abcdef12.md'),
  'should place imported grenades without map ids under _Inbox',
);

const draft = buildGrenadeMarkdownDraft(candidate, {
  now: '2026-04-29T00:40:00.000Z',
});

[
  'type: playbook-grenade',
  'sync_mode: obsidian-canonical',
  'playbook_id: grenade-de_mirage-t-smoke-r12-42-abcdef12',
  'title: Mirage T smoke by donk R12',
  'map_id: de_mirage',
  'side: T',
  'grenade_type: smoke',
  'source_demos: [abcdef1234567890]',
  'source_rounds: [12]',
  'source_demo_checksum: abcdef1234567890',
  'source_round_number: 12',
  'source_entity_id: 42',
  'trajectory_json: \'[{"tick":100,"x":10,"y":20,"z":30},{"tick":140,"x":16,"y":26,"z":36}]\'',
  '# Mirage T smoke by donk R12',
  'Stand near T spawn.',
].forEach((needle) => {
  assert.ok(draft.includes(needle), `draft should include ${needle}`);
});

const grenade = parsePlaybookGrenadeMarkdown(
  path.join('E:\\obsidian\\20-Playbook', resolveGrenadeMarkdownRelativePath(candidate)),
  draft,
  {
    indexedAt: '2026-04-29T00:41:00.000Z',
  },
);

assert.deepStrictEqual(
  {
    grenadeId: grenade.grenadeId,
    title: grenade.title,
    mapId: grenade.mapId,
    grenadeType: grenade.grenadeType,
    side: grenade.side,
    sourceDemoChecksum: grenade.sourceDemoChecksum,
    sourceRoundNumber: grenade.sourceRoundNumber,
    sourceEntityId: grenade.sourceEntityId,
    trajectory: grenade.trajectory,
    tags: grenade.tags,
    notes: grenade.notes,
    syncMode: grenade.syncMode,
    indexedAt: grenade.indexedAt,
  },
  {
    grenadeId: 'grenade-de_mirage-t-smoke-r12-42-abcdef12',
    title: 'Mirage T smoke by donk R12',
    mapId: 'de_mirage',
    grenadeType: 'smoke',
    side: 'T',
    sourceDemoChecksum: 'abcdef1234567890',
    sourceRoundNumber: 12,
    sourceEntityId: '42',
    trajectory: [
      { tick: 100, x: 10, y: 20, z: 30 },
      { tick: 140, x: 16, y: 26, z: 36 },
    ],
    tags: ['smoke', 'window'],
    notes: 'Stand near T spawn.',
    syncMode: 'obsidian-canonical',
    indexedAt: '2026-04-29T00:41:00.000Z',
  },
  'should parse generated markdown back to the SQLite index entry shape',
);

assert.ok(grenade.contentHash, 'should compute a content hash for conflict checks');

console.log('playbook markdown utils ok');
