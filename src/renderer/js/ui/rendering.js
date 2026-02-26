function worldToCanvas(gameX, gameY, scaleX, scaleY) {
  const mapMeta = currentMapMeta || DEFAULT_MAP_META;

  // CS2 world -> radar pixels
  const pixelX = (gameX - mapMeta.pos_x) / mapMeta.scale;
  const pixelY = (mapMeta.pos_y - gameY) / mapMeta.scale;

  // Radar pixels -> current canvas pixels
  return {
    x: pixelX * scaleX,
    y: pixelY * scaleY
  };
}

function drawFallbackBackground() {
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (radarImageFailed) {
    ctx.fillStyle = '#888';
    ctx.font = '14px Segoe UI';
    ctx.fillText(`Radar image missing: ${currentRadarImagePath}`, 16, 26);
  }
}

function drawRadarBackground() {
  if (radarImageReady && radarImg.naturalWidth > 0 && radarImg.naturalHeight > 0) {
    try {
      ctx.drawImage(radarImg, 0, 0, canvas.width, canvas.height);
      return;
    } catch (err) {
      radarImageReady = false;
      radarImageFailed = true;
      console.warn(`[Radar] drawImage failed, fallback enabled: ${err.message}`);
    }
  }

  drawFallbackBackground();
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

function drawGrenadeTrailWithEffect(trail, firstTrailFrame, safeFrameIndex, scaleX, scaleY, unitScale) {
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

  const visiblePoints = trail.points.filter((point) => point.frameIndex <= effectState.trailVisibleUntilFrame);
  if (visiblePoints.length > 0) {
    drawGrenadeTrailVisual(trail, visiblePoints, scaleX, scaleY, unitScale);
  }
}

function drawGrenadeTrails(frameIndex, scaleX, scaleY, unitScale) {
  if (!framesData.length) {
    return;
  }

  const safeFrameIndex = clamp(frameIndex, 0, framesData.length - 1);
  const firstTrailFrame = Math.max(0, safeFrameIndex - getGrenadeLookbackFrameCount());
  const trailsByEntity = collectGrenadeTrails(firstTrailFrame, safeFrameIndex);

  for (const trail of trailsByEntity.values()) {
    drawGrenadeTrailWithEffect(trail, firstTrailFrame, safeFrameIndex, scaleX, scaleY, unitScale);
  }
}

function getCanvasScale() {
  const radarSize = currentRadarSize > 0 ? currentRadarSize : DEFAULT_RADAR_SIZE;
  const scaleX = canvas.width / radarSize;
  const scaleY = canvas.height / radarSize;
  const unitScale = Math.max(Math.min(scaleX, scaleY), 0.5);
  return { scaleX, scaleY, unitScale };
}

function getPlayerTeamColor(player) {
  return player.team_num === 2 ? '#f1c40f' : '#2ec4ff';
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

function renderFrame(players, frameIndex = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRadarBackground();
  const { scaleX, scaleY, unitScale } = getCanvasScale();

  drawGrenadeTrails(frameIndex, scaleX, scaleY, unitScale);
  if (typeof renderTeamPanelsForFrame === 'function') {
    renderTeamPanelsForFrame(Array.isArray(players) ? players : []);
  }
  if (typeof renderKillFeedByFrame === 'function') {
    renderKillFeedByFrame(frameIndex);
  }

  if (!Array.isArray(players)) {
    return;
  }

  players.forEach((player) => {
    if (isPlayerAliveForRadar(player)) {
      drawPlayer(player, scaleX, scaleY, unitScale);
    }
  });
}

function renderFrameByIndex(index) {
  if (!framesData.length) {
    drawRadarBackground();
    if (typeof resetHudState === 'function') {
      resetHudState();
    }
    return 0;
  }

  const safeIndex = clamp(index, 0, framesData.length - 1);
  const frame = framesData[safeIndex] || { players: [] };
  renderFrame(frame.players || [], safeIndex);
  updateProgressBar(safeIndex);
  return safeIndex;
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
  const ticksToAdvance = Math.floor((elapsedMs / 1000) * currentTickrate * PLAYBACK_SPEED);
  if (ticksToAdvance <= 0) {
    return;
  }

  const currentTick = getFrameTick(currentFrameIndex);
  const targetTick = currentTick + ticksToAdvance;
  const nextIndex = findFrameIndexForTargetTick(currentFrameIndex, targetTick);
  if (nextIndex !== currentFrameIndex) {
    currentFrameIndex = nextIndex;
    renderFrameByIndex(currentFrameIndex);
  }

  const msPerTick = 1000 / Math.max(currentTickrate * PLAYBACK_SPEED, 1);
  playbackLastTimestamp = timestampMs - (elapsedMs % msPerTick);
}

function finishPlaybackWhenEnded() {
  if (currentFrameIndex < framesData.length - 1) {
    return false;
  }

  renderFrameByIndex(framesData.length - 1);
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

