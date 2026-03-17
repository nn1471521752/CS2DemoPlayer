(function attachHudSlotLayoutUtils(globalScope) {
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getHudTeamSlotHeight(bodyHeight) {
    return clamp(Number(bodyHeight || 0) * 0.15, 36, 48);
  }

  function getHudTeamSlotContentMetrics(slotRect, unitScale) {
    const safeUnitScale = Math.max(Number(unitScale) || 0, 0.5);
    const topPadding = Math.max(4, 4 * safeUnitScale);
    const nameRowHeight = Math.max(10, 9 * safeUnitScale);
    const barHeight = Math.max(11, 10 * safeUnitScale);
    const iconGap = Math.max(3, 3 * safeUnitScale);
    const primaryIconSize = Math.max(17, 16 * safeUnitScale);
    const utilityIconSize = Math.max(11, 10 * safeUnitScale);
    const utilityGap = Math.max(2, 2 * safeUnitScale);
    const topY = slotRect.y + topPadding;
    const barY = topY + nameRowHeight;
    const iconRowY = Math.min(
      slotRect.y + slotRect.height - Math.max(15, 15 * safeUnitScale),
      barY + barHeight + iconGap,
    );

    return {
      topY,
      barY,
      barHeight,
      iconRowY,
      primaryIconSize,
      utilityIconSize,
      utilityGap,
    };
  }

  const exportsObject = {
    getHudTeamSlotHeight,
    getHudTeamSlotContentMetrics,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.getHudTeamSlotHeight = getHudTeamSlotHeight;
    globalScope.getHudTeamSlotContentMetrics = getHudTeamSlotContentMetrics;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
