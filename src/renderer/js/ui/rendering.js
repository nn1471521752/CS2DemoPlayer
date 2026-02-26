const HUD_OUTER_PADDING = 8;
const HUD_COLUMN_GAP = 8;
const HUD_PANEL_MIN_WIDTH = 96;
const HUD_PANEL_MAX_WIDTH = 180;
const HUD_MIN_MAP_SIZE = 360;
const HUD_PLAYER_SLOT_GAP = 10;
const HUD_PLAYER_SLOT_MIN_HEIGHT = 52;
const HUD_PLAYER_SLOT_MAX_HEIGHT = 70;
const HUD_PLAYER_SLOTS = 5;
const DISPLAY_TICKRATE = 32;

let currentMapViewport = {
  x: 0,
  y: 0,
  width: canvas.width,
  height: canvas.height,
  scaleX: canvas.width / DEFAULT_RADAR_SIZE,
  scaleY: canvas.height / DEFAULT_RADAR_SIZE,
};
let currentPlaybackTick = 0;

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
  return {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
    scaleX: canvas.width / radarSize,
    scaleY: canvas.height / radarSize,
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

function buildCanvasHudLayout() {
  const outer = HUD_OUTER_PADDING;
  const innerWidth = Math.max(canvas.width - (outer * 2), 1);
  const innerHeight = Math.max(canvas.height - (outer * 2), 1);
  const maxPanelWidthByCanvas = (innerWidth - (HUD_COLUMN_GAP * 2) - HUD_MIN_MAP_SIZE) / 2;
  const desiredPanelWidth = clamp(innerWidth * 0.11, HUD_PANEL_MIN_WIDTH, HUD_PANEL_MAX_WIDTH);
  const panelWidth = clamp(desiredPanelWidth, 40, Math.max(40, maxPanelWidthByCanvas));
  const availableMapSize = Math.max(1, innerWidth - (panelWidth * 2) - (HUD_COLUMN_GAP * 2));
  const mapSize = Math.max(Math.min(HUD_MIN_MAP_SIZE, availableMapSize), Math.min(innerHeight, availableMapSize));
  const contentWidth = (panelWidth * 2) + (HUD_COLUMN_GAP * 2) + mapSize;
  const contentStartX = outer + ((innerWidth - contentWidth) / 2);
  const mapX = contentStartX + panelWidth + HUD_COLUMN_GAP;
  const mapY = outer + ((innerHeight - mapSize) / 2);
  const rightPanelX = mapX + mapSize + HUD_COLUMN_GAP;

  return {
    leftPanel: { x: contentStartX, y: outer, width: panelWidth, height: innerHeight },
    map: { x: mapX, y: mapY, width: mapSize, height: mapSize },
    rightPanel: { x: rightPanelX, y: outer, width: panelWidth, height: innerHeight },
    killArea: {
      x: canvas.width - outer - Math.min(420, canvas.width * 0.34),
      y: outer + 4,
      width: Math.min(420, canvas.width * 0.34),
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
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#0b1018');
  gradient.addColorStop(1, '#0f1724');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
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

function drawGrenadeEffectCircle(grenadeType, worldPoint, elapsedSeconds, scaleX, scaleY, unitScale) {
  const typeKey = normalizeGrenadeType(grenadeType);
  const effectConfig = GRENADE_EFFECT_CONFIG_BY_TYPE[typeKey];
  if (!effectConfig || !worldPoint) {
    return;
  }

  const durationSeconds = Number(effectConfig.durationSeconds) || 0;
  if (durationSeconds <= 0 || elapsedSeconds < 0 || elapsedSeconds > durationSeconds) {
    return;
  }

  const progress = clamp(elapsedSeconds / durationSeconds, 0, 1);
  const fadeOutSeconds = clamp(Number(effectConfig.fadeOutSeconds) || durationSeconds, 0.05, durationSeconds);
  const fadeStartSeconds = Math.max(0, durationSeconds - fadeOutSeconds);
  let fadeFactor = 1;
  if (elapsedSeconds > fadeStartSeconds) {
    const tailProgress = (elapsedSeconds - fadeStartSeconds) / fadeOutSeconds;
    fadeFactor = 1 - clamp(tailProgress, 0, 1);
  }
  const baseColor = getGrenadeColor(typeKey);
  const center = worldToCanvas(worldPoint.x, worldPoint.y, scaleX, scaleY);
  let radius = worldRadiusToCanvasRadius(effectConfig.radiusWorldUnits, scaleX, scaleY);

  if (effectConfig.pulse) {
    radius *= (0.65 + 0.35 * progress);
  }

  const fillAlpha = clamp((Number(effectConfig.fillAlpha) || 0.14) * fadeFactor, 0.02, 1);
  const strokeAlpha = clamp((Number(effectConfig.strokeAlpha) || 0.7) * fadeFactor, 0.06, 1);

  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(baseColor, fillAlpha);
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.5 * unitScale);
  ctx.strokeStyle = hexToRgba(baseColor, strokeAlpha);
  ctx.stroke();
}

function distance3D(pointA, pointB) {
  if (!pointA || !pointB) {
    return Number.POSITIVE_INFINITY;
  }

  const dx = Number(pointA.x) - Number(pointB.x);
  const dy = Number(pointA.y) - Number(pointB.y);
  const dz = Number(pointA.z) - Number(pointB.z);
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function countTrailingStableSteps(points, stableDeltaWorldUnits) {
  let steps = 0;
  for (let index = points.length - 1; index >= 1; index -= 1) {
    const delta = distance3D(points[index], points[index - 1]);
    if (delta > stableDeltaWorldUnits) {
      break;
    }
    steps += 1;
  }
  return steps;
}

function hasPreBurstMovement(points, stableStartPointIndex, minimumDelta) {
  for (let index = 1; index <= stableStartPointIndex; index += 1) {
    const delta = distance3D(points[index], points[index - 1]);
    if (delta >= minimumDelta) {
      return true;
    }
  }
  return false;
}

function passesStabilizationTravelCheck(stableStartPoint, firstRawPoint, minimumTravelUnits) {
  if (minimumTravelUnits <= 0 || !firstRawPoint) {
    return true;
  }

  return distance3D(stableStartPoint, firstRawPoint) >= minimumTravelUnits;
}

function detectExplosionFrameIndexByStabilization(trail) {
  if (!trail || !Array.isArray(trail.points) || trail.points.length < 4) {
    return null;
  }

  const effectConfig = GRENADE_EFFECT_CONFIG_BY_TYPE[normalizeGrenadeType(trail.grenadeType)] || null;
  const requiredStableSteps = Math.max(6, Math.floor(currentTickrate * 0.18));
  const trailingStableSteps = countTrailingStableSteps(trail.points, 0.1);
  if (trailingStableSteps < requiredStableSteps) {
    return null;
  }

  const stableStartPointIndex = Math.max(0, trail.points.length - trailingStableSteps - 1);
  const stableStartPoint = trail.points[stableStartPointIndex];
  const hasFrameIndex = stableStartPoint && Number.isFinite(Number(stableStartPoint.frameIndex));
  if (!hasFrameIndex) {
    return null;
  }

  const minimumDelta = Number(effectConfig?.preBurstMinDeltaWorldUnits) || 2.0;
  if (!hasPreBurstMovement(trail.points, stableStartPointIndex, minimumDelta)) {
    return null;
  }

  const minimumTravel = Number(effectConfig?.stabilizationMinTravelUnits) || 0;
  if (!passesStabilizationTravelCheck(stableStartPoint, trail.firstRawPoint, minimumTravel)) {
    return null;
  }

  return Number(stableStartPoint.frameIndex);
}

function findPointAtOrAfterFrame(points, targetFrameIndex) {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }

  for (const point of points) {
    if (point.frameIndex >= targetFrameIndex) {
      return point;
    }
  }

  return points[points.length - 1] || null;
}

function getEffectDurationFrames(effectConfig) {
  return Math.max(0, Math.round((Number(effectConfig?.durationSeconds) || 0) * currentTickrate));
}

function deriveTailStartFrameIndex(trail, safeFrameIndex, effectConfig, effectDurationFrames) {
  const lastSeenFrameIndex = trail.lastSeenFrameIndex;
  const hasTailSignal = effectConfig?.deriveExplodeByTailDuration && effectDurationFrames > 0;
  const enoughFrames = lastSeenFrameIndex - effectDurationFrames >= trail.firstSeenFrameIndex;
  if (!hasTailSignal || safeFrameIndex <= lastSeenFrameIndex || !enoughFrames) {
    return null;
  }
  return lastSeenFrameIndex - effectDurationFrames;
}

function clampEffectStartFrameIndex(effectStartFrameIndex, firstSeenFrameIndex, lastSeenFrameIndex) {
  if (effectStartFrameIndex === null) {
    return null;
  }

  const clamped = clamp(effectStartFrameIndex, firstSeenFrameIndex, lastSeenFrameIndex);
  return Number.isFinite(clamped) ? clamped : null;
}

function resolveEffectStartFrameIndex(trail, safeFrameIndex, effectConfig, effectDurationFrames) {
  if (!effectConfig) {
    return null;
  }

  const stabilizationStart = effectConfig.detectExplodeByStabilization
    ? detectExplosionFrameIndexByStabilization(trail)
    : null;
  const tailStart = deriveTailStartFrameIndex(trail, safeFrameIndex, effectConfig, effectDurationFrames);

  if (tailStart !== null && stabilizationStart !== null) {
    return clampEffectStartFrameIndex(
      Math.max(tailStart, stabilizationStart),
      trail.firstSeenFrameIndex,
      trail.lastSeenFrameIndex,
    );
  }
  if (tailStart !== null) {
    return clampEffectStartFrameIndex(tailStart, trail.firstSeenFrameIndex, trail.lastSeenFrameIndex);
  }
  if (stabilizationStart !== null) {
    return clampEffectStartFrameIndex(stabilizationStart, trail.firstSeenFrameIndex, trail.lastSeenFrameIndex);
  }
  if (safeFrameIndex > trail.lastSeenFrameIndex) {
    return clampEffectStartFrameIndex(trail.lastSeenFrameIndex, trail.firstSeenFrameIndex, trail.lastSeenFrameIndex);
  }
  return null;
}

function getTrailVisibleUntilFrame(trail, exploded, effectStartFrameIndex, effectConfig, safeFrameIndex) {
  if (!exploded) {
    return safeFrameIndex;
  }

  const persistFrames = Math.max(
    0,
    Math.round((Number(effectConfig?.trailPersistSecondsAfterExplode) || 0) * currentTickrate),
  );
  return effectStartFrameIndex + persistFrames;
}

function shouldDrawGrenadeEffectCircle(effectConfig, exploded, effectElapsedSeconds, effectDurationFrames) {
  if (!effectConfig || !exploded || effectElapsedSeconds < 0 || effectDurationFrames <= 0) {
    return false;
  }

  const durationSeconds = effectDurationFrames / Math.max(currentTickrate, 1);
  return effectElapsedSeconds <= durationSeconds;
}

function resolveGrenadeEffectState(trail, safeFrameIndex) {
  const typeKey = normalizeGrenadeType(trail.grenadeType);
  const effectConfig = GRENADE_EFFECT_CONFIG_BY_TYPE[typeKey] || null;
  const effectDurationFrames = getEffectDurationFrames(effectConfig);
  const effectStartFrameIndex = resolveEffectStartFrameIndex(
    trail,
    safeFrameIndex,
    effectConfig,
    effectDurationFrames,
  );
  const exploded = effectStartFrameIndex !== null && safeFrameIndex >= effectStartFrameIndex;
  const trailVisibleUntilFrame = getTrailVisibleUntilFrame(
    trail,
    exploded,
    effectStartFrameIndex,
    effectConfig,
    safeFrameIndex,
  );
  const effectElapsedSeconds = exploded ? (safeFrameIndex - effectStartFrameIndex) / Math.max(currentTickrate, 1) : -1;
  const effectPoint = effectStartFrameIndex !== null ? findPointAtOrAfterFrame(trail.points, effectStartFrameIndex) : null;

  return {
    typeKey,
    effectConfig,
    exploded,
    effectStartFrameIndex,
    trailVisibleUntilFrame,
    shouldDrawTrail: trailVisibleUntilFrame >= trail.firstSeenFrameIndex && safeFrameIndex <= trailVisibleUntilFrame,
    shouldDrawEffectCircle: shouldDrawGrenadeEffectCircle(
      effectConfig,
      exploded,
      effectElapsedSeconds,
      effectDurationFrames,
    ),
    effectElapsedSeconds,
    effectPoint: effectPoint || trail.lastSeenPoint,
  };
}

function getGrenadeLookbackFrameCount() {
  const effectFrames = Math.ceil((MAX_GRENADE_EFFECT_SECONDS + MAX_GRENADE_TRAIL_PERSIST_SECONDS) * currentTickrate) + 8;
  return Math.max(GRENADE_TRAIL_MAX_FRAMES, effectFrames);
}

function toGrenadePoint(grenade, frameIndex) {
  const x = Number(grenade?.x);
  const y = Number(grenade?.y);
  const z = Number(grenade?.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  return { x, y, z, frameIndex };
}

function getGrenadeEntityId(grenade, point) {
  if (grenade?.entity_id !== undefined && grenade?.entity_id !== null) {
    return String(grenade.entity_id);
  }

  return `${grenade?.grenade_type || 'unknown'}-${Math.round(point.x)}-${Math.round(point.y)}-${Math.round(point.z)}`;
}

function createGrenadeTrail(entityId, grenadeType, point, frameIndex) {
  return {
    entityId,
    grenadeType: String(grenadeType || 'unknown'),
    points: [],
    firstSeenFrameIndex: frameIndex,
    lastSeenFrameIndex: frameIndex,
    stabilizationStartFrameIndex: null,
    stableRunFrames: 0,
    hasMovedSignificantly: false,
    firstRawPoint: point,
    previousRawPoint: null,
    lastSeenPoint: point,
  };
}

function getOrCreateGrenadeTrail(trailsByEntity, grenade, point, frameIndex) {
  const entityId = getGrenadeEntityId(grenade, point);
  if (!trailsByEntity.has(entityId)) {
    trailsByEntity.set(entityId, createGrenadeTrail(entityId, grenade?.grenade_type, point, frameIndex));
  }
  return trailsByEntity.get(entityId);
}

function updateGrenadeTrailMotion(trail, point, frameIndex) {
  const effectConfig = GRENADE_EFFECT_CONFIG_BY_TYPE[normalizeGrenadeType(trail.grenadeType)] || null;
  const minimumTravel = Number(effectConfig?.stabilizationMinTravelUnits) || 0;
  const requiredStableFrames = Math.max(6, Math.floor(currentTickrate * 0.18));

  trail.lastSeenFrameIndex = frameIndex;
  trail.lastSeenPoint = point;

  if (!trail.hasMovedSignificantly && trail.firstRawPoint) {
    trail.hasMovedSignificantly = distance3D(point, trail.firstRawPoint) >= minimumTravel;
  }

  if (trail.previousRawPoint) {
    const rawDelta = distance3D(point, trail.previousRawPoint);
    trail.stableRunFrames = trail.hasMovedSignificantly && rawDelta <= 0.1 ? trail.stableRunFrames + 1 : 0;
    if (trail.stabilizationStartFrameIndex === null && trail.stableRunFrames >= requiredStableFrames) {
      trail.stabilizationStartFrameIndex = frameIndex - trail.stableRunFrames;
    }
  }

  trail.previousRawPoint = point;
}

function collectGrenadeTrails(firstTrailFrame, safeFrameIndex) {
  const trailsByEntity = new Map();

  for (let frameIndex = firstTrailFrame; frameIndex <= safeFrameIndex; frameIndex += 1) {
    const frameGrenades = framesData[frameIndex]?.grenades;
    if (!Array.isArray(frameGrenades) || frameGrenades.length === 0) {
      continue;
    }

    for (const grenade of frameGrenades) {
      const point = toGrenadePoint(grenade, frameIndex);
      if (!point) {
        continue;
      }

      const trail = getOrCreateGrenadeTrail(trailsByEntity, grenade, point, frameIndex);
      trail.grenadeType = String(grenade?.grenade_type || trail.grenadeType);
      updateGrenadeTrailMotion(trail, point, frameIndex);
      trail.points.push(point);
    }
  }

  return trailsByEntity;
}

function getGrenadeInterpolationKey(grenade) {
  if (!grenade || typeof grenade !== 'object') {
    return '';
  }

  if (grenade.entity_id !== undefined && grenade.entity_id !== null) {
    return String(grenade.entity_id);
  }

  const x = Number(grenade.x) || 0;
  const y = Number(grenade.y) || 0;
  const z = Number(grenade.z) || 0;
  return `${grenade.grenade_type || 'unknown'}-${Math.round(x)}-${Math.round(y)}-${Math.round(z)}`;
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
  const color = getGrenadeColor(trail.grenadeType);
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
  scaleX,
  scaleY,
  unitScale,
  interpolatedPointsByEntity = null,
) {
  if (!Array.isArray(trail.points) || trail.points.length === 0 || trail.lastSeenFrameIndex < firstTrailFrame) {
    return;
  }

  const effectState = resolveGrenadeEffectState(trail, safeFrameIndex);
  if (effectState.shouldDrawEffectCircle && effectState.effectPoint) {
    drawGrenadeEffectCircle(trail.grenadeType, effectState.effectPoint, effectState.effectElapsedSeconds, scaleX, scaleY, unitScale);
  }
  if (!effectState.shouldDrawTrail) {
    return;
  }

  let visiblePoints = trail.points.filter((point) => point.frameIndex <= effectState.trailVisibleUntilFrame);
  const interpolatedPoint = interpolatedPointsByEntity?.get(trail.entityId) || null;
  if (interpolatedPoint) {
    const mergedPoints = [...visiblePoints];
    const lastPoint = mergedPoints[mergedPoints.length - 1] || null;
    if (!lastPoint || interpolatedPoint.frameIndex >= lastPoint.frameIndex) {
      mergedPoints.push(interpolatedPoint);
      visiblePoints = mergedPoints;
    }
  }

  if (visiblePoints.length > 0) {
    drawGrenadeTrailVisual(trail, visiblePoints, scaleX, scaleY, unitScale);
  }
}

function drawGrenadeTrails(frameIndex, scaleX, scaleY, unitScale, interpolation = null) {
  if (!framesData.length) {
    return;
  }

  const safeFrameIndex = clamp(frameIndex, 0, framesData.length - 1);
  const floorFrameIndex = Math.floor(safeFrameIndex);
  const firstTrailFrame = Math.max(0, floorFrameIndex - getGrenadeLookbackFrameCount());
  const trailsByEntity = collectGrenadeTrails(firstTrailFrame, floorFrameIndex);
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
      scaleX,
      scaleY,
      unitScale,
      interpolatedPointsByEntity,
    );
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

function buildTeamSlotRects(panelRect) {
  const inset = 4;
  const bodyX = panelRect.x + inset;
  const bodyY = panelRect.y + inset;
  const bodyWidth = Math.max(1, panelRect.width - (inset * 2));
  const bodyHeight = Math.max(1, panelRect.height - (inset * 2));
  const slotHeight = clamp(bodyHeight * 0.13, HUD_PLAYER_SLOT_MIN_HEIGHT, HUD_PLAYER_SLOT_MAX_HEIGHT);
  const totalHeight = (slotHeight * HUD_PLAYER_SLOTS) + (HUD_PLAYER_SLOT_GAP * (HUD_PLAYER_SLOTS - 1));
  const startY = bodyY + ((bodyHeight - totalHeight) / 2);
  const slots = [];

  for (let slotIndex = 0; slotIndex < HUD_PLAYER_SLOTS; slotIndex += 1) {
    const slotY = startY + (slotIndex * (slotHeight + HUD_PLAYER_SLOT_GAP));
    slots.push({ x: bodyX, y: slotY, width: bodyWidth, height: slotHeight });
  }

  return slots;
}

function drawTeamSlotHud(player, slotRect, slotIndex, teamNum, unitScale) {
  const isEmpty = !player;
  const hp = clamp(coerceNonNegativeInteger(player?.health, 0), 0, 100);
  const isDead = !isEmpty && (player.is_alive === false || hp <= 0);
  const slotOpacity = isEmpty ? 0.42 : (isDead ? 0.62 : 1);
  const idLabel = isEmpty ? `Empty #${slotIndex + 1}` : (getPlayerIdLabel(player) || `Player ${slotIndex + 1}`);
  const hpText = `HP ${hp}`;
  const teamColor = getTeamColorHex(player?.team_num || teamNum);
  const money = isEmpty ? '$0' : `$${coerceNonNegativeInteger(player?.balance, 0)}`;
  const barInset = Math.max(4, 4 * unitScale);
  const barHeight = Math.max(7, 7 * unitScale);
  const barY = slotRect.y + ((slotRect.height - barHeight) / 2);
  const barWidth = Math.max(1, slotRect.width - (barInset * 2));
  const fillWidth = barWidth * (hp / 100);
  const labelY = barY - Math.max(4, 5 * unitScale);
  const valueY = barY + barHeight + Math.max(10, 9 * unitScale);

  ctx.save();
  ctx.globalAlpha = slotOpacity;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
  ctx.fillRect(slotRect.x + barInset, barY, barWidth, barHeight);
  ctx.fillStyle = teamColor;
  ctx.fillRect(slotRect.x + barInset, barY, fillWidth, barHeight);
  ctx.font = `700 ${Math.max(11, 11 * unitScale)}px Segoe UI`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = teamColor;
  ctx.fillText(idLabel, slotRect.x + barInset, labelY);
  ctx.font = `600 ${Math.max(10, 10 * unitScale)}px Segoe UI`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#dbe4f1';
  ctx.fillText(hpText, slotRect.x + barInset, valueY);
  ctx.textAlign = 'right';
  ctx.fillText(money, slotRect.x + slotRect.width - barInset, valueY);
  ctx.restore();
}

function drawTeamPanelHud(panelRect, teamNum, slots, unitScale) {
  const slotRects = buildTeamSlotRects(panelRect);

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
  const rowRadius = Math.max(6, 6 * unitScale);
  const iconSize = Math.max(14, rowHeight - 8);
  const fontSize = Math.max(11, 11 * unitScale);
  const areaWidth = Math.max(200, layout.killArea.width);
  const rowWidth = Math.min(360, areaWidth);
  let rowY = layout.killArea.y;

  for (let index = 0; index < drawCount; index += 1) {
    const kill = kills[index];
    const rowX = layout.killArea.x + (areaWidth - rowWidth);
    const rowRect = { x: rowX, y: rowY, width: rowWidth, height: rowHeight };
    const iconX = rowRect.x + ((rowRect.width - iconSize) / 2);
    const iconY = rowRect.y + ((rowRect.height - iconSize) / 2);
    const sideGap = Math.max(6, 6 * unitScale);
    const sideWidth = Math.max(20, ((rowRect.width - iconSize) / 2) - (sideGap * 2));

    ctx.save();
    ctx.font = `700 ${fontSize}px Segoe UI`;
    ctx.textBaseline = 'middle';
    const attackerText = fitTextByWidth(kill.attacker, sideWidth);
    const victimText = fitTextByWidth(kill.victim, sideWidth);
    ctx.textAlign = 'right';
    ctx.fillStyle = getTeamColorHex(kill.attackerTeamNum);
    ctx.fillText(attackerText, iconX - sideGap, rowRect.y + (rowRect.height / 2));
    ctx.textAlign = 'left';
    ctx.fillStyle = getTeamColorHex(kill.victimTeamNum);
    ctx.fillText(victimText, iconX + iconSize + sideGap, rowRect.y + (rowRect.height / 2));
    drawKillWeaponIcon(kill, iconX, iconY, iconSize, unitScale);
    ctx.restore();

    rowY += rowHeight + rowGap;
  }
}

function drawCanvasHud(players, frameIndex, layout, unitScale) {
  const slotsByTeam = typeof getHudTeamSlotsForFrame === 'function'
    ? getHudTeamSlotsForFrame(players)
    : { [TEAM_NUM_T]: [], [TEAM_NUM_CT]: [] };
  drawTeamPanelHud(layout.leftPanel, TEAM_NUM_T, slotsByTeam[TEAM_NUM_T], unitScale);
  drawTeamPanelHud(layout.rightPanel, TEAM_NUM_CT, slotsByTeam[TEAM_NUM_CT], unitScale);
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

function drawPlayer(player, scaleX, scaleY, unitScale) {
  const playerRadius = 6 * unitScale;
  const mapped = worldToCanvas(player.X, player.Y, scaleX, scaleY);
  drawPlayerBodyAndView(player, mapped, unitScale, playerRadius);
  const badgeLayout = drawPlayerIdBadge(player, mapped, unitScale, playerRadius);
  drawPlayerWeaponLabel(player, mapped, unitScale, playerRadius, badgeLayout);
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
  const safePlayers = Array.isArray(players) ? players : [];
  const layout = buildCanvasHudLayout();
  updateMapViewport(layout.map);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCanvasBackdrop();
  drawMapFrame(currentMapViewport);
  const { scaleX, scaleY, unitScale } = getCanvasScale();

  ctx.save();
  ctx.beginPath();
  ctx.rect(currentMapViewport.x, currentMapViewport.y, currentMapViewport.width, currentMapViewport.height);
  ctx.clip();
  const grenadeFrameIndex = Number.isFinite(Number(renderTick)) ? Number(renderTick) : frameIndex;
  drawGrenadeTrails(grenadeFrameIndex, scaleX, scaleY, unitScale, grenadeInterpolation);
  safePlayers.forEach((player) => {
    if (isPlayerAliveForRadar(player)) {
      drawPlayer(player, scaleX, scaleY, unitScale);
    }
  });
  ctx.restore();

  drawCanvasHud(safePlayers, frameIndex, layout, unitScale);
}

function renderEmptyFrame() {
  if (typeof resetHudState === 'function') {
    resetHudState();
  }
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

function findFrameIndexForTargetTick(startIndex, targetTick) {
  let index = clamp(startIndex, 0, Math.max(framesData.length - 1, 0));
  while (index + 1 < framesData.length && getFrameTick(index + 1) <= targetTick) {
    index += 1;
  }
  return index;
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
  if (!Number.isFinite(currentPlaybackTick) || currentPlaybackTick < firstTick || currentPlaybackTick > lastTick) {
    currentPlaybackTick = getFrameTick(currentFrameIndex);
  }

  currentPlaybackTick = clamp(currentPlaybackTick + ticksToAdvance, firstTick, lastTick);
  currentPlaybackTick = clamp(quantizePlaybackTick(currentPlaybackTick), firstTick, lastTick);
  renderFrameByTick(currentPlaybackTick);
  playbackLastTimestamp = timestampMs;
}

function finishPlaybackWhenEnded() {
  if (!framesData.length) {
    return false;
  }

  const finalTick = getFrameTick(framesData.length - 1);
  if (currentPlaybackTick < finalTick) {
    return false;
  }

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
}

function handleScrubEnd() {
  if (!framesData.length) {
    return;
  }

  const targetIndex = Number(progressBar.value) || 0;
  currentFrameIndex = renderFrameByIndex(targetIndex);
  isUserScrubbing = false;

  // Requirement: resume playback from selected frame after release.
  resumePlayback();
}

