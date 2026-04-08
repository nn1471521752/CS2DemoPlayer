const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
  path.join(__dirname, '../src/renderer/index.html'),
  'utf8',
);

assert.ok(
  html.includes('>刷新</button>'),
  'should keep the top-right refresh action concise',
);

assert.ok(
  html.includes('<span>有 demo</span>'),
  'should keep the demo filter label concise',
);

assert.ok(
  html.includes('<span>胶着</span>'),
  'should keep the close-series filter label concise',
);

assert.ok(
  html.includes('<span>大赛</span>'),
  'should keep the featured-event filter label concise',
);

assert.ok(
  html.includes('>重置</button>'),
  'should keep the reset action concise',
);

assert.ok(
  !html.includes('抓最近比赛，筛值得看的对局，沉淀待分析队列和灵感卡片，再把可播放的 `.dem` 接回本地工作流。'),
  'should remove the verbose subtitle from the top area',
);

assert.ok(
  !html.includes('<span>Search</span>'),
  'should remove the extra search label from the top filter area',
);

console.log('hltv page copy contract ok');
