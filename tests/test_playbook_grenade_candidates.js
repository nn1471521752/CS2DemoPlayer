const assert = require('assert');

const {
  buildPlaybookGrenadeCandidates,
  buildPlaybookGrenadeCandidateTitle,
  normalizePlaybookGrenadeType,
  resolvePlaybookSideFromTeamNum,
} = require('../src/renderer/js/ui/playbook-grenade-candidate-utils.js');

const frames = [
  {
    tick: 100,
    grenades: [
      {
        entity_id: 42,
        grenade_type: 'smokegrenade',
        x: 10,
        y: 20,
        z: 30,
        thrower_name: 'donk',
        thrower_steamid: '7656119',
        thrower_team_num: 2,
      },
      {
        entity_id: 7,
        grenade_type: 'flashbang',
        x: -1,
        y: -2,
        z: 3,
        thrower_name: 'zont1x',
        thrower_steamid: '7656120',
        thrower_team_num: 3,
      },
    ],
  },
  {
    tick: 101,
    grenades: [
      {
        entity_id: 42,
        grenade_type: 'smokegrenade',
        x: 15,
        y: 25,
        z: 35,
        thrower_name: 'donk',
        thrower_steamid: '7656119',
        thrower_team_num: 2,
      },
    ],
    grenade_events: [
      {
        tick: 101,
        event_type: 'smoke_start',
        grenade_type: 'smoke',
        entity_id: 42,
        x: 16,
        y: 26,
        z: 36,
        thrower_name: 'donk',
        thrower_steamid: '7656119',
        thrower_team_num: 2,
      },
    ],
  },
];

assert.strictEqual(normalizePlaybookGrenadeType('smokegrenade'), 'smoke');
assert.strictEqual(normalizePlaybookGrenadeType('weapon_flashbang'), 'flash');
assert.strictEqual(resolvePlaybookSideFromTeamNum(2), 'T');
assert.strictEqual(resolvePlaybookSideFromTeamNum(3), 'CT');
assert.strictEqual(resolvePlaybookSideFromTeamNum(0), 'unknown');

const candidates = buildPlaybookGrenadeCandidates(frames, {
  sourceDemoChecksum: 'demo-checksum',
  sourceRoundNumber: 12,
  mapId: 'de_mirage',
});

assert.strictEqual(candidates.length, 2, 'should build one candidate per grenade entity');

const smoke = candidates.find((candidate) => candidate.sourceEntityId === '42');
assert.ok(smoke, 'expected smoke candidate');
assert.deepStrictEqual(
  {
    sourceDemoChecksum: smoke.sourceDemoChecksum,
    sourceRoundNumber: smoke.sourceRoundNumber,
    sourceEntityId: smoke.sourceEntityId,
    mapId: smoke.mapId,
    grenadeType: smoke.grenadeType,
    side: smoke.side,
    throwerName: smoke.throwerName,
    throwerSteamid: smoke.throwerSteamid,
    throwerTeamNum: smoke.throwerTeamNum,
    throwTick: smoke.throwTick,
    detonateTick: smoke.detonateTick,
    startPosition: smoke.startPosition,
    endPosition: smoke.endPosition,
    trajectory: smoke.trajectory,
  },
  {
    sourceDemoChecksum: 'demo-checksum',
    sourceRoundNumber: 12,
    sourceEntityId: '42',
    mapId: 'de_mirage',
    grenadeType: 'smoke',
    side: 'T',
    throwerName: 'donk',
    throwerSteamid: '7656119',
    throwerTeamNum: 2,
    throwTick: 100,
    detonateTick: 101,
    startPosition: { x: 10, y: 20, z: 30 },
    endPosition: { x: 16, y: 26, z: 36 },
    trajectory: [
      { tick: 100, x: 10, y: 20, z: 30 },
      { tick: 101, x: 15, y: 25, z: 35 },
    ],
  },
  'should aggregate trajectory and event endpoint',
);
assert.strictEqual(smoke.title, 'Mirage T smoke by donk R12', 'should build readable default title');

assert.strictEqual(
  buildPlaybookGrenadeCandidateTitle({
    mapId: 'de_nuke',
    side: 'CT',
    grenadeType: 'flash',
    throwerName: '',
    sourceRoundNumber: 3,
  }),
  'Nuke CT flash R3',
);

console.log('playbook grenade candidates ok');
