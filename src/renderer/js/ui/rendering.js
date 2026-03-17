const HUD_OUTER_PADDING = 2;       // 压缩外侧边距到最小 (2px)
const HUD_COLUMN_GAP = 4;          // 侧边栏与地图的内侧间距
const HUD_PANEL_MIN_WIDTH = 90
const HUD_PANEL_MAX_WIDTH = 180;
const HUD_MIN_MAP_SIZE = 360;
const HUD_PLAYER_SLOT_GAP = 2;     // 缩小槽位之间的上下间距
const HUD_PLAYER_SLOTS = 5;
const HUD_TEAM_HEADER_MIN_HEIGHT = 22;
const HUD_TEAM_HEADER_MAX_HEIGHT = 30;
const DISPLAY_TICKRATE = 64;
const REPLAY_CANVAS_MIN_HEIGHT = 420;
const REPLAY_CANVAS_SAFE_GUTTER = 12;
const HUD_PANEL_WIDTH_BY_HEIGHT_RATIO = 0.14;
const PLAYER_SHOT_EFFECT_WINDOW_SECONDS = 0.18;
const PLAYER_SHOT_TRACER_WORLD_UNITS = 240;
const PLAYER_SHOT_MAX_EFFECTS = 10;
const PLAYER_BLIND_LOOKBACK_SECONDS = 6;
const PLAYER_BLIND_MIN_DURATION_SECONDS = 0.12;
const TEAM_PANEL_FALLBACK_NAME_BY_TEAM = Object.freeze({
  [TEAM_NUM_T]: 'T Side',
  [TEAM_NUM_CT]: 'CT Side',
});

function getCanvasPixelRatio() {
  if (typeof window === 'undefined') {
    return 1;
  }
  return Math.max(window.devicePixelRatio || 1, 1);
}

function getCanvasDisplayWidth() {
  const inlineWidth = Number.parseFloat(canvas.style.width);
  if (Number.isFinite(inlineWidth) && inlineWidth > 0) {
    return inlineWidth;
  }
  return Math.max(1, canvas.clientWidth || canvas.width);
}

function getCanvasDisplayHeight() {
  const inlineHeight = Number.parseFloat(canvas.style.height);
  if (Number.isFinite(inlineHeight) && inlineHeight > 0) {
    return inlineHeight;
  }
  return Math.max(1, canvas.clientHeight || canvas.height);
}

function syncCanvasContextScale(pixelRatio = getCanvasPixelRatio()) {
  if (typeof ctx.setTransform === 'function') {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) {
    ctx.imageSmoothingQuality = 'high';
  }
}

function syncCanvasBackingStore(displayWidth, displayHeight, force = false) {
  const safeDisplayWidth = Math.max(1, Math.round(Number(displayWidth) || 0));
  const safeDisplayHeight = Math.max(1, Math.round(Number(displayHeight) || 0));
  const pixelRatio = getCanvasPixelRatio();
  const targetPixelWidth = Math.max(1, Math.round(safeDisplayWidth * pixelRatio));
  const targetPixelHeight = Math.max(1, Math.round(safeDisplayHeight * pixelRatio));
  const targetStyleWidth = `${safeDisplayWidth}px`;
  const targetStyleHeight = `${safeDisplayHeight}px`;

  if (
    !force
    && canvas.width === targetPixelWidth
    && canvas.height === targetPixelHeight
    && canvas.style.width === targetStyleWidth
    && canvas.style.height === targetStyleHeight
  ) {
    syncCanvasContextScale(pixelRatio);
    return false;
  }

  canvas.style.width = targetStyleWidth;
  canvas.style.height = targetStyleHeight;
  canvas.width = targetPixelWidth;
  canvas.height = targetPixelHeight;
  syncCanvasContextScale(pixelRatio);
  return true;
}

let currentMapViewport = {
  x: 0,
  y: 0,
  width: getCanvasDisplayWidth(),
  height: getCanvasDisplayHeight(),
  scaleX: getCanvasDisplayWidth() / DEFAULT_RADAR_SIZE,
  scaleY: getCanvasDisplayHeight() / DEFAULT_RADAR_SIZE,
};
let currentPlaybackTick = 0;
let currentPlaybackTickRaw = 0;

function lerpNumber(startValue, endValue, alpha) {
  return startValue + ((endValue - startValue) * alpha);
}

function lerpAngleDegrees(startDegrees, endDegrees, alpha) {
  let delta = (endDegrees - startDegrees) % 360;
  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }

  return startDegrees + (delta * alpha);
}

function getPlaybackSubstepsPerTick() {
  return Math.max(1, Math.round(DISPLAY_TICKRATE / Math.max(currentTickrate, 1)));
}

function quantizePlaybackTick(tickValue) {
  const substeps = getPlaybackSubstepsPerTick();
  return Math.round(tickValue * substeps) / substeps;
}

function buildFullCanvasMapViewport() {
  const radarSize = currentRadarSize > 0 ? currentRadarSize : DEFAULT_RADAR_SIZE;
  const displayWidth = getCanvasDisplayWidth();
  const displayHeight = getCanvasDisplayHeight();
  return {
    x: 0,
    y: 0,
    width: displayWidth,
    height: displayHeight,
    scaleX: displayWidth / radarSize,
    scaleY: displayHeight / radarSize,
  };
}

function updateMapViewport(viewport) {
  if (!viewport || !Number.isFinite(Number(viewport.width)) || !Number.isFinite(Number(viewport.height))) {
    currentMapViewport = buildFullCanvasMapViewport();
    return currentMapViewport;
  }

  const radarSize = currentRadarSize > 0 ? currentRadarSize : DEFAULT_RADAR_SIZE;
  const safeWidth = Math.max(1, Number(viewport.width));
  const safeHeight = Math.max(1, Number(viewport.height));
  currentMapViewport = {
    x: Number(viewport.x) || 0,
    y: Number(viewport.y) || 0,
    width: safeWidth,
    height: safeHeight,
    scaleX: safeWidth / radarSize,
    scaleY: safeHeight / radarSize,
  };
  return currentMapViewport;
}

function parsePxValue(value) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getElementOuterHeightPx(element) {
  if (!element) {
    return 0;
  }

  const styles = window.getComputedStyle(element);
  return element.offsetHeight + parsePxValue(styles.marginTop) + parsePxValue(styles.marginBottom);
}

function getReplayCanvasTargetHeight() {
  const viewportHeight = Math.max(window.innerHeight || 0, REPLAY_CANVAS_MIN_HEIGHT);
  const bodyStyles = window.getComputedStyle(document.body);
  const bodyPadding = parsePxValue(bodyStyles.paddingTop) + parsePxValue(bodyStyles.paddingBottom);
  const toolbarHeight = getElementOuterHeightPx(document.querySelector('.app-toolbar'));
  const headerHeight = getElementOuterHeightPx(document.querySelector('#replay-view .replay-header'));
  const controlsHeight = getElementOuterHeightPx(document.querySelector('#replay-view .replay-controls'));
  const availableHeight = viewportHeight
    - bodyPadding
    - toolbarHeight
    - headerHeight
    - controlsHeight
    - REPLAY_CANVAS_SAFE_GUTTER;

  return Math.max(REPLAY_CANVAS_MIN_HEIGHT, Math.floor(availableHeight));
}

function getHudPanelWidthByHeight(innerHeight) {
  const desiredWidth = innerHeight * HUD_PANEL_WIDTH_BY_HEIGHT_RATIO;
  return clamp(desiredWidth, 40, HUD_PANEL_MAX_WIDTH);
}

function syncReplayCanvasSize(force = false) {
  if (replayView && replayView.classList.contains('is-hidden')) {
    return false;
  }

  const targetHeight = getReplayCanvasTargetHeight();
  const innerHeight = Math.max(targetHeight - (HUD_OUTER_PADDING * 2), 1);
  const mapSize = innerHeight;
  const panelWidth = getHudPanelWidthByHeight(innerHeight);
  const targetWidth = Math.max(
    1,
    Math.round((HUD_OUTER_PADDING * 2) + mapSize + (panelWidth * 2) + (HUD_COLUMN_GAP * 2)),
  );

  return syncCanvasBackingStore(targetWidth, targetHeight, force);
}

function buildCanvasHudLayout() {
  const outer = HUD_OUTER_PADDING;
  const displayWidth = getCanvasDisplayWidth();
  const displayHeight = getCanvasDisplayHeight();
  const innerWidth = Math.max(displayWidth - (outer * 2), 1);
  const innerHeight = Math.max(displayHeight - (outer * 2), 1);
  const mapSize = innerHeight;
  const desiredPanelWidth = getHudPanelWidthByHeight(innerHeight);
  const maxPanelWidthByCanvas = Math.max(40, (innerWidth - mapSize - (HUD_COLUMN_GAP * 2)) / 2);
  const panelWidth = clamp(desiredPanelWidth, 40, maxPanelWidthByCanvas);
  const leftPanelX = outer;
  const mapX = leftPanelX + panelWidth + HUD_COLUMN_GAP;
  const mapY = outer;
  const rightPanelX = mapX + mapSize + HUD_COLUMN_GAP;
  const contentRight = rightPanelX + panelWidth;
  const killAreaWidth = Math.min(200, Math.max(100, panelWidth + 36));

  return {
    leftPanel: { x: leftPanelX, y: outer, width: panelWidth, height: innerHeight },
    map: { x: mapX, y: mapY, width: mapSize, height: mapSize },
    rightPanel: { x: rightPanelX, y: outer, width: panelWidth, height: innerHeight },
    killArea: {
      x: Math.max(outer, contentRight - killAreaWidth),
      y: outer + 4,
      width: killAreaWidth,
    },
  };
}

function worldToCanvas(gameX, gameY, scaleX, scaleY) {
  const mapMeta = currentMapMeta || DEFAULT_MAP_META;
  const safeScaleX = Number.isFinite(Number(scaleX)) ? Number(scaleX) : currentMapViewport.scaleX;
  const safeScaleY = Number.isFinite(Number(scaleY)) ? Number(scaleY) : currentMapViewport.scaleY;
  const pixelX = (gameX - mapMeta.pos_x) / mapMeta.scale;
  const pixelY = (mapMeta.pos_y - gameY) / mapMeta.scale;

  return {
    x: currentMapViewport.x + (pixelX * safeScaleX),
    y: currentMapViewport.y + (pixelY * safeScaleY),
  };
}

