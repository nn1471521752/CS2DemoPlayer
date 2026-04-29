const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rendererCssDir = path.join(__dirname, '../src/renderer/css');
const stylePath = path.join(rendererCssDir, 'style.css');
const styleSource = fs.readFileSync(stylePath, 'utf8');
const styleLines = styleSource.split(/\r?\n/).length;

assert.ok(
  styleLines <= 80,
  `style.css should stay as a small import manifest, got ${styleLines} lines`,
);

const importMatches = [...styleSource.matchAll(/@import url\('\.\/style\/([^']+)'\);/g)];

assert.ok(
  importMatches.length >= 4,
  'style.css should import split renderer CSS modules',
);

importMatches.forEach((match) => {
  const importedPath = path.join(rendererCssDir, 'style', match[1]);
  assert.ok(
    fs.existsSync(importedPath),
    `imported renderer CSS module should exist: ${match[1]}`,
  );

  const importedLineCount = fs.readFileSync(importedPath, 'utf8').split(/\r?\n/).length;
  assert.ok(
    importedLineCount <= 800,
    `${match[1]} should stay under 800 lines, got ${importedLineCount}`,
  );
});

console.log('renderer css structure ok');
