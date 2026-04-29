const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
  path.join(__dirname, '../src/renderer/index.html'),
  'utf8',
);
const localLibraryPageSource = fs.readFileSync(
  path.join(__dirname, '../src/renderer/js/ui/hltv-local-library-page.js'),
  'utf8',
);
const hltvPageSource = fs.readFileSync(
  path.join(__dirname, '../src/renderer/js/ui/hltv-page.js'),
  'utf8',
);
const homeShellSource = fs.readFileSync(
  path.join(__dirname, '../src/renderer/js/ui/home-shell.js'),
  'utf8',
);
const playbookPageSource = fs.existsSync(path.join(__dirname, '../src/renderer/js/ui/playbook-page.js'))
  ? fs.readFileSync(path.join(__dirname, '../src/renderer/js/ui/playbook-page.js'), 'utf8')
  : '';
const librarySource = fs.readFileSync(
  path.join(__dirname, '../src/renderer/js/ui/library.js'),
  'utf8',
);
const playbookRendererSource = `${playbookPageSource}\n${librarySource}`;

assert.ok(
  html.includes('>刷新</button>'),
  'should keep the top-right refresh action concise',
);

assert.ok(
  html.includes('<span>有 demo</span>'),
  'should keep the demo filter label concise',
);

assert.ok(
  html.includes('hltv-results-layout'),
  'should keep the HLTV results layout container',
);

assert.ok(
  html.includes('hltv-results-toolbar'),
  'should expose a compact results toolbar instead of a left-side dashboard panel',
);

[
  'Stars',
  'Time',
  'Match type',
  'Map',
  'Event',
  'Player',
  'Team',
  'Game',
  'Valve ranked',
].forEach((label) => {
  assert.ok(
    !html.includes(`>${label}<`),
    `should remove unused HLTV-style filter row: ${label}`,
  );
});

assert.ok(
  !html.includes('External Source'),
  'should remove the redundant External Source eyebrow from the HLTV page',
);

assert.ok(
  !html.includes('hltv-filters-panel'),
  'should remove the left-side filters panel to give more width to match content',
);

assert.ok(
  html.includes('hltv-results-content'),
  'should expose a right-side results content area',
);

assert.ok(
  html.includes('hltv-filter-inline'),
  'should expose search and toggles as compact inline controls',
);

assert.ok(
  html.includes('btn-hltv-search'),
  'should expose a compact HLTV online search action',
);

[
  'id="playbook-page"',
  'id="playbook-summary"',
  'id="playbook-map-grid"',
  'id="playbook-round-grenade-candidates"',
  'id="btn-playbook-import-grenades"',
  'id="playbook-round-grenade-status"',
  'js/ui/playbook-grenade-candidate-utils.js',
  'js/ui/playbook-page-utils.js',
  'js/ui/playbook-page.js',
].forEach((needle) => {
  assert.ok(
    html.includes(needle),
    `should expose Playbook phase-1 page shell: ${needle}`,
  );
});

[
  "ipcRenderer.invoke('playbook-get-state'",
  "ipcRenderer.invoke('playbook-import-selected-grenades'",
  "ipcRenderer.invoke('playbook-update-grenade'",
  'loadPlaybookState',
  'renderPlaybookMaps',
  'renderPlaybookGrenades',
  'data-playbook-grenade-title',
  'data-playbook-grenade-notes',
  'data-playbook-grenade-tags',
  'data-playbook-grenade-save',
].forEach((needle) => {
  assert.ok(
    playbookRendererSource.includes(needle),
    `should expose Playbook renderer wiring: ${needle}`,
  );
});

[
  'Local Workspace',
  'Local demos',
  'Demo 库',
  '本地资料库',
  'Local HLTV Cache',
  'Entity Workspace',
  'Tactical Playbook',
  '浏览本地 demo，进入回放，或从 HLTV 获取比赛后回到这里继续处理。',
  '本地搜索已缓存的 HLTV 比赛、战队和选手；需要新数据时去 HLTV 页手动刷新。',
  'Review pending candidates from parsed demos, then browse approved teams and players.',
  '浏览只读地图库，并为后续投掷物、战术和架构沉淀提供基础入口。',
  'id="playbook-panel-tactics"',
  'id="playbook-panel-setups"',
].forEach((needle) => {
  assert.ok(
    !html.includes(needle),
    `should remove dense or future-only workspace chrome: ${needle}`,
  );
});

