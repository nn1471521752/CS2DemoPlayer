(function attachHltvResultsGroupingUtils(globalScope) {
  const MONTH_LABELS = Object.freeze([
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]);

  function normalizeTimestampValue(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return numericValue;
    }

    const dateValue = new Date(value);
    return Number.isNaN(dateValue.getTime()) ? null : dateValue.getTime();
  }

  function getOrdinalSuffix(dayOfMonth) {
    const remainder10 = dayOfMonth % 10;
    const remainder100 = dayOfMonth % 100;
    if (remainder10 === 1 && remainder100 !== 11) {
      return 'st';
    }
    if (remainder10 === 2 && remainder100 !== 12) {
      return 'nd';
    }
    if (remainder10 === 3 && remainder100 !== 13) {
      return 'rd';
    }
    return 'th';
  }

  function buildHltvDateGroupLabel(value) {
    const timestampMs = normalizeTimestampValue(value);
    if (timestampMs === null) {
      return 'Unknown date';
    }

    const date = new Date(timestampMs);
    const monthLabel = MONTH_LABELS[date.getUTCMonth()] || 'Unknown';
    const dayOfMonth = date.getUTCDate();
    return `${monthLabel} ${dayOfMonth}${getOrdinalSuffix(dayOfMonth)} ${date.getUTCFullYear()}`;
  }

  function groupMatchesByDateLabel(matches = []) {
    const groups = [];
    const groupMap = new Map();

    (Array.isArray(matches) ? matches : []).forEach((match) => {
      const label = buildHltvDateGroupLabel(match?.matchTimestampMs || match?.matchTimeLabel || match?.updatedAt);
      let group = groupMap.get(label);
      if (!group) {
        group = { label, matches: [] };
        groupMap.set(label, group);
        groups.push(group);
      }
      group.matches.push(match);
    });

    groups.forEach((group) => {
      group.matches.sort((left, right) => (Number(right?.matchTimestampMs) || 0) - (Number(left?.matchTimestampMs) || 0));
    });

    return groups;
  }

  const exportsObject = {
    buildHltvDateGroupLabel,
    groupMatchesByDateLabel,
    normalizeTimestampValue,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.buildHltvDateGroupLabel = buildHltvDateGroupLabel;
    globalScope.groupMatchesByDateLabel = groupMatchesByDateLabel;
    globalScope.normalizeTimestampValue = normalizeTimestampValue;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));