function drawCanvasBackdrop() {
  const displayWidth = getCanvasDisplayWidth();
  const displayHeight = getCanvasDisplayHeight();
  const gradient = ctx.createLinearGradient(0, 0, displayWidth, displayHeight);
  gradient.addColorStop(0, '#0b1018');
  gradient.addColorStop(1, '#0f1724');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, displayWidth, displayHeight);
}

function drawFallbackBackground(viewport = currentMapViewport) {
  const target = viewport || buildFullCanvasMapViewport();
  ctx.fillStyle = '#222';
  ctx.fillRect(target.x, target.y, target.width, target.height);

  if (radarImageFailed) {
    ctx.fillStyle = '#888';
    ctx.font = '14px Segoe UI';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Radar image missing: ${currentRadarImagePath}`, target.x + 16, target.y + 16);
  }
}

function drawRadarBackground(viewport = currentMapViewport) {
  const target = viewport || buildFullCanvasMapViewport();
  if (radarImageReady && radarImg.naturalWidth > 0 && radarImg.naturalHeight > 0) {
    try {
      ctx.drawImage(radarImg, target.x, target.y, target.width, target.height);
      return;
    } catch (err) {
      radarImageReady = false;
      radarImageFailed = true;
      console.warn(`[Radar] drawImage failed, fallback enabled: ${err.message}`);
    }
  }

  drawFallbackBackground(target);
}

function drawMapFrame(viewport) {
  drawRadarBackground(viewport);
}

function worldRadiusToCanvasRadius(worldRadius, scaleX, scaleY) {
  const mapScale = Number(currentMapMeta?.scale) || Number(FALLBACK_MAP_META.scale) || 1;
  const radarRadius = worldRadius / mapScale;
  return radarRadius * ((scaleX + scaleY) / 2);
}

function getGrenadeLookbackFrameCount() {
  const effectFrames = Math.ceil((MAX_GRENADE_EFFECT_SECONDS + MAX_GRENADE_TRAIL_PERSIST_SECONDS) * currentTickrate) + 8;
  return Math.max(GRENADE_TRAIL_MAX_FRAMES, effectFrames);
}

function toGrenadePoint(grenade, frameIndex, tick) {
  const x = Number(grenade?.x);
  const y = Number(grenade?.y);
  const z = Number(grenade?.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  const pointTick = Number.isFinite(Number(tick)) ? Number(tick) : frameIndex;
  return { x, y, z, frameIndex, tick: pointTick };
}

function getGrenadeEntityId(grenade, point) {
  void point;
  if (grenade?.entity_id !== undefined && grenade?.entity_id !== null) {
    return String(grenade.entity_id);
  }

  return '';
}

function createGrenadeTrail(entityId, grenadeType, point, frameIndex, frameTick, throwerTeamNum = null) {
  return {
    entityId,
    grenadeType: String(grenadeType || 'unknown'),
    points: [],
    firstSeenFrameIndex: frameIndex,
    lastSeenFrameIndex: frameIndex,
    firstSeenTick: frameTick,
    lastSeenTick: frameTick,
    throwerTeamNum: Number.isFinite(Number(throwerTeamNum)) ? Number(throwerTeamNum) : null,
  };
}

function getOrCreateGrenadeTrail(trailsByEntity, grenade, point, frameIndex, frameTick) {
  const entityId = getGrenadeEntityId(grenade, point);
  if (!entityId) {
    return null;
  }
  if (!trailsByEntity.has(entityId)) {
    trailsByEntity.set(
      entityId,
      createGrenadeTrail(entityId, grenade?.grenade_type, point, frameIndex, frameTick, grenade?.thrower_team_num),
    );
  }
  return trailsByEntity.get(entityId);
}

function updateGrenadeTrailMotion(trail, frameIndex, frameTick) {
  trail.lastSeenFrameIndex = frameIndex;
  trail.lastSeenTick = frameTick;
}

function collectGrenadeTrails(firstTrailFrame, safeFrameIndex) {
  const trailsByEntity = new Map();

  for (let frameIndex = firstTrailFrame; frameIndex <= safeFrameIndex; frameIndex += 1) {
    const frameTick = getFrameTick(frameIndex);
    const frameGrenades = framesData[frameIndex]?.grenades;
    if (!Array.isArray(frameGrenades) || frameGrenades.length === 0) {
      continue;
    }

    for (const grenade of frameGrenades) {
      const point = toGrenadePoint(grenade, frameIndex, frameTick);
      if (!point) {
        continue;
      }

      const trail = getOrCreateGrenadeTrail(trailsByEntity, grenade, point, frameIndex, frameTick);
      if (!trail) {
        continue;
      }
      trail.grenadeType = String(grenade?.grenade_type || trail.grenadeType);
      if (trail.throwerTeamNum === null && Number.isFinite(Number(grenade?.thrower_team_num))) {
        trail.throwerTeamNum = Number(grenade.thrower_team_num);
      }
      updateGrenadeTrailMotion(trail, frameIndex, frameTick);
      trail.points.push(point);
    }
  }

  return trailsByEntity;
}

function getGrenadeEventEntityId(event) {
  if (!event || typeof event !== 'object') {
    return '';
  }

  if (event.entity_id !== undefined && event.entity_id !== null) {
    return String(event.entity_id);
  }
  if (event.projectile_id !== undefined && event.projectile_id !== null) {
    return String(event.projectile_id);
  }
  return '';
}

function toGrenadeEventPoint(event) {
  const x = Number(event?.x);
  const y = Number(event?.y);
  const z = Number(event?.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  return { x, y, z };
}

function getOrCreateGrenadeEventState(statesByEntity, entityId) {
  if (!statesByEntity.has(entityId)) {
    statesByEntity.set(entityId, {
      smokeStart: null,
      smokeEnd: null,
      heExplode: null,
      flashExplode: null,
      infernoStart: null,
      infernoEnd: null,
      throwerTeamNum: null,
    });
  }
  return statesByEntity.get(entityId);
}

function collectGrenadeEventStates(firstFrameIndex, safeFrameIndex) {
  const statesByEntity = new Map();
  for (let frameIndex = firstFrameIndex; frameIndex <= safeFrameIndex; frameIndex += 1) {
    const frameEvents = framesData[frameIndex]?.grenade_events;
    if (!Array.isArray(frameEvents) || frameEvents.length === 0) {
      continue;
    }

    for (const event of frameEvents) {
      const entityId = getGrenadeEventEntityId(event);
      if (!entityId) {
        continue;
      }

      const state = getOrCreateGrenadeEventState(statesByEntity, entityId);
      const eventType = String(event?.event_type || '').trim().toLowerCase();
      const eventTick = Number(event?.tick);
      if (!Number.isFinite(eventTick)) {
        continue;
      }
      const eventPoint = toGrenadeEventPoint(event);
      const throwerTeamNum = Number(event?.thrower_team_num);
      if (Number.isFinite(throwerTeamNum)) {
        state.throwerTeamNum = throwerTeamNum;
      }

      if (eventType === 'smoke_start') {
        if (!state.smokeStart || eventTick <= state.smokeStart.tick) {
          state.smokeStart = { tick: eventTick, point: eventPoint };
        }
      } else if (eventType === 'smoke_end') {
        if (!state.smokeEnd || eventTick >= state.smokeEnd.tick) {
          state.smokeEnd = { tick: eventTick, point: eventPoint };
        }
      } else if (eventType === 'he_explode') {
        if (!state.heExplode || eventTick <= state.heExplode.tick) {
          state.heExplode = { tick: eventTick, point: eventPoint };
        }
      } else if (eventType === 'flash_explode') {
        if (!state.flashExplode || eventTick <= state.flashExplode.tick) {
          state.flashExplode = { tick: eventTick, point: eventPoint };
        }
      } else if (eventType === 'inferno_start') {
        if (!state.infernoStart || eventTick <= state.infernoStart.tick) {
          state.infernoStart = { tick: eventTick, point: eventPoint };
        }
      } else if (eventType === 'inferno_end') {
        if (!state.infernoEnd || eventTick >= state.infernoEnd.tick) {
          state.infernoEnd = { tick: eventTick, point: eventPoint };
        }
      }
    }
  }
  return statesByEntity;
}

function drawSmokeEventCircle(worldPoint, throwerTeamNum, elapsedSeconds, durationSeconds, scaleX, scaleY, unitScale) {
  if (!worldPoint) {
    return;
  }

  const center = worldToCanvas(worldPoint.x, worldPoint.y, scaleX, scaleY);
  const radius = worldRadiusToCanvasRadius(144, scaleX, scaleY);
  const progress = durationSeconds > 0 ? clamp(elapsedSeconds / durationSeconds, 0, 1) : 0;
  const palette = typeof resolveGrenadeEffectPalette === 'function'
    ? resolveGrenadeEffectPalette('smoke', throwerTeamNum)
    : {
      fillHex: '#7f8c8d',
      strokeHex: Number.isFinite(Number(throwerTeamNum)) ? getTeamColorHex(Number(throwerTeamNum)) : '#7f8c8d',
      tintHex: Number.isFinite(Number(throwerTeamNum)) ? getTeamColorHex(Number(throwerTeamNum)) : '#7f8c8d',
    };

  ctx.save();
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(palette.fillHex, 0.24);
  ctx.fill();
  ctx.fillStyle = hexToRgba(palette.tintHex, 0.14);
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.6 * unitScale);
  ctx.strokeStyle = hexToRgba(palette.strokeHex, 0.48);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.max(4, radius * 0.26), -Math.PI / 2, -Math.PI / 2 - (Math.PI * 2 * progress), true);
  ctx.lineWidth = Math.max(1, 1.2 * unitScale);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.stroke();
  ctx.restore();
}

function drawPulseEventCircle(grenadeType, worldPoint, elapsedSeconds, durationSeconds, scaleX, scaleY, unitScale, throwerTeamNum = null) {
  if (!worldPoint || elapsedSeconds < 0 || elapsedSeconds > durationSeconds) {
    return;
  }

  const safeDuration = Math.max(durationSeconds, 0.01);
  const progress = clamp(elapsedSeconds / safeDuration, 0, 1);
  const typeKey = normalizeGrenadeType(grenadeType);
  const effectConfig = GRENADE_EFFECT_CONFIG_BY_TYPE[typeKey] || GRENADE_EFFECT_CONFIG_BY_TYPE.he;
  const palette = typeof resolveGrenadeEffectPalette === 'function'
    ? resolveGrenadeEffectPalette(typeKey, throwerTeamNum)
    : {
      fillHex: getGrenadeColor(typeKey),
      strokeHex: getGrenadeColor(typeKey),
    };
  const center = worldToCanvas(worldPoint.x, worldPoint.y, scaleX, scaleY);
  const baseRadius = worldRadiusToCanvasRadius(effectConfig.radiusWorldUnits || 260, scaleX, scaleY);
  const radius = baseRadius * (0.35 + ((1 - progress) * 0.65));
  const alpha = clamp(0.3 * (1 - progress), 0.04, 0.35);

  ctx.save();
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(palette.fillHex, alpha);
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.15 * unitScale);
  ctx.strokeStyle = hexToRgba(palette.strokeHex, Math.min(alpha + 0.18, 0.55));
  ctx.stroke();
  ctx.restore();
}

function drawAreaEventCircle(grenadeType, worldPoint, elapsedSeconds, durationSeconds, scaleX, scaleY, unitScale, throwerTeamNum = null) {
  if (!worldPoint || elapsedSeconds < 0) {
    return;
  }

  const safeDuration = Math.max(durationSeconds, 0.01);
  const progress = clamp(elapsedSeconds / safeDuration, 0, 1);
  const typeKey = normalizeGrenadeType(grenadeType);
  const effectConfig = GRENADE_EFFECT_CONFIG_BY_TYPE[typeKey] || GRENADE_EFFECT_CONFIG_BY_TYPE.molotov;
  const palette = typeof resolveGrenadeEffectPalette === 'function'
    ? resolveGrenadeEffectPalette(typeKey, throwerTeamNum)
    : {
      fillHex: '#f97316',
      strokeHex: '#fb923c',
    };
  const center = worldToCanvas(worldPoint.x, worldPoint.y, scaleX, scaleY);
  const radius = worldRadiusToCanvasRadius(effectConfig.radiusWorldUnits || 150, scaleX, scaleY);
  const fade = progress > 0.82 ? clamp(1 - ((progress - 0.82) / 0.18), 0.2, 1) : 1;

  ctx.save();
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(palette.fillHex, 0.18 * fade);
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.6 * unitScale);
  ctx.strokeStyle = hexToRgba(palette.strokeHex, 0.72 * fade);
  ctx.stroke();
  ctx.restore();
}

function resolveGrenadeEventEffectState(trail, grenadeEventState, safeTick) {
  if (!trail || !grenadeEventState || !Number.isFinite(Number(safeTick))) {
    return null;
  }

  const typeKey = normalizeGrenadeType(trail.grenadeType);
  const tickValue = Number(safeTick);
  const eventTeamNum = Number.isFinite(Number(grenadeEventState.throwerTeamNum))
    ? Number(grenadeEventState.throwerTeamNum)
    : trail.throwerTeamNum;
  if (typeKey === 'smoke') {
    if (!grenadeEventState.smokeStart) {
      return null;
    }
    const startTick = Number(grenadeEventState.smokeStart.tick);
    const endTick = Number(grenadeEventState.smokeEnd?.tick);
    const hasEndTick = Number.isFinite(endTick) && endTick >= startTick;
    if (!Number.isFinite(startTick)) {
      return null;
    }
    return {
      kind: 'smoke',
      active: tickValue >= startTick && (!hasEndTick || tickValue <= endTick),
      hideTrail: tickValue >= startTick,
      trailVisibleUntilTick: startTick,
      point: grenadeEventState.smokeStart.point || null,
      elapsedSeconds: Math.max(0, tickValue - startTick) / Math.max(currentTickrate, 1),
      durationSeconds: hasEndTick ? Math.max(0.1, (endTick - startTick) / Math.max(currentTickrate, 1)) : Number.POSITIVE_INFINITY,
      throwerTeamNum: eventTeamNum,
    };
  }

  if ((typeKey === 'he' || typeKey === 'flash') && (grenadeEventState.heExplode || grenadeEventState.flashExplode)) {
    const explode = typeKey === 'he' ? grenadeEventState.heExplode : grenadeEventState.flashExplode;
    const explodeTick = Number(explode.tick);
    if (!Number.isFinite(explodeTick)) {
      return null;
    }
    const durationSeconds = 1;
    const elapsedSeconds = (tickValue - explodeTick) / Math.max(currentTickrate, 1);
    return {
      kind: 'pulse',
      active: tickValue >= explodeTick && elapsedSeconds <= durationSeconds,
      hideTrail: tickValue >= explodeTick,
      trailVisibleUntilTick: explodeTick,
      point: explode.point || null,
      elapsedSeconds,
      durationSeconds,
      grenadeType: typeKey,
      throwerTeamNum: eventTeamNum,
    };
  }

  if (typeKey === 'molotov' || typeKey === 'incendiary') {
    if (!grenadeEventState.infernoStart) {
      return null;
    }
    const startTick = Number(grenadeEventState.infernoStart.tick);
    const endTick = Number(grenadeEventState.infernoEnd?.tick);
    const hasEndTick = Number.isFinite(endTick) && endTick >= startTick;
    if (!Number.isFinite(startTick)) {
      return null;
    }
    return {
      kind: 'area',
      active: tickValue >= startTick && (!hasEndTick || tickValue <= endTick),
      hideTrail: tickValue >= startTick,
      trailVisibleUntilTick: startTick,
      point: grenadeEventState.infernoStart.point || null,
      elapsedSeconds: Math.max(0, tickValue - startTick) / Math.max(currentTickrate, 1),
      durationSeconds: hasEndTick ? Math.max(0.1, (endTick - startTick) / Math.max(currentTickrate, 1)) : Number.POSITIVE_INFINITY,
      grenadeType: typeKey,
      throwerTeamNum: eventTeamNum,
    };
  }

  return null;
}

function getGrenadeInterpolationKey(grenade) {
  if (!grenade || typeof grenade !== 'object') {
    return '';
  }

  if (grenade.entity_id !== undefined && grenade.entity_id !== null) {
    return String(grenade.entity_id);
  }

  return '';
}

function buildGrenadeMapByKey(grenades) {
  const map = new Map();
  if (!Array.isArray(grenades)) {
    return map;
  }

  for (const grenade of grenades) {
    const key = getGrenadeInterpolationKey(grenade);
    if (key) {
      map.set(key, grenade);
    }
  }
  return map;
}

function buildInterpolatedGrenadePoints(lowerFrameIndex, upperFrameIndex, alpha) {
  if (!Number.isFinite(alpha) || alpha <= 0 || upperFrameIndex <= lowerFrameIndex) {
    return null;
  }

  const lowerGrenades = framesData[lowerFrameIndex]?.grenades;
  const upperGrenades = framesData[upperFrameIndex]?.grenades;
  if (!Array.isArray(lowerGrenades) || !Array.isArray(upperGrenades)) {
    return null;
  }

  const lowerByKey = buildGrenadeMapByKey(lowerGrenades);
  const lowerTick = getFrameTick(lowerFrameIndex);
  const upperTick = getFrameTick(upperFrameIndex);
  const interpolated = new Map();
  for (const upperGrenade of upperGrenades) {
    const key = getGrenadeInterpolationKey(upperGrenade);
    const lowerGrenade = lowerByKey.get(key);
    if (!key || !lowerGrenade) {
      continue;
    }

    const lowerX = Number(lowerGrenade.x);
    const lowerY = Number(lowerGrenade.y);
    const lowerZ = Number(lowerGrenade.z);
    const upperX = Number(upperGrenade.x);
    const upperY = Number(upperGrenade.y);
    const upperZ = Number(upperGrenade.z);
    if (!Number.isFinite(lowerX) || !Number.isFinite(lowerY) || !Number.isFinite(lowerZ)) {
      continue;
    }
    if (!Number.isFinite(upperX) || !Number.isFinite(upperY) || !Number.isFinite(upperZ)) {
      continue;
    }

    interpolated.set(key, {
      x: lerpNumber(lowerX, upperX, alpha),
      y: lerpNumber(lowerY, upperY, alpha),
      z: lerpNumber(lowerZ, upperZ, alpha),
      frameIndex: lowerFrameIndex + alpha,
      tick: lerpNumber(lowerTick, upperTick, alpha),
    });
  }

  return interpolated.size > 0 ? interpolated : null;
}

function drawGrenadeTrailLine(points, scaleX, scaleY) {
  if (points.length <= 1) {
    return;
  }

  ctx.beginPath();
  const firstPoint = worldToCanvas(points[0].x, points[0].y, scaleX, scaleY);
  ctx.moveTo(firstPoint.x, firstPoint.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = worldToCanvas(points[index].x, points[index].y, scaleX, scaleY);
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
}

function drawGrenadeTrailEndpoint(points, scaleX, scaleY, unitScale) {
  const lastPoint = points[points.length - 1];
  const canvasPoint = worldToCanvas(lastPoint.x, lastPoint.y, scaleX, scaleY);
  const pointRadius = Math.max(2, 2.6 * unitScale);
  ctx.beginPath();
  ctx.arc(canvasPoint.x, canvasPoint.y, pointRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = Math.max(1, 1.1 * unitScale);
  ctx.stroke();
}

function drawGrenadeTrailVisual(trail, visiblePoints, scaleX, scaleY, unitScale) {
  const color = typeof resolveGrenadeTrailHex === 'function'
    ? resolveGrenadeTrailHex(trail.grenadeType, trail.throwerTeamNum)
    : getGrenadeColor(trail.grenadeType);
  ctx.strokeStyle = `${color}cc`;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, 1.6 * unitScale);
  drawGrenadeTrailLine(visiblePoints, scaleX, scaleY);
  drawGrenadeTrailEndpoint(visiblePoints, scaleX, scaleY, unitScale);
}

function drawGrenadeTrailWithEffect(
  trail,
  firstTrailFrame,
  safeFrameIndex,
  safeTick,
  scaleX,
  scaleY,
  unitScale,
  interpolatedPointsByEntity = null,
  grenadeEventStatesByEntity = null,
) {
  if (!Array.isArray(trail.points) || trail.points.length === 0 || trail.lastSeenFrameIndex < firstTrailFrame) {
    return;
  }

  const grenadeEventState = grenadeEventStatesByEntity?.get(trail.entityId) || null;
  const eventEffectState = resolveGrenadeEventEffectState(trail, grenadeEventState, safeTick);
  let trailVisibleUntilFrame = Math.min(safeFrameIndex, trail.lastSeenFrameIndex + 1);
  let shouldDrawTrail = safeFrameIndex <= (trail.lastSeenFrameIndex + 1);

  if (eventEffectState) {
    const trailVisibleUntilTick = Number(eventEffectState.trailVisibleUntilTick);
    if (Number.isFinite(trailVisibleUntilTick)) {
      trailVisibleUntilFrame = findFrameIndexByTick(trailVisibleUntilTick);
    }
    shouldDrawTrail = !eventEffectState.hideTrail || safeTick < trailVisibleUntilTick;

    if (eventEffectState.kind === 'smoke' && eventEffectState.active) {
      drawSmokeEventCircle(
        eventEffectState.point,
        eventEffectState.throwerTeamNum,
        eventEffectState.elapsedSeconds,
        eventEffectState.durationSeconds,
        scaleX,
        scaleY,
        unitScale,
      );
    }
    if (eventEffectState.kind === 'pulse' && eventEffectState.active) {
      drawPulseEventCircle(
        eventEffectState.grenadeType || trail.grenadeType,
        eventEffectState.point,
        eventEffectState.elapsedSeconds,
        eventEffectState.durationSeconds,
        scaleX,
        scaleY,
        unitScale,
        eventEffectState.throwerTeamNum,
      );
    }
    if (eventEffectState.kind === 'area' && eventEffectState.active) {
      drawAreaEventCircle(
        eventEffectState.grenadeType || trail.grenadeType,
        eventEffectState.point,
        eventEffectState.elapsedSeconds,
        eventEffectState.durationSeconds,
        scaleX,
        scaleY,
        unitScale,
        eventEffectState.throwerTeamNum,
      );
    }
  }

  if (!shouldDrawTrail) {
    return;
  }

  let visiblePoints = trail.points.filter((point) => point.frameIndex <= trailVisibleUntilFrame && point.tick <= safeTick);
  const interpolatedPoint = interpolatedPointsByEntity?.get(trail.entityId) || null;
  if (interpolatedPoint) {
    const mergedPoints = [...visiblePoints];
    const lastPoint = mergedPoints[mergedPoints.length - 1] || null;
    if (
      (!lastPoint || interpolatedPoint.frameIndex >= lastPoint.frameIndex)
      && (!Number.isFinite(Number(interpolatedPoint.tick)) || interpolatedPoint.tick <= safeTick)
    ) {
      mergedPoints.push(interpolatedPoint);
      visiblePoints = mergedPoints;
    }
  }

  if (visiblePoints.length > 0) {
    drawGrenadeTrailVisual(trail, visiblePoints, scaleX, scaleY, unitScale);
  }
}

function drawGrenadeTrails(renderTick, scaleX, scaleY, unitScale, interpolation = null) {
  if (!framesData.length) {
    return;
  }

  const firstTick = getFrameTick(0);
  const lastTick = getFrameTick(framesData.length - 1);
  const tickValue = Number(renderTick);
  if (!Number.isFinite(tickValue)) {
    return;
  }
  const safeTick = clamp(tickValue, firstTick, lastTick);
  const safeFrameIndex = findFrameIndexByTick(safeTick);
  const floorFrameIndex = Math.floor(safeFrameIndex);
  const firstTrailFrame = Math.max(0, floorFrameIndex - getGrenadeLookbackFrameCount());
  const trailsByEntity = collectGrenadeTrails(firstTrailFrame, floorFrameIndex);
  const grenadeEventStatesByEntity = collectGrenadeEventStates(0, floorFrameIndex);
  const interpolatedPointsByEntity = buildInterpolatedGrenadePoints(
    floorFrameIndex,
    Number(interpolation?.upperIndex ?? floorFrameIndex + 1),
    Number(interpolation?.alpha ?? 0),
  );

  for (const trail of trailsByEntity.values()) {
    drawGrenadeTrailWithEffect(
      trail,
      firstTrailFrame,
      safeFrameIndex,
      safeTick,
      scaleX,
      scaleY,
      unitScale,
      interpolatedPointsByEntity,
      grenadeEventStatesByEntity,
    );
  }
}

function normalizeIdentityText(value) {
  return String(value || '').trim().toLowerCase();
}

function buildRenderablePlayerEntries(players, scaleX, scaleY, unitScale) {
  if (!Array.isArray(players) || players.length === 0) {
    return [];
  }

  const playerRadius = 6 * unitScale;
  return players
    .filter((player) => isPlayerAliveForRadar(player))
    .map((player) => ({
      player,
      playerRadius,
      mapped: worldToCanvas(player.X, player.Y, scaleX, scaleY),
      steamKey: normalizeIdentityText(player?.steamid),
      nameKey: normalizeIdentityText(player?.name),
    }));
}

function buildRenderablePlayerLookup(entries) {
  const bySteam = new Map();
  const byName = new Map();

  for (const entry of entries) {
    if (entry.steamKey && !bySteam.has(entry.steamKey)) {
      bySteam.set(entry.steamKey, entry);
    }
    if (entry.nameKey && !byName.has(entry.nameKey)) {
      byName.set(entry.nameKey, entry);
    }
  }

  return { bySteam, byName };
}

function resolveRenderablePlayerEntry(lookup, steamidLike, nameLike) {
  if (!lookup) {
    return null;
  }

  const steamKey = normalizeIdentityText(steamidLike);
  if (steamKey && lookup.bySteam.has(steamKey)) {
    return lookup.bySteam.get(steamKey);
  }

  const nameKey = normalizeIdentityText(nameLike);
  if (nameKey && lookup.byName.has(nameKey)) {
    return lookup.byName.get(nameKey);
  }

  return null;
}

function collectRecentShotEvents(renderTick) {
  if (!Array.isArray(framesData) || framesData.length === 0) {
    return [];
  }

  const safeTickrate = Math.max(currentTickrate, 1);
  const lookbackTicks = Math.max(1, Math.ceil(safeTickrate * PLAYER_SHOT_EFFECT_WINDOW_SECONDS));
  const minTick = renderTick - lookbackTicks;
  const startFrameIndex = findFrameIndexByTick(renderTick);
  const shots = [];

  for (let frameIndex = startFrameIndex; frameIndex >= 0; frameIndex -= 1) {
    const frameTick = getFrameTick(frameIndex);
    if (frameTick < minTick) {
      break;
    }

    const frameShots = framesData[frameIndex]?.shots;
    if (!Array.isArray(frameShots) || frameShots.length === 0) {
      continue;
    }

    for (const shot of frameShots) {
      const eventTick = Number.isFinite(Number(shot?.tick)) ? Number(shot.tick) : frameTick;
      if (eventTick < minTick || eventTick > renderTick) {
        continue;
      }

      shots.push({
        ...shot,
        tick: eventTick,
      });
    }
  }

  shots.sort((left, right) => right.tick - left.tick);
  return shots.slice(0, PLAYER_SHOT_MAX_EFFECTS);
}

function getBlindEffectKey(blind) {
  const steamKey = normalizeIdentityText(blind?.victim_steamid);
  if (steamKey) {
    return `steam:${steamKey}`;
  }

  const nameKey = normalizeIdentityText(blind?.victim_name);
  if (nameKey) {
    return `name:${nameKey}`;
  }

  return '';
}

function collectActiveBlindEffects(renderTick) {
  if (!Array.isArray(framesData) || framesData.length === 0) {
    return new Map();
  }

  const safeTickrate = Math.max(currentTickrate, 1);
  const lookbackTicks = Math.max(1, Math.ceil(safeTickrate * PLAYER_BLIND_LOOKBACK_SECONDS));
  const minTick = renderTick - lookbackTicks;
  const startFrameIndex = findFrameIndexByTick(renderTick);
  const strongestByVictim = new Map();

  for (let frameIndex = startFrameIndex; frameIndex >= 0; frameIndex -= 1) {
    const frameTick = getFrameTick(frameIndex);
    if (frameTick < minTick) {
      break;
    }

    const frameBlinds = framesData[frameIndex]?.blinds;
    if (!Array.isArray(frameBlinds) || frameBlinds.length === 0) {
      continue;
    }

    for (const blind of frameBlinds) {
      const eventTick = Number.isFinite(Number(blind?.tick)) ? Number(blind.tick) : frameTick;
      const durationSeconds = Math.max(Number(blind?.blind_duration) || 0, 0);
      const safeDurationSeconds = Math.max(durationSeconds, PLAYER_BLIND_MIN_DURATION_SECONDS);
      const durationTicks = safeDurationSeconds * safeTickrate;
      if (eventTick > renderTick || renderTick > (eventTick + durationTicks)) {
        continue;
      }

      const effectKey = getBlindEffectKey(blind);
      if (!effectKey) {
        continue;
      }

      const progress = clamp((renderTick - eventTick) / Math.max(durationTicks, 0.0001), 0, 1);
      const intensity = clamp(1 - progress, 0.18, 1);
      const existing = strongestByVictim.get(effectKey);
      if (!existing || intensity > existing.intensity) {
        strongestByVictim.set(effectKey, {
          ...blind,
          tick: eventTick,
          intensity,
          progress,
        });
      }
    }
  }

  return strongestByVictim;
}

function drawPlayerBlindEffects(entries, renderTick, unitScale) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  const activeBlinds = collectActiveBlindEffects(renderTick);
  if (activeBlinds.size === 0) {
    return;
  }

  const lookup = buildRenderablePlayerLookup(entries);
  for (const blind of activeBlinds.values()) {
    const entry = resolveRenderablePlayerEntry(lookup, blind?.victim_steamid, blind?.victim_name);
    if (!entry) {
      continue;
    }

    const intensity = clamp(Number(blind.intensity) || 0, 0.18, 1);
    const baseRadius = entry.playerRadius + Math.max(4, 4 * unitScale);
    const glowRadius = baseRadius * (1.5 + (0.35 * intensity));
    const coreRadius = baseRadius * (0.72 + (0.16 * intensity));

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath();
    ctx.arc(entry.mapped.x, entry.mapped.y, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 246, 179, ${0.12 + (0.2 * intensity)})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(entry.mapped.x, entry.mapped.y, coreRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + (0.14 * intensity)})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(entry.mapped.x, entry.mapped.y, glowRadius, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, 1.2 * unitScale);
    ctx.strokeStyle = `rgba(255, 238, 128, ${0.5 + (0.28 * intensity)})`;
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlayerShotEffect(entry, shot, renderTick, scaleX, scaleY, unitScale) {
  if (!entry || !shot) {
    return;
  }

  const safeTickrate = Math.max(currentTickrate, 1);
  const eventTick = Number(shot.tick);
  if (!Number.isFinite(eventTick)) {
    return;
  }

  const elapsedTicks = Math.max(renderTick - eventTick, 0);
  const lifeTicks = Math.max(PLAYER_SHOT_EFFECT_WINDOW_SECONDS * safeTickrate, 0.0001);
  if (elapsedTicks > lifeTicks) {
    return;
  }

  const fade = clamp(1 - (elapsedTicks / lifeTicks), 0, 1);
  const heading = (Number(entry.player?.yaw) || 0) * (Math.PI / 180);
  const dirX = Math.cos(heading);
  const dirY = -Math.sin(heading);
  const muzzleOffset = entry.playerRadius + Math.max(3, 2.4 * unitScale);
  const muzzleX = entry.mapped.x + (dirX * muzzleOffset);
  const muzzleY = entry.mapped.y + (dirY * muzzleOffset);
  const tracerLength = worldRadiusToCanvasRadius(PLAYER_SHOT_TRACER_WORLD_UNITS, scaleX, scaleY) * (0.82 + (0.22 * fade));
  const tracerX = muzzleX + (dirX * tracerLength);
  const tracerY = muzzleY + (dirY * tracerLength);
  const teamColor = getPlayerTeamColor(entry.player);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = hexToRgba(teamColor, 0.5 + (0.35 * fade));
  ctx.lineWidth = Math.max(1.2, 1.4 * unitScale);
  ctx.beginPath();
  ctx.moveTo(muzzleX, muzzleY);
  ctx.lineTo(tracerX, tracerY);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + (0.4 * fade)})`;
  ctx.lineWidth = Math.max(0.8, 0.8 * unitScale);
  ctx.beginPath();
  ctx.moveTo(muzzleX, muzzleY);
  ctx.lineTo(
    muzzleX + (dirX * tracerLength * 0.58),
    muzzleY + (dirY * tracerLength * 0.58),
  );
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(muzzleX, muzzleY, Math.max(2.2, 2.6 * unitScale) + (1.4 * fade), 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 214, 102, ${0.6 + (0.25 * fade)})`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(muzzleX, muzzleY, Math.max(1.2, 1.4 * unitScale), 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${0.72 + (0.18 * fade)})`;
  ctx.fill();
  ctx.restore();
}

function drawPlayerShotEffects(entries, renderTick, scaleX, scaleY, unitScale) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  const shots = collectRecentShotEvents(renderTick);
  if (shots.length === 0) {
    return;
  }

  const lookup = buildRenderablePlayerLookup(entries);
  for (const shot of shots) {
    const entry = resolveRenderablePlayerEntry(lookup, shot?.shooter_steamid, shot?.shooter_name);
    if (!entry) {
      continue;
    }

    drawPlayerShotEffect(entry, shot, renderTick, scaleX, scaleY, unitScale);
  }
}

