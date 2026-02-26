const WEAPON_ICON_DIRECTORY = 'assets/icons/weapons-png';

const WEAPON_ICON_FILENAME_BY_ID = Object.freeze({
  ak47: 'ak47.png',
  aug: 'aug.png',
  awp: 'awp.png',
  bizon: 'bizon.png',
  c4: 'c4.png',
  cz75a: 'cz75a.png',
  deagle: 'deagle.png',
  decoy: 'decoy.png',
  elite: 'elite.png',
  famas: 'famas.png',
  fiveseven: 'fiveseven.png',
  flashbang: 'flashbang.png',
  g3sg1: 'g3sg1.png',
  galilar: 'galilar.png',
  glock: 'glock.png',
  hegrenade: 'hegrenade.png',
  incgrenade: 'incgrenade.png',
  knife: 'knife.png',
  m249: 'm249.png',
  m4a1: 'm4a1.png',
  m4a1_silencer: 'm4a1_silencer.png',
  m4a4: 'm4a1_silencer_off.png',
  mac10: 'mac10.png',
  mag7: 'mag7.png',
  molotov: 'molotov.png',
  mp5sd: 'mp5sd.png',
  mp7: 'mp7.png',
  mp9: 'mp9.png',
  negev: 'negev.png',
  nova: 'nova.png',
  p2000: 'p2000.png',
  p250: 'p250.png',
  p90: 'p90.png',
  revolver: 'revolver.png',
  sawedoff: 'sawedoff.png',
  scar20: 'scar20.png',
  sg553: 'sg556.png',
  smokegrenade: 'smokegrenade.png',
  ssg08: 'ssg08.png',
  taser: 'taser.png',
  tec9: 'tec9.png',
  ump45: 'ump45.png',
  usp_silencer: 'usp_silencer.png',
  world: 'worldent.png',
  xm1014: 'xm1014.png',
});

const WEAPON_ICON_ALIAS_BY_KEY = Object.freeze({
  ak_47: 'ak47',
  bayonet: 'knife',
  bomb: 'c4',
  c4_explosive: 'c4',
  cz75: 'cz75a',
  desert_eagle: 'deagle',
  decoygrenade: 'decoy',
  dual_berettas: 'elite',
  five_7: 'fiveseven',
  five_seven: 'fiveseven',
  fn57: 'fiveseven',
  galil: 'galilar',
  galil_ar: 'galilar',
  glock_18: 'glock',
  he: 'hegrenade',
  he_grenade: 'hegrenade',
  high_explosive_grenade: 'hegrenade',
  hkp2000: 'p2000',
  incendiary: 'incgrenade',
  knife_ct: 'knife',
  knife_t: 'knife',
  m4a1_s: 'm4a1_silencer',
  m4a1_silencer_off: 'm4a4',
  mac_10: 'mac10',
  mp5: 'mp5sd',
  sawed_off: 'sawedoff',
  sg556: 'sg553',
  smoke: 'smokegrenade',
  smoke_grenade: 'smokegrenade',
  ssg_08: 'ssg08',
  tec_9: 'tec9',
  usp: 'usp_silencer',
  usp_s: 'usp_silencer',
  usps: 'usp_silencer',
  worldspawn: 'world',
  worldent: 'world',
  zeus: 'taser',
  zeusx27: 'taser',
});

const WEAPON_ICON_LABEL_BY_ID = Object.freeze({
  c4: 'C4',
  decoy: 'DC',
  flashbang: 'FB',
  hegrenade: 'HE',
  incgrenade: 'INC',
  molotov: 'MOL',
  smokegrenade: 'SMK',
  taser: 'ZS',
  world: '??',
});

const KNIFE_ICON_KEYWORDS = Object.freeze([
  'knife',
  'bayonet',
  'butterfly',
  'dagger',
  'falchion',
  'flip',
  'gut',
  'karambit',
  'kukri',
  'm9',
  'navaja',
  'nomad',
  'paracord',
  'skeleton',
  'stiletto',
  'survival',
  'talon',
  'ursus',
]);

const weaponIconCache = new Map();

function toSafeWeaponName(rawWeaponName) {
  if (typeof normalizeWeaponName === 'function') {
    return normalizeWeaponName(rawWeaponName);
  }
  return String(rawWeaponName || '').trim().toLowerCase().replace(/^weapon_/, '');
}

function normalizeWeaponKey(rawWeaponName) {
  const normalized = toSafeWeaponName(rawWeaponName);
  if (!normalized) {
    return '';
  }
  return normalized
    .replaceAll('-', '_')
    .replaceAll(' ', '_')
    .replaceAll('.', '')
    .replace(/^item_/, '');
}

