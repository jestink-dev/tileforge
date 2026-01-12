/**
 * Tile source routes
 * GET /api/sources - List all available sources
 * GET /api/sources/:sourceId - Get specific source details
 * GET /api/sources/stats/all - Get statistics for all sources
 */

import { Router } from 'express';
import { isValidSource, getAvailableSources } from '../../config/sources.js';

/**
 * Create sources router
 * @param {TileForge} tileforge - TileForge instance
 * @returns {Router}
 */
export function createSourcesRouter(tileforge) {
  const router = Router();

  /**
   * GET /api/sources
   * List all available tile sources with statistics
   */
  router.get('/', (req, res) => {
    const sources = getAvailableSources();
    const stats = tileforge.getStats();

    // Merge sources with statistics
    const result = sources.map(source => {
      const sourceStat = stats.find(s => s.source === source.id);
      return {
        ...source,
        tileCount: sourceStat?.tileCount || 0,
        totalSizeMB: sourceStat?.totalSize
          ? Math.round((sourceStat.totalSize / 1024 / 1024) * 100) / 100
          : 0
      };
    });

    res.json(result);
  });

  /**
   * GET /api/sources/stats/all
   * Get raw statistics for all sources
   */
  router.get('/stats/all', (req, res) => {
    const stats = tileforge.getStats();

    const result = stats.map(stat => ({
      source: stat.source,
      tileCount: stat.tileCount,
      totalSizeMB: Math.round((stat.totalSize / 1024 / 1024) * 100) / 100,
      oldestTile: stat.oldestTile,
      newestTile: stat.newestTile
    }));

    res.json(result);
  });

  /**
   * GET /api/sources/:sourceId
   * Get specific source details
   */
  router.get('/:sourceId', (req, res) => {
    const { sourceId } = req.params;

    if (!isValidSource(sourceId)) {
      return res.status(404).json({
        error: 'Source not found',
        message: `Unknown source: ${sourceId}. Available: ${getAvailableSources().map(s => s.id).join(', ')}`
      });
    }

    const source = tileforge.getSource(sourceId);
    res.json(source);
  });

  return router;
}