function getCanvasScale() {
  const radarSize = currentRadarSize > 0 ? currentRadarSize : DEFAULT_RADAR_SIZE;
  const scaleX = currentMapViewport.width / radarSize;
  const scaleY = currentMapViewport.height / radarSize;
  const unitScale = Math.max(Math.min(scaleX, scaleY), 0.5);
  return { scaleX, scaleY, unitScale };
}

function getPlayerTeamColor(player) {
  if (typeof getTeamColorHex === 'function') {
    return getTeamColorHex(player?.team_num);
  }
  return Number(player?.team_num) === TEAM_NUM_T ? '#facc15' : '#38bdf8';
}

function getTeamPanelHeaderHeight(panelRect) {
  return clamp(panelRect.height * 0.055, HUD_TEAM_HEADER_MIN_HEIGHT, HUD_TEAM_HEADER_MAX_HEIGHT);
}

function getTeamPanelHeaderGap(panelRect) {
  return Math.max(1, Math.round(panelRect.height * 0.0015));
}

function buildTeamPanelHeaderRect(panelRect, firstSlotRect = null) {
  const inset = 1;
  const headerHeight = getTeamPanelHeaderHeight(panelRect);
  const fallbackWidth = Math.max(1, panelRect.width - (inset * 2));
  const width = firstSlotRect ? firstSlotRect.width : fallbackWidth;
  const x = firstSlotRect ? firstSlotRect.x : (panelRect.x + inset);
  const defaultY = panelRect.y + inset;
  const anchoredY = firstSlotRect
    ? (firstSlotRect.y - getTeamPanelHeaderGap(panelRect) - headerHeight)
    : defaultY;
  return {
    x,
    y: Math.max(defaultY, anchoredY),
    width,
    height: headerHeight,
  };
}

