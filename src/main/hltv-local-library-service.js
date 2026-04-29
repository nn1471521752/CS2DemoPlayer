const {
  normalizeLocalLibraryFilters,
} = require('./hltv-cache-utils');

function requireFunction(deps, name) {
  if (typeof deps?.[name] !== 'function') {
    throw new Error(`${name} is required`);
  }
  return deps[name];
}

function createHltvLocalLibraryService(deps = {}) {
  const getHltvCacheSummary = requireFunction(deps, 'getHltvCacheSummary');
  const searchHltvCachedMatches = requireFunction(deps, 'searchHltvCachedMatches');
  const searchHltvCachedTeams = requireFunction(deps, 'searchHltvCachedTeams');
  const searchHltvCachedPlayers = requireFunction(deps, 'searchHltvCachedPlayers');
  const clearHltvCache = requireFunction(deps, 'clearHltvCache');
  const markHltvMatchAddedToGameLibrary = requireFunction(deps, 'markHltvMatchAddedToGameLibrary');

  return {
    async getLibraryState(filters = {}) {
      const normalizedFilters = normalizeLocalLibraryFilters({
        ...filters,
        tab: 'matches',
      });

      const [summary, matches, teams, players] = await Promise.all([
        getHltvCacheSummary(),
        searchHltvCachedMatches(normalizedFilters),
        searchHltvCachedTeams(normalizeLocalLibraryFilters({
          ...filters,
          tab: 'teams',
        })),
        searchHltvCachedPlayers(normalizeLocalLibraryFilters({
          ...filters,
          tab: 'players',
        })),
      ]);

      return {
        status: 'success',
        summary,
        matches,
        teams,
        players,
      };
    },

    async searchMatches(filters = {}) {
      return searchHltvCachedMatches(normalizeLocalLibraryFilters({
        ...filters,
        tab: 'matches',
      }));
    },

    async searchTeams(filters = {}) {
      return searchHltvCachedTeams(normalizeLocalLibraryFilters({
        ...filters,
        tab: 'teams',
      }));
    },

    async searchPlayers(filters = {}) {
      return searchHltvCachedPlayers(normalizeLocalLibraryFilters({
        ...filters,
        tab: 'players',
      }));
    },

    async addMatchToGameLibrary(payload = {}) {
      return markHltvMatchAddedToGameLibrary({
        matchId: String(payload.matchId || '').trim(),
        addedAt: String(payload.addedAt || '').trim(),
      });
    },

    async clearCache() {
      return clearHltvCache();
    },
  };
}

module.exports = {
  createHltvLocalLibraryService,
};
