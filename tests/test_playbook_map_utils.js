const assert = require('assert');

const {
  buildDisplayName,
  buildPlaybookMapEntries,
  buildRadarImagePath,
  normalizeMapId,
} = require('../src/main/playbook-map-utils.js');

assert.strictEqual(
  normalizeMapId(' Mirage '),
  'de_mirage',
  'should normalize bare map names to CS map ids',
);

assert.strictEqual(
  buildDisplayName('de_mirage'),
  'Mirage',
  'should build readable display names from map ids',
);

assert.strictEqual(
  buildRadarImagePath('de_mirage'),
  'assets/maps/de_mirage.png',
  'should expose renderer-relative radar image paths',
);

assert.deepStrictEqual(
  buildPlaybookMapEntries(
    {
      de_mirage: {
        pos_x: '-3230',
        pos_y: 1713,
        scale: '5',
        threshold_z: 0,
      },
      ' cs_office ': {
        pos_x: -1838,
        pos_y: 1858,
        scale: 4.1,
        threshold_z: 0,
      },
    },
    {
      hasRadarImage: (mapId) => mapId === 'de_mirage',
    },
  ),
  [
    {
      mapId: 'cs_office',
      displayName: 'Office',
      radarImagePath: 'assets/maps/cs_office.png',
      hasRadarImage: false,
      posX: -1838,
      posY: 1858,
      scale: 4.1,
      thresholdZ: 0,
      source: 'map-meta',
      isActive: true,
    },
    {
      mapId: 'de_mirage',
      displayName: 'Mirage',
      radarImagePath: 'assets/maps/de_mirage.png',
      hasRadarImage: true,
      posX: -3230,
      posY: 1713,
      scale: 5,
      thresholdZ: 0,
      source: 'map-meta',
      isActive: true,
    },
  ],
  'should build stable read-only playbook map entries from map meta',
);

console.log('playbook map utils ok');
