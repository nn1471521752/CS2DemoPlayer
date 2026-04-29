function requireFunction(deps, name) {
  if (typeof deps?.[name] !== 'function') {
    throw new Error(`${name} is required`);
  }
  return deps[name];
}

function createPlaybookService(deps = {}) {
  const syncPlaybookMapsFromStaticMeta = requireFunction(deps, 'syncPlaybookMapsFromStaticMeta');
  const getPlaybookSummary = requireFunction(deps, 'getPlaybookSummary');
  const listPlaybookMaps = requireFunction(deps, 'listPlaybookMaps');
  const listPlaybookGrenades = requireFunction(deps, 'listPlaybookGrenades');
  const importPlaybookGrenades = requireFunction(deps, 'importPlaybookGrenades');
  const updatePlaybookGrenade = requireFunction(deps, 'updatePlaybookGrenade');
  const scanPlaybookMarkdown = typeof deps.scanPlaybookMarkdown === 'function'
    ? deps.scanPlaybookMarkdown
    : null;
  const writePlaybookGrenadeDrafts = typeof deps.writePlaybookGrenadeDrafts === 'function'
    ? deps.writePlaybookGrenadeDrafts
    : null;
  const updatePlaybookGrenadeMarkdown = typeof deps.updatePlaybookGrenadeMarkdown === 'function'
    ? deps.updatePlaybookGrenadeMarkdown
    : null;

  async function syncPlaybookMarkdownIndex() {
    if (!scanPlaybookMarkdown) {
      return {
        grenades: [],
        errors: [],
      };
    }

    const scanResult = await scanPlaybookMarkdown();
    const grenades = Array.isArray(scanResult?.grenades) ? scanResult.grenades : [];
    if (grenades.length > 0) {
      await importPlaybookGrenades(grenades);
    }
    return {
      ...scanResult,
      grenades,
      errors: Array.isArray(scanResult?.errors) ? scanResult.errors : [],
    };
  }

  return {
    async getPlaybookState() {
      await syncPlaybookMapsFromStaticMeta();
      await syncPlaybookMarkdownIndex();
      const [summary, maps, grenades] = await Promise.all([
        getPlaybookSummary(),
        listPlaybookMaps(),
        listPlaybookGrenades(),
      ]);

      return {
        status: 'success',
        summary,
        maps: Array.isArray(maps) ? maps : [],
        grenades: Array.isArray(grenades) ? grenades : [],
        tactics: [],
        setups: [],
      };
    },

    async importSelectedGrenades(payload = {}) {
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
      await syncPlaybookMapsFromStaticMeta();
      const markdownResult = writePlaybookGrenadeDrafts
        ? await writePlaybookGrenadeDrafts(candidates)
        : null;
      const indexEntries = markdownResult
        ? (Array.isArray(markdownResult.grenades) ? markdownResult.grenades : [])
        : candidates;
      const result = await importPlaybookGrenades(indexEntries);
      return {
        status: 'success',
        insertedGrenades: Number(result?.insertedGrenades) || 0,
        existingGrenades: Number(result?.existingGrenades) || 0,
        skippedGrenades: (Number(result?.skippedGrenades) || 0) + (Number(markdownResult?.skippedGrenades) || 0),
        grenades: Array.isArray(result?.grenades) ? result.grenades : [],
        ...(markdownResult ? {
          markdown: {
            createdGrenades: Number(markdownResult.createdGrenades) || 0,
            existingGrenades: Number(markdownResult.existingGrenades) || 0,
            skippedGrenades: Number(markdownResult.skippedGrenades) || 0,
            errors: Array.isArray(markdownResult.errors) ? markdownResult.errors : [],
          },
        } : {}),
      };
    },

    async updateGrenade(payload = {}) {
      const markdownUpdate = updatePlaybookGrenadeMarkdown
        ? await updatePlaybookGrenadeMarkdown(payload)
        : null;
      if (markdownUpdate?.status === 'conflict' || markdownUpdate?.status === 'error') {
        return {
          status: 'error',
          message: markdownUpdate.message || '更新 Playbook Markdown 失败。',
        };
      }

      const grenade = markdownUpdate || await updatePlaybookGrenade(payload);
      if (!grenade) {
        return {
          status: 'error',
          message: 'Grenade not found.',
        };
      }

      return {
        status: 'success',
        grenade,
      };
    },
  };
}

module.exports = {
  createPlaybookService,
};