function resolveAliasWeaponId(normalizedKey) {
  if (!normalizedKey) {
    return '';
  }

  const directAlias = WEAPON_ICON_ALIAS_BY_KEY[normalizedKey];
  if (directAlias) {
    return directAlias;
  }

  if (KNIFE_ICON_KEYWORDS.some((keyword) => normalizedKey.includes(keyword))) {
    return 'knife';
  }

  if (normalizedKey.includes('smoke')) return 'smokegrenade';
  if (normalizedKey.includes('flash')) return 'flashbang';
  if (normalizedKey.includes('molotov')) return 'molotov';
  if (normalizedKey.includes('decoy')) return 'decoy';
  if (normalizedKey.includes('incendiary')) return 'incgrenade';
  if (normalizedKey.includes('hegrenade')) return 'hegrenade';
  if (normalizedKey.includes('bomb') || normalizedKey.includes('c4')) return 'c4';
  return '';
}

function resolveWeaponIconId(rawWeaponName) {
  const normalizedKey = normalizeWeaponKey(rawWeaponName);
  if (!normalizedKey) {
    return '';
  }

  if (Object.prototype.hasOwnProperty.call(WEAPON_ICON_FILENAME_BY_ID, normalizedKey)) {
    return normalizedKey;
  }

  return resolveAliasWeaponId(normalizedKey);
}

function buildWeaponIconPath(iconId) {
  const iconFilename = WEAPON_ICON_FILENAME_BY_ID[iconId];
  if (!iconFilename) {
    return '';
  }
  return `${WEAPON_ICON_DIRECTORY}/${iconFilename}`;
}

function getWeaponIconPath(rawWeaponName) {
  const iconId = resolveWeaponIconId(rawWeaponName);
  if (!iconId) {
    return '';
  }

  return buildWeaponIconPath(iconId);
}

function createWeaponIconEntry(iconId) {
  const image = new Image();
  const entry = { iconId, image, loaded: false, failed: false };
  image.addEventListener('load', () => {
    entry.loaded = true;
    entry.failed = false;
  });
  image.addEventListener('error', () => {
    entry.loaded = false;
    entry.failed = true;
  });
  image.src = buildWeaponIconPath(iconId);
  return entry;
}

function getWeaponIconEntry(rawWeaponName) {
  const iconId = resolveWeaponIconId(rawWeaponName);
  if (!iconId) {
    return null;
  }

  if (!weaponIconCache.has(iconId)) {
    weaponIconCache.set(iconId, createWeaponIconEntry(iconId));
  }

  return weaponIconCache.get(iconId);
}

function isDrawableWeaponIcon(entry) {
  if (!entry || !entry.image || !entry.loaded || entry.failed) {
    return false;
  }

  return entry.image.naturalWidth > 0 && entry.image.naturalHeight > 0;
}

function getContainRect(naturalWidth, naturalHeight, x, y, size) {
  const safeWidth = Math.max(Number(naturalWidth) || 0, 1);
  const safeHeight = Math.max(Number(naturalHeight) || 0, 1);
  const scale = Math.min(size / safeWidth, size / safeHeight);
  const drawWidth = Math.max(1, safeWidth * scale);
  const drawHeight = Math.max(1, safeHeight * scale);
  return {
    drawX: x + ((size - drawWidth) / 2),
    drawY: y + ((size - drawHeight) / 2),
    drawWidth,
    drawHeight,
  };
}

function drawWeaponIconOnCanvas(renderContext, rawWeaponName, x, y, size) {
  const entry = getWeaponIconEntry(rawWeaponName);
  if (!isDrawableWeaponIcon(entry)) {
    return false;
  }

  try {
    const drawRect = getContainRect(entry.image.naturalWidth, entry.image.naturalHeight, x, y, size);
    renderContext.drawImage(entry.image, drawRect.drawX, drawRect.drawY, drawRect.drawWidth, drawRect.drawHeight);
    return true;
  } catch (_error) {
    entry.loaded = false;
    entry.failed = true;
    return false;
  }
}

function getWeaponIconFallbackLabel(rawWeaponName) {
  const iconId = resolveWeaponIconId(rawWeaponName);
  if (iconId && WEAPON_ICON_LABEL_BY_ID[iconId]) {
    return WEAPON_ICON_LABEL_BY_ID[iconId];
  }

  const normalized = normalizeWeaponKey(rawWeaponName);
  if (!normalized) {
    return '?';
  }

  const compact = normalized.replaceAll('_', '');
  return compact.slice(0, Math.min(3, compact.length)).toUpperCase() || '?';
}