function buildTeamSlotRects(panelRect) {
  const inset = 1;
  const headerHeight = getTeamPanelHeaderHeight(panelRect);
  const headerGap = getTeamPanelHeaderGap(panelRect);
  const bodyX = panelRect.x + inset;
  const bodyY = panelRect.y + inset;
  const bodyWidth = Math.max(1, panelRect.width - (inset * 2));
  const bodyHeight = Math.max(1, panelRect.height - (inset * 2));
  const slotHeight = typeof getHudTeamSlotHeight === 'function'
    ? getHudTeamSlotHeight(bodyHeight)
    : clamp(bodyHeight * 0.1, 48, 60);
  const totalSlotsHeight = (slotHeight * HUD_PLAYER_SLOTS) + (HUD_PLAYER_SLOT_GAP * (HUD_PLAYER_SLOTS - 1));
  const contentHeight = totalSlotsHeight + headerHeight + headerGap;
  const offsetY = Math.max((bodyHeight - contentHeight) / 2, 0);
  const startY = bodyY + offsetY + headerHeight + headerGap;
  const slots = [];

  for (let slotIndex = 0; slotIndex < HUD_PLAYER_SLOTS; slotIndex += 1) {
    const slotY = startY + (slotIndex * (slotHeight + HUD_PLAYER_SLOT_GAP));
    slots.push({ x: bodyX, y: slotY, width: bodyWidth, height: slotHeight });
  }

  return slots;
}

