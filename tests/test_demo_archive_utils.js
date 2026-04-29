const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  extractArchiveDemoEntries,
  parseArchiveDemoEntries,
} = require('../src/main/demo-archive-utils.js');

assert.deepStrictEqual(
  parseArchiveDemoEntries([
    'falcons-vs-nrg-m1-ancient.dem',
    'falcons-vs-nrg-m2-dust2.dem',
    'notes.txt',
    '',
  ].join('\n')),
  [
    'falcons-vs-nrg-m1-ancient.dem',
    'falcons-vs-nrg-m2-dust2.dem',
  ],
  'should keep only playable demo entries from archive listings',
);

(async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-archive-utils-test-'));
  try {
    const archiveSourceDir = path.join(tempRoot, 'archive-source');
    const outputDir = path.join(tempRoot, 'output');
    fs.mkdirSync(archiveSourceDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(path.join(archiveSourceDir, 'already.dem'), 'archive-version', 'utf8');
    fs.writeFileSync(path.join(archiveSourceDir, 'missing.dem'), 'new-version', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'already.dem'), 'cached-version', 'utf8');

    const archivePath = path.join(tempRoot, 'match.tar');
    execFileSync('tar', ['-cf', archivePath, '-C', archiveSourceDir, 'already.dem', 'missing.dem']);

    const extractedPaths = await extractArchiveDemoEntries(
      archivePath,
      outputDir,
      ['already.dem', 'missing.dem'],
    );

    assert.deepStrictEqual(
      extractedPaths.map((entryPath) => path.basename(entryPath)).sort(),
      ['already.dem', 'missing.dem'],
      'should return both cached and newly extracted playable demo paths',
    );
    assert.strictEqual(
      fs.readFileSync(path.join(outputDir, 'already.dem'), 'utf8'),
      'cached-version',
      'should not overwrite playable demo files that were already extracted',
    );
    assert.strictEqual(
      fs.readFileSync(path.join(outputDir, 'missing.dem'), 'utf8'),
      'new-version',
      'should still extract playable demo files that are missing from the output directory',
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log('demo archive utils ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