[
  "label: 'Demo'",
  "label: 'HLTV'",
  "label: 'Library'",
  "label: 'Playbook'",
].forEach((needle) => {
  assert.ok(
    homeShellSource.includes(needle),
    `should expose concise home nav label: ${needle}`,
  );
});

assert.ok(
  homeShellSource.indexOf("label: 'Demo'") < homeShellSource.indexOf("label: 'HLTV'")
    && homeShellSource.indexOf("label: 'HLTV'") < homeShellSource.indexOf("label: 'Library'")
    && homeShellSource.indexOf("label: 'Library'") < homeShellSource.indexOf("label: 'Playbook'")
    && homeShellSource.indexOf("label: 'Playbook'") > -1,
  'should order home nav by the modern workflow: Demo, HLTV, Library, Playbook',
);

[
  "label: 'Entities'",
  'HOME_SECTION_IDS.entities',
  'loadEntitiesPageState',
  'id="entities-page"',
  'js/ui/entities-page-utils.js',
  'js/ui/entities-page.js',
].forEach((needle) => {
  assert.ok(
    !`${html}\n${homeShellSource}`.includes(needle),
    `should remove the retired Entities frontend surface: ${needle}`,
  );
});

assert.ok(
  !homeShellSource.includes("label: 'Demo \\u5e93'")
    && !homeShellSource.includes("label: '本地资料库'"),
  'should not keep the old mixed-language dense nav labels',
);

assert.ok(
  !playbookPageSource.includes('PLAYBOOK_TAB_IDS.tactics')
    && !playbookPageSource.includes('PLAYBOOK_TAB_IDS.setups'),
  'should not render future-only Playbook tabs in the current minimal page',
);

assert.ok(
  html.includes('btn-local-library-clear-all') && html.includes('>清除全部</button>'),
  'should expose a full-clear action for the permanent local HLTV cache',
);

[
  'id="btn-local-library-refresh" type="button" class="page-action-button"',
  'id="btn-local-library-clear-all" type="button" class="page-action-button is-danger"',
  'id="btn-local-library-open-hltv" type="button" class="page-action-button"',
].forEach((needle) => {
  assert.ok(
    html.includes(needle),
    `should apply the shared page action button styling contract: ${needle}`,
  );
});

assert.ok(
  !localLibraryPageSource.includes(' is-active'),
  'local library tabs should use the shared active tab class that the stylesheet already styles',
);

assert.ok(
  !playbookPageSource.includes(' is-active'),
  'playbook tabs should use the shared active tab class that the stylesheet already styles',
);

[
  '加入本地游戏库',
  "ipcRenderer.invoke('hltv-cache-clear-all'",
  "ipcRenderer.invoke('hltv-cache-add-to-game-library'",
  'response?.ok === false',
  "reason === 'not_found'",
].forEach((needle) => {
  assert.ok(
    localLibraryPageSource.includes(needle),
    `should expose local-library cache action wiring: ${needle}`,
  );
});

[
  "async function openDemoFromPath(demoPath, matchId = '')",
  'matchId: normalizeText(matchId)',
  'await openDemoFromPath(source.playableDemoPaths[0], matchId);',
  'await openDemoFromPath(demoPath, matchId);',
  'matchId: matchItem.matchId,\n          demoPath,',
].forEach((needle) => {
  assert.ok(
    hltvPageSource.includes(needle),
    `should preserve HLTV matchId when opening an extracted demo: ${needle}`,
  );
});

assert.ok(
  !html.includes('<span>胶着</span>'),
  'should remove the close-series filter after browse-only simplification',
);

assert.ok(
  !html.includes('<span>大赛</span>'),
  'should remove the featured-event filter after browse-only simplification',
);

assert.ok(
  !html.includes('local-library-filter-queued-only'),
  'should remove the queued-only local-library filter',
);

assert.ok(
  !html.includes('local-library-filter-cards-only'),
  'should remove the cards-only local-library filter',
);

assert.ok(
  !html.includes('Analysis Queue'),
  'should remove the obsolete analysis queue section',
);

assert.ok(
  !html.includes('Inspiration Cards'),
  'should remove the obsolete inspiration cards section',
);

assert.ok(
  !html.includes('????????'),
  'should not render broken question-mark placeholder text',
);

assert.ok(
  !html.includes('抓最近比赛，筛值得看的对局，沉淀待分析队列和灵感卡片，再把可播放的 `.dem` 接回本地工作流。'),
  'should remove the verbose subtitle from the top area',
);

assert.ok(
  !html.includes('<span>Search</span>'),
  'should avoid a separate search label row in the compact toolbar',
);

console.log('hltv page copy contract ok');