function resolveTeamPanelDisplayMeta(teamNum, displayMeta = null) {
  return {
    name: typeof resolveTeamPanelDisplayName === 'function'
      ? resolveTeamPanelDisplayName(teamNum, displayMeta, TEAM_PANEL_FALLBACK_NAME_BY_TEAM)
      : (String(displayMeta?.name || '').trim() || TEAM_PANEL_FALLBACK_NAME_BY_TEAM[teamNum] || 'Unknown'),
    score: Number.isFinite(Number(displayMeta?.score)) ? Math.floor(Number(displayMeta.score)) : null,
  };
}

function drawTeamPanelHeader(panelRect, firstSlotRect, teamNum, displayMeta, unitScale) {
  const headerRect = buildTeamPanelHeaderRect(panelRect, firstSlotRect);
  const teamColor = getTeamColorHex(teamNum);
  const textLayout = typeof getTeamPanelHeaderTextLayout === 'function'
    ? getTeamPanelHeaderTextLayout(headerRect, unitScale)
    : {
      textX: headerRect.x + Math.max(8, 7 * unitScale),
      textWidth: Math.max(12, headerRect.width - (Math.max(8, 7 * unitScale) * 2)),
    };
  const meta = resolveTeamPanelDisplayMeta(teamNum, displayMeta);

  ctx.save();
  drawRoundedRectPath(
    headerRect.x,
    headerRect.y,
    headerRect.width,
    headerRect.height,
    Math.max(6, 5 * unitScale),
  );
  ctx.fillStyle = hexToRgba(teamColor, 0.12);
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.1 * unitScale);
  ctx.strokeStyle = hexToRgba(teamColor, 0.34);
  ctx.stroke();

  ctx.fillStyle = teamColor;
  ctx.font = `700 ${Math.max(11, 10 * unitScale)}px Segoe UI`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const headerText = typeof formatTeamPanelHeaderText === 'function'
    ? formatTeamPanelHeaderText(meta)
    : meta.name;
  ctx.fillText(
    fitTextByWidth(headerText, textLayout.textWidth),
    textLayout.textX,
    headerRect.y + (headerRect.height / 2),
  );
  ctx.restore();
}

function normalizePlayerInventoryItems(player) {
  const rawInventory = player?.inventory;
  if (Array.isArray(rawInventory)) {
    return rawInventory.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof rawInventory === 'string') {
    const trimmed = rawInventory.trim();
    if (!trimmed) {
      return [];
    }
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item || '').trim()).filter(Boolean);
        }
      } catch (_error) {
        return [];
      }
    }
    return [trimmed];
  }

  return [];
}

function normalizeInventoryLabel(itemName) {
  return String(itemName || '').trim().toLowerCase();
}

function isKnifeInventoryItem(itemName) {
  const normalized = normalizeInventoryLabel(itemName);
  return (
    normalized.includes('knife')
    || normalized.includes('bayonet')
    || normalized.includes('karambit')
    || normalized.includes('butterfly')
    || normalized.includes('stiletto')
    || normalized.includes('skeleton')
    || normalized.includes('ursus')
    || normalized.includes('falchion')
    || normalized.includes('bowie')
    || normalized.includes('talon')
    || normalized.includes('daggers')
    || normalized.includes('kukri')
    || normalized.includes('nomad')
    || normalized.includes('paracord')
    || normalized.includes('survival')
    || normalized.includes('m9 ')
  );
}

function classifyUtilityInventoryItem(itemName) {
  const normalized = normalizeInventoryLabel(itemName);
  if (!normalized) {
    return '';
  }
  if (normalized.includes('smoke')) return 'SMK';
  if (normalized.includes('flash')) return 'FL';
  if (normalized.includes('high explosive') || normalized === 'he grenade' || normalized.includes('he grenade')) return 'HE';
  if (normalized.includes('molotov')) return 'MOL';
  if (normalized.includes('incendiary')) return 'INC';
  if (normalized.includes('decoy')) return 'DEC';
  if (normalized.includes('c4') || normalized.includes('explosive')) return 'C4';
  return '';
}

function isPrimaryInventoryWeapon(itemName) {
  const normalized = normalizeInventoryLabel(itemName);
  if (!normalized) {
    return false;
  }
  if (isKnifeInventoryItem(normalized)) {
    return false;
  }
  if (classifyUtilityInventoryItem(normalized)) {
    return false;
  }
  return ![
    'glock-18',
    'usp-s',
    'usp',
    'p2000',
    'p250',
    'five-seven',
    'fiveseven',
    'tec-9',
    'tec9',
    'cz75-auto',
    'cz75',
    'dual berettas',
    'dualies',
    'deagle',
    'desert eagle',
    'r8 revolver',
  ].includes(normalized);
}

function isSidearmInventoryWeapon(itemName) {
  const normalized = normalizeInventoryLabel(itemName);
  return [
    'glock-18',
    'usp-s',
    'usp',
    'p2000',
    'p250',
    'five-seven',
    'fiveseven',
    'tec-9',
    'tec9',
    'cz75-auto',
    'cz75',
    'dual berettas',
    'dualies',
    'deagle',
    'desert eagle',
    'r8 revolver',
  ].includes(normalized);
}

function resolvePlayerPrimaryWeapon(player) {
  const inventoryItems = normalizePlayerInventoryItems(player);
  const primaryWeapon = inventoryItems.find((item) => isPrimaryInventoryWeapon(item));
  if (primaryWeapon) {
    return primaryWeapon;
  }

  const sidearm = inventoryItems.find((item) => isSidearmInventoryWeapon(item));
  if (sidearm) {
    return sidearm;
  }

  const inventoryFallback = inventoryItems.find((item) => !isKnifeInventoryItem(item) && !classifyUtilityInventoryItem(item));
  if (inventoryFallback) {
    return inventoryFallback;
  }

  for (const candidateLike of [player?.weapon_name, player?.active_weapon_name]) {
    const candidate = String(candidateLike || '').trim();
    if (candidate && !isKnifeInventoryItem(candidate) && !classifyUtilityInventoryItem(candidate)) {
      return candidate;
    }
  }

  return '';
}

function getPlayerUtilityInventory(player) {
  const utilityItems = [];
  for (const item of normalizePlayerInventoryItems(player)) {
    if (!classifyUtilityInventoryItem(item)) {
      continue;
    }
    utilityItems.push(item);
  }

  const utilitySortOrder = {
    smoke: 10,
    flash: 20,
    he: 30,
    molotov: 40,
    incendiary: 50,
    decoy: 60,
    c4: 70,
  };

  return utilityItems.sort((leftItem, rightItem) => {
    const leftLabel = classifyUtilityInventoryItem(leftItem);
    const rightLabel = classifyUtilityInventoryItem(rightItem);
    const leftOrder = leftLabel === 'SMK'
      ? utilitySortOrder.smoke
      : leftLabel === 'FL'
        ? utilitySortOrder.flash
        : leftLabel === 'HE'
          ? utilitySortOrder.he
          : leftLabel === 'MOL'
            ? utilitySortOrder.molotov
            : leftLabel === 'INC'
              ? utilitySortOrder.incendiary
              : leftLabel === 'DEC'
                ? utilitySortOrder.decoy
                : utilitySortOrder.c4;
    const rightOrder = rightLabel === 'SMK'
      ? utilitySortOrder.smoke
      : rightLabel === 'FL'
        ? utilitySortOrder.flash
        : rightLabel === 'HE'
          ? utilitySortOrder.he
          : rightLabel === 'MOL'
            ? utilitySortOrder.molotov
            : rightLabel === 'INC'
              ? utilitySortOrder.incendiary
              : rightLabel === 'DEC'
                ? utilitySortOrder.decoy
                : utilitySortOrder.c4;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return normalizeInventoryLabel(leftItem).localeCompare(normalizeInventoryLabel(rightItem));
  });
}

function drawHudInventoryIcon(itemName, iconX, iconY, iconSize, unitScale, opacity = 1) {
  if (!itemName) {
    return false;
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.filter = 'grayscale(1) brightness(1.3)';
  const iconDrawn = drawWeaponIconOnCanvas(ctx, itemName, iconX, iconY, iconSize);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;

  if (!iconDrawn) {
    drawWeaponFallbackLabel(itemName, iconX, iconY, iconSize, unitScale);
  }

  ctx.restore();
  return iconDrawn;
}

function drawTeamSlotHud(player, slotRect, slotIndex, teamNum, unitScale) {
  const isEmpty = !player;
  const hp = clamp(coerceNonNegativeInteger(player?.health, 0), 0, 100);
  const isDead = !isEmpty && (player.is_alive === false || hp <= 0);
  const slotOpacity = isEmpty ? 0.42 : (isDead ? 0.62 : 1);
  const idLabel = isEmpty ? `Empty #${slotIndex + 1}` : (getPlayerIdLabel(player) || `Player ${slotIndex + 1}`);
  const teamColor = getTeamColorHex(player?.team_num || teamNum);
  const money = isEmpty ? '$0' : `$${coerceNonNegativeInteger(player?.balance, 0)}`;
  const primaryWeaponName = isEmpty ? '' : resolvePlayerPrimaryWeapon(player);
  const utilityItems = isEmpty ? [] : getPlayerUtilityInventory(player);
  const slotMetrics = typeof getHudTeamSlotContentMetrics === 'function'
    ? getHudTeamSlotContentMetrics(slotRect, unitScale)
    : {
      topY: slotRect.y + Math.max(4, 4 * unitScale),
      barY: slotRect.y + Math.max(4, 4 * unitScale) + Math.max(10, 9 * unitScale),
      barHeight: Math.max(11, 10 * unitScale),
      iconRowY: Math.min(
        slotRect.y + slotRect.height - Math.max(15, 15 * unitScale),
        slotRect.y + Math.max(4, 4 * unitScale) + Math.max(10, 9 * unitScale) + Math.max(11, 10 * unitScale) + Math.max(3, 3 * unitScale),
      ),
      primaryIconSize: Math.max(17, 16 * unitScale),
      utilityIconSize: Math.max(11, 10 * unitScale),
      utilityGap: Math.max(2, 2 * unitScale),
    };
  const barInset = Math.max(2, 2 * unitScale);
  const contentX = slotRect.x + barInset;
  const contentWidth = Math.max(1, slotRect.width - (barInset * 2));
  const {
    topY,
    barY,
    barHeight,
    iconRowY,
    primaryIconSize,
    utilityIconSize,
    utilityGap,
  } = slotMetrics;
  const utilityRowY = iconRowY + Math.max(1, ((primaryIconSize - utilityIconSize) / 2));
  const utilityMinX = contentX + primaryIconSize + Math.max(8, 7 * unitScale);
  const barWidth = contentWidth;
  const fillWidth = barWidth * (hp / 100);
  const hpLabel = isEmpty ? '-' : `${hp} HP`;

  ctx.save();
  ctx.globalAlpha = slotOpacity;
  ctx.font = `700 ${Math.max(11, 11 * unitScale)}px Segoe UI`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = isEmpty ? '#8aa0b8' : teamColor;
  ctx.fillText(fitTextByWidth(idLabel, contentWidth * 0.66), contentX, topY);
  ctx.font = `600 ${Math.max(10, 10 * unitScale)}px Segoe UI`;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#dbe4f1';
  ctx.fillText(money, contentX + contentWidth, topY);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
  ctx.fillRect(contentX, barY, barWidth, barHeight);
  ctx.fillStyle = teamColor;
  ctx.fillRect(contentX, barY, fillWidth, barHeight);
  ctx.font = `700 ${Math.max(9, 9 * unitScale)}px Segoe UI`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f8fafc';
  ctx.shadowColor = 'rgba(2, 6, 23, 0.82)';
  ctx.shadowBlur = 4;
  ctx.fillText(hpLabel, contentX + (contentWidth / 2), barY + (barHeight / 2) + 0.5);
  ctx.shadowBlur = 0;

  if (primaryWeaponName) {
    drawHudInventoryIcon(primaryWeaponName, contentX, iconRowY, primaryIconSize, unitScale, 0.94);
  } else if (!isEmpty) {
    drawWeaponFallbackLabel('-', contentX, iconRowY, primaryIconSize, unitScale);
  }

  let utilityX = contentX + contentWidth - utilityIconSize;
  for (let index = utilityItems.length - 1; index >= 0; index -= 1) {
    if (utilityX < utilityMinX) {
      break;
    }

    drawHudInventoryIcon(utilityItems[index], utilityX, utilityRowY, utilityIconSize, unitScale, 0.9);
    utilityX -= utilityIconSize + utilityGap;
  }
  ctx.restore();
}

function drawTeamPanelHud(panelRect, teamNum, slots, displayMeta, unitScale) {
  const slotRects = buildTeamSlotRects(panelRect);
  drawTeamPanelHeader(panelRect, slotRects[0] || null, teamNum, displayMeta, unitScale);

  for (let index = 0; index < slotRects.length; index += 1) {
    const slotPlayer = Array.isArray(slots) ? slots[index] : null;
    drawTeamSlotHud(slotPlayer, slotRects[index], index, teamNum, unitScale);
  }
}

function fitTextByWidth(text, maxWidth) {
  const rawText = String(text || '').trim() || '?';
  if (ctx.measureText(rawText).width <= maxWidth) {
    return rawText;
  }

  const suffix = '...';
  let current = rawText;
  while (current.length > 1 && ctx.measureText(`${current}${suffix}`).width > maxWidth) {
    current = current.slice(0, -1);
  }
  return `${current}${suffix}`;
}

function drawKillWeaponIcon(kill, iconX, iconY, iconSize, unitScale) {
  ctx.save();
  ctx.globalAlpha = 0.86;
  ctx.filter = 'grayscale(1) brightness(1.18)';
  const iconDrawn = drawWeaponIconOnCanvas(ctx, kill.rawWeapon, iconX, iconY, iconSize);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  if (!iconDrawn) {
    drawWeaponFallbackLabel(kill.rawWeapon, iconX, iconY, iconSize, unitScale);
  }
  if (kill.headshot) {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(iconX + iconSize + 4, iconY + (iconSize / 2), Math.max(2, 2 * unitScale), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawKillFeedHud(frameIndex, layout, unitScale) {
  if (typeof getKillFeedItemsForFrame !== 'function') {
    return;
  }

  const kills = getKillFeedItemsForFrame(frameIndex);
  if (!Array.isArray(kills) || kills.length === 0) {
    return;
  }

  const drawCount = Math.min(kills.length, 6);
  const rowHeight = Math.max(22, 22 * unitScale);
  const rowGap = Math.max(6, 6 * unitScale);
  const iconSize = Math.max(14, rowHeight - 8);
  const fontSize = Math.max(11, 11 * unitScale);
  const maxRowWidth = Math.max(100, layout.killArea.width);
  const killAreaRight = layout.killArea.x + maxRowWidth;
  let rowY = layout.killArea.y;

  ctx.save();
  ctx.font = `700 ${fontSize}px Segoe UI`;
  ctx.textBaseline = 'middle';

  for (let index = drawCount - 1; index >= 0; index -= 1) {
    const kill = kills[index];
    const sideGap = Math.max(6, 6 * unitScale);
    const maxSideWidth = Math.max(24, (maxRowWidth - iconSize - (sideGap * 4)) / 2);
    const attackerText = fitTextByWidth(kill.attacker, maxSideWidth);
    const victimText = fitTextByWidth(kill.victim, maxSideWidth);
    const attackerWidth = Math.ceil(ctx.measureText(attackerText).width);
    const victimWidth = Math.ceil(ctx.measureText(victimText).width);
    const rowWidth = Math.max(
      iconSize + (sideGap * 4),
      attackerWidth + victimWidth + iconSize + (sideGap * 4),
    );
    const rowX = killAreaRight - rowWidth;
    const rowCenterY = rowY + (rowHeight / 2);
    const attackerTextRightX = rowX + sideGap + attackerWidth;
    const iconX = attackerTextRightX + sideGap;
    const iconY = rowY + ((rowHeight - iconSize) / 2);
    const victimTextX = iconX + iconSize + sideGap;

    ctx.textAlign = 'right';
    ctx.fillStyle = getTeamColorHex(kill.attackerTeamNum);
    ctx.fillText(attackerText, attackerTextRightX, rowCenterY);
    ctx.textAlign = 'left';
    ctx.fillStyle = getTeamColorHex(kill.victimTeamNum);
    ctx.fillText(victimText, victimTextX, rowCenterY);
    drawKillWeaponIcon(kill, iconX, iconY, iconSize, unitScale);

    rowY += rowHeight + rowGap;
  }

  ctx.restore();
}

function drawRoundClockOnCanvas(layout, unitScale, renderTick = null) {
  if (typeof getRoundClockState !== 'function' || typeof formatMatchClock !== 'function') {
    return;
  }

  const effectiveTick = Number.isFinite(Number(renderTick))
    ? Number(renderTick)
    : (typeof getFrameTick === 'function' ? getFrameTick(currentFrameIndex) : currentPlaybackTick);
  const clockState = getRoundClockState(effectiveTick);
  if (!clockState) {
    return;
  }

  const phaseLabel = clockState.phase === 'bomb' ? 'Bomb' : 'Round';
  const remainingText = formatMatchClock(clockState.remainingSeconds || 0);
  const totalText = formatMatchClock(clockState.totalSeconds || 0);
  const clockText = `${phaseLabel} ${remainingText}/${totalText}`;

  const fontSize = Math.max(13, 11 * unitScale);
  const paddingX = Math.max(10, 8 * unitScale);
  const paddingY = Math.max(5, 4 * unitScale);
  const boxHeight = fontSize + paddingY * 2;
  const marginFromTop = Math.max(8, 6 * unitScale);
  const boxY = layout.map.y + marginFromTop;

  ctx.save();
  ctx.font = `700 ${fontSize}px Segoe UI`;
  const textWidth = ctx.measureText(clockText).width;
  const boxWidth = textWidth + paddingX * 2;
  const boxX = layout.map.x + (layout.map.width - boxWidth) / 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  drawRoundedRectPath(boxX, boxY, boxWidth, boxHeight, Math.max(5, 4 * unitScale));
  ctx.fill();

  if (clockState.phase === 'bomb') {
    ctx.fillStyle = '#ff4444';
  } else {
    ctx.fillStyle = '#ffffff';
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clockText, layout.map.x + layout.map.width / 2, boxY + boxHeight / 2);
  ctx.restore();
}

function drawCanvasHud(players, frameIndex, layout, unitScale, renderTick = null) {
  const slotsByTeam = typeof getHudTeamSlotsForFrame === 'function'
    ? getHudTeamSlotsForFrame(players)
    : { [TEAM_NUM_T]: [], [TEAM_NUM_CT]: [] };
  const displayMetaByTeam = typeof getHudTeamDisplayMetaForFrame === 'function'
    ? getHudTeamDisplayMetaForFrame(players)
    : { [TEAM_NUM_T]: null, [TEAM_NUM_CT]: null };
  drawRoundClockOnCanvas(layout, unitScale, renderTick);
  drawTeamPanelHud(layout.leftPanel, TEAM_NUM_T, slotsByTeam[TEAM_NUM_T], displayMetaByTeam[TEAM_NUM_T], unitScale);
  drawTeamPanelHud(layout.rightPanel, TEAM_NUM_CT, slotsByTeam[TEAM_NUM_CT], displayMetaByTeam[TEAM_NUM_CT], unitScale);
  drawKillFeedHud(frameIndex, layout, unitScale);
}

function drawRoundedRectPath(x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function drawPlayerBodyAndView(player, mapped, unitScale, playerRadius) {
  const outerRadius = playerRadius + Math.max(1.4, 1.3 * unitScale);
  const innerRadius = Math.max(outerRadius * 0.62, 2.4 * unitScale);
  const heading = (Number(player.yaw) || 0) * (Math.PI / 180);
  const bumpRadius = Math.max(outerRadius * 0.42, 2.2 * unitScale);
  const bumpDistance = outerRadius - (bumpRadius * 0.25);
  const bumpX = mapped.x + Math.cos(heading) * bumpDistance;
  const bumpY = mapped.y - Math.sin(heading) * bumpDistance;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
  ctx.shadowBlur = Math.max(2, 2.2 * unitScale);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(mapped.x, mapped.y, outerRadius, 0, Math.PI * 2);
  ctx.arc(bumpX, bumpY, bumpRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = getPlayerTeamColor(player);
  ctx.beginPath();
  ctx.arc(mapped.x, mapped.y, innerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function measurePlayerIdBadge(playerIdLabel, unitScale) {
  const fontSize = Math.max(8, 7.6 * unitScale);
  const paddingX = Math.max(5, 5 * unitScale);
  const paddingY = Math.max(2, 2 * unitScale);
  ctx.save();
  ctx.font = `700 ${fontSize}px Segoe UI`;
  const textWidth = ctx.measureText(playerIdLabel).width;
  ctx.restore();
  return {
    fontSize,
    boxWidth: textWidth + (paddingX * 2),
    boxHeight: fontSize + (paddingY * 2),
  };
}

function buildPlayerIdBadgeLayout(playerIdLabel, mapped, unitScale, playerRadius) {
  const metrics = measurePlayerIdBadge(playerIdLabel, unitScale);
  const bottomY = mapped.y - playerRadius - Math.max(3, 2.6 * unitScale);
  return {
    ...metrics,
    boxX: mapped.x - (metrics.boxWidth / 2),
    boxY: bottomY - metrics.boxHeight,
  };
}

function drawPlayerIdBadge(player, mapped, unitScale, playerRadius) {
  const playerIdLabel = getPlayerIdLabel(player);
  if (!playerIdLabel) {
    return null;
  }

  const badgeLayout = buildPlayerIdBadgeLayout(playerIdLabel, mapped, unitScale, playerRadius);

  ctx.save();
  ctx.font = `700 ${badgeLayout.fontSize}px Segoe UI`;
  drawRoundedRectPath(
    badgeLayout.boxX,
    badgeLayout.boxY,
    badgeLayout.boxWidth,
    badgeLayout.boxHeight,
    Math.max(4, 4 * unitScale),
  );
  ctx.fillStyle = hexToRgba(getPlayerTeamColor(player), 0.9);
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(playerIdLabel, mapped.x, badgeLayout.boxY + (badgeLayout.boxHeight / 2));
  ctx.restore();
  return badgeLayout;
}

function drawWeaponFallbackLabel(weaponName, iconX, iconY, iconSize, unitScale) {
  const fallbackLabel = getWeaponIconFallbackLabel(weaponName);
  ctx.fillStyle = 'rgba(225, 225, 225, 0.72)';
  ctx.font = `700 ${Math.max(8, 7 * unitScale)}px Segoe UI`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fallbackLabel, iconX + (iconSize / 2), iconY + (iconSize / 2));
}

function resolveWeaponIconY(mapped, playerRadius, unitScale, iconSize, badgeLayout) {
  if (badgeLayout) {
    return Math.max(1, badgeLayout.boxY - iconSize - Math.max(2, 2 * unitScale));
  }
  return Math.max(1, mapped.y - playerRadius - iconSize - Math.max(6, 5 * unitScale));
}

function drawPlayerWeaponLabel(player, mapped, unitScale, playerRadius, badgeLayout = null) {
  const weaponName = player.active_weapon_name || player.weapon_name;
  if (!weaponName) {
    return;
  }

  const iconSize = Math.max(15, 14 * unitScale);
  const iconX = mapped.x - (iconSize / 2);
  const iconY = resolveWeaponIconY(mapped, playerRadius, unitScale, iconSize, badgeLayout);

  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.filter = 'grayscale(1) brightness(1.35)';
  const iconDrawn = drawWeaponIconOnCanvas(ctx, weaponName, iconX, iconY, iconSize);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  if (!iconDrawn) {
    drawWeaponFallbackLabel(weaponName, iconX, iconY, iconSize, unitScale);
  }
  ctx.restore();
}

function drawPlayerEntry(entry, unitScale) {
  if (!entry) {
    return;
  }

  drawPlayerBodyAndView(entry.player, entry.mapped, unitScale, entry.playerRadius);
  const badgeLayout = drawPlayerIdBadge(entry.player, entry.mapped, unitScale, entry.playerRadius);
  drawPlayerWeaponLabel(entry.player, entry.mapped, unitScale, entry.playerRadius, badgeLayout);
}

function isPlayerAliveForRadar(player) {
  const health = Number(player?.health);
  if (Number.isFinite(health)) {
    return health > 0;
  }
  return player?.is_alive !== false;
}

function resolvePlayerInterpolationKey(player, index = 0) {
  if (!player || typeof player !== 'object') {
    return `slot:${index}`;
  }

  if (typeof getPlayerStableKey === 'function') {
    const stableKey = getPlayerStableKey(player);
    if (stableKey) {
      return stableKey;
    }
  }

  const userId = Number(player.user_id);
  if (Number.isFinite(userId) && userId > 0) {
    return `uid:${Math.floor(userId)}`;
  }

  const name = String(player.name || '').trim();
  if (name) {
    return `name:${name}`;
  }

  return `slot:${index}`;
}

function mapPlayersByInterpolationKey(players) {
  const map = new Map();
  if (!Array.isArray(players)) {
    return map;
  }

  players.forEach((player, index) => {
    map.set(resolvePlayerInterpolationKey(player, index), player);
  });
  return map;
}

function interpolatePlayerRecord(lowerPlayer, upperPlayer, alpha) {
  if (!lowerPlayer && !upperPlayer) {
    return null;
  }

  if (!lowerPlayer) {
    return { ...upperPlayer };
  }

  if (!upperPlayer) {
    return { ...lowerPlayer };
  }

  const lowerX = Number(lowerPlayer.X);
  const lowerY = Number(lowerPlayer.Y);
  const upperX = Number(upperPlayer.X);
  const upperY = Number(upperPlayer.Y);
  const lowerYaw = Number(lowerPlayer.yaw) || 0;
  const upperYaw = Number(upperPlayer.yaw) || 0;
  const lowerHealth = Number(lowerPlayer.health);
  const upperHealth = Number(upperPlayer.health);
  const lowerBalance = Number(lowerPlayer.balance);
  const upperBalance = Number(upperPlayer.balance);

  return {
    ...lowerPlayer,
    ...upperPlayer,
    X: Number.isFinite(lowerX) && Number.isFinite(upperX) ? lerpNumber(lowerX, upperX, alpha) : (upperPlayer.X ?? lowerPlayer.X),
    Y: Number.isFinite(lowerY) && Number.isFinite(upperY) ? lerpNumber(lowerY, upperY, alpha) : (upperPlayer.Y ?? lowerPlayer.Y),
    yaw: lerpAngleDegrees(lowerYaw, upperYaw, alpha),
    health: Number.isFinite(lowerHealth) && Number.isFinite(upperHealth)
      ? Math.max(0, Math.round(lerpNumber(lowerHealth, upperHealth, alpha)))
      : (upperPlayer.health ?? lowerPlayer.health ?? 0),
    balance: Number.isFinite(lowerBalance) && Number.isFinite(upperBalance)
      ? Math.max(0, Math.round(lerpNumber(lowerBalance, upperBalance, alpha)))
      : (upperPlayer.balance ?? lowerPlayer.balance ?? 0),
    is_alive: alpha < 1 ? lowerPlayer.is_alive !== false : upperPlayer.is_alive !== false,
  };
}

function buildInterpolatedPlayers(lowerPlayers, upperPlayers, alpha) {
  if (!Number.isFinite(alpha) || alpha <= 0) {
    return Array.isArray(lowerPlayers) ? lowerPlayers : [];
  }

  const lowerByKey = mapPlayersByInterpolationKey(lowerPlayers);
  const upperByKey = mapPlayersByInterpolationKey(upperPlayers);
  const keys = new Set([...lowerByKey.keys(), ...upperByKey.keys()]);
  const players = [];

  for (const key of keys) {
    const interpolatedPlayer = interpolatePlayerRecord(lowerByKey.get(key), upperByKey.get(key), alpha);
    if (interpolatedPlayer) {
      players.push(interpolatedPlayer);
    }
  }

  return players;
}

function findFrameIndexByTick(targetTick) {
  let left = 0;
  let right = Math.max(framesData.length - 1, 0);
  let answer = 0;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const midTick = getFrameTick(mid);
    if (midTick <= targetTick) {
      answer = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return answer;
}

function resolveFrameBlendByTick(targetTick) {
  if (!framesData.length) {
    return { lowerIndex: 0, upperIndex: 0, alpha: 0, tick: currentRoundStartTick };
  }

  const firstTick = getFrameTick(0);
  const lastTick = getFrameTick(framesData.length - 1);
  const safeTick = clamp(targetTick, firstTick, lastTick);
  const lowerIndex = findFrameIndexByTick(safeTick);
  const upperIndex = Math.min(lowerIndex + 1, framesData.length - 1);
  const lowerTick = getFrameTick(lowerIndex);
  const upperTick = getFrameTick(upperIndex);
  const tickDistance = upperTick - lowerTick;
  const alpha = tickDistance > 0 ? clamp((safeTick - lowerTick) / tickDistance, 0, 1) : 0;

  return { lowerIndex, upperIndex, alpha, tick: safeTick };
}

function renderFrame(players, frameIndex = 0, renderTick = null, grenadeInterpolation = null) {
  syncReplayCanvasSize();
  syncCanvasContextScale();
  const safePlayers = Array.isArray(players) ? players : [];
  const layout = buildCanvasHudLayout();
  updateMapViewport(layout.map);

  ctx.clearRect(0, 0, getCanvasDisplayWidth(), getCanvasDisplayHeight());
  drawCanvasBackdrop();
  drawMapFrame(currentMapViewport);
  const { scaleX, scaleY, unitScale } = getCanvasScale();

  ctx.save();
  ctx.beginPath();
  ctx.rect(currentMapViewport.x, currentMapViewport.y, currentMapViewport.width, currentMapViewport.height);
  ctx.clip();
  const grenadeFrameIndex = Number.isFinite(Number(renderTick)) ? Number(renderTick) : frameIndex;
  const renderTickValue = Number.isFinite(Number(renderTick)) ? Number(renderTick) : getFrameTick(frameIndex);
  const playerEntries = buildRenderablePlayerEntries(safePlayers, scaleX, scaleY, unitScale);
  drawGrenadeTrails(grenadeFrameIndex, scaleX, scaleY, unitScale, grenadeInterpolation);
  drawPlayerBlindEffects(playerEntries, renderTickValue, unitScale);
  playerEntries.forEach((entry) => {
    drawPlayerEntry(entry, unitScale);
  });
  drawPlayerShotEffects(playerEntries, renderTickValue, scaleX, scaleY, unitScale);
  ctx.restore();

  drawCanvasHud(safePlayers, frameIndex, layout, unitScale, renderTick);
}

function renderEmptyFrame() {
  if (typeof resetHudState === 'function') {
    resetHudState();
  }
  currentPlaybackTickRaw = currentRoundStartTick;
  currentPlaybackTick = currentRoundStartTick;
  renderFrame([], 0, currentRoundStartTick);
}

function renderFrameByIndex(index) {
  if (!framesData.length) {
    currentPlaybackTick = currentRoundStartTick;
    renderEmptyFrame();
    return 0;
  }

  const safeIndex = clamp(index, 0, framesData.length - 1);
  const targetTick = getFrameTick(safeIndex);
  currentPlaybackTickRaw = targetTick;
  currentPlaybackTick = targetTick;
  return renderFrameByTick(targetTick);
}

function renderFrameByTick(targetTick) {
  if (!framesData.length) {
    currentPlaybackTick = currentRoundStartTick;
    renderEmptyFrame();
    return 0;
  }

  const blend = resolveFrameBlendByTick(targetTick);
  const lowerFrame = framesData[blend.lowerIndex] || { players: [] };
  const upperFrame = framesData[blend.upperIndex] || lowerFrame;
  const players = buildInterpolatedPlayers(lowerFrame.players, upperFrame.players, blend.alpha);
  currentFrameIndex = blend.lowerIndex;
  currentPlaybackTick = blend.tick;
  renderFrame(players, blend.lowerIndex, blend.tick, {
    upperIndex: blend.upperIndex,
    alpha: blend.alpha,
  });
  updateProgressBar(blend.lowerIndex, blend.tick);
  return blend.lowerIndex;
}

function preparePlaybackAdvance(timestampMs) {
  if (!Number.isFinite(timestampMs)) {
    scheduleNextFrame();
    return false;
  }

  if (playbackLastTimestamp <= 0) {
    playbackLastTimestamp = timestampMs;
    scheduleNextFrame();
    return false;
  }

  return true;
}

function advancePlaybackByTimestamp(timestampMs) {
  const elapsedMs = Math.max(timestampMs - playbackLastTimestamp, 0);
  const ticksToAdvance = (elapsedMs / 1000) * currentTickrate * PLAYBACK_SPEED;
  if (ticksToAdvance <= 0) {
    return;
  }

  const firstTick = getFrameTick(0);
  const lastTick = getFrameTick(framesData.length - 1);
  if (
    !Number.isFinite(currentPlaybackTickRaw)
    || currentPlaybackTickRaw < firstTick
    || currentPlaybackTickRaw > lastTick
  ) {
    currentPlaybackTickRaw = getFrameTick(currentFrameIndex);
  }

  currentPlaybackTickRaw = clamp(currentPlaybackTickRaw + ticksToAdvance, firstTick, lastTick);
  const displayTick = clamp(quantizePlaybackTick(currentPlaybackTickRaw), firstTick, lastTick);
  renderFrameByTick(displayTick);
  playbackLastTimestamp = timestampMs;
}

function finishPlaybackWhenEnded() {
  if (!framesData.length) {
    return false;
  }

  const finalTick = getFrameTick(framesData.length - 1);
  if (currentPlaybackTickRaw < finalTick) {
    return false;
  }

  currentPlaybackTickRaw = finalTick;
  currentPlaybackTick = finalTick;
  renderFrameByTick(finalTick);
  pausePlayback();
  if (activeRoundIndex >= 0 && roundsData[activeRoundIndex]) {
    setStatus(`Round ${roundsData[activeRoundIndex].number} playback finished`);
  } else {
    setStatus('Playback finished');
  }
  return true;
}

function playNextFrame(timestampMs) {
  if (!isPlaying || isUserScrubbing) {
    return;
  }

  if (!framesData.length) {
    pausePlayback();
    return;
  }

  if (!preparePlaybackAdvance(timestampMs)) {
    return;
  }

  advancePlaybackByTimestamp(timestampMs);
  if (finishPlaybackWhenEnded()) {
    return;
  }

  scheduleNextFrame();
}

function handleScrubStart() {
  if (!framesData.length) {
    return;
  }

  isUserScrubbing = true;
  pausePlayback();
}

function handleScrubInput() {
  if (!framesData.length) {
    return;
  }

  isUserScrubbing = true;
  pausePlayback();

  const targetIndex = Number(progressBar.value) || 0;
  currentFrameIndex = renderFrameByIndex(targetIndex);
  currentPlaybackTickRaw = currentPlaybackTick;
}

function handleScrubEnd() {
  if (!framesData.length) {
    return;
  }

  const targetIndex = Number(progressBar.value) || 0;
  currentFrameIndex = renderFrameByIndex(targetIndex);
  currentPlaybackTickRaw = currentPlaybackTick;
  isUserScrubbing = false;

  // Requirement: resume playback from selected frame after release.
  resumePlayback();
}
