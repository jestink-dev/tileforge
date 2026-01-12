/**
 * Tile serving routes
 * GET /tiles/:source/:z/:x/:y.png - Retrieve cached tile
 * GET /tiles/:source/count - Get tile count for source
 */

import { Router } from 'express';
import { isValidTile } from '../../core/TileCalculator.js';
import { isValidSource } from '../../config/sources.js';

/**
 * Create tiles router
 * @param {TileForge} tileforge - TileForge instance
 * @returns {Router}
 */
export function createTilesRouter(tileforge) {
  const router = Router();

  /**
   * GET /tiles/:source/:z/:x/:y.png
   * Retrieve a cached tile
   */
  router.get('/:source/:z/:x/:y.png', (req, res) => {
    const { source } = req.params;
    const z = parseInt(req.params.z, 10);
    const x = parseInt(req.params.x, 10);
    const y = parseInt(req.params.y, 10);

    // Validate source
    if (!isValidSource(source)) {
      return res.status(400).json({
        error: 'Invalid source',
        message: `Unknown tile source: ${source}`
      });
    }

    // Validate coordinates
    if (!isValidTile(x, y, z)) {
      return res.status(400).json({
        error: 'Invalid coordinates',
        message: 'Tile coordinates out of range'
      });
    }

    // Get tile from cache
    const tileData = tileforge.getTile(source, z, x, y);

    if (!tileData) {
      return res.status(404).json({
        error: 'Tile not found',
        message: `Tile ${source}/${z}/${x}/${y} not in cache`
      });
    }

    // Set headers and return tile
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400', // 24 hours
      'Access-Control-Allow-Origin': '*'
    });

    res.send(tileData);
  });

  /**
   * GET /tiles/:source/count
   * Get tile count for a source
   */
  router.get('/:source/count', (req, res) => {
    const { source } = req.params;

    // Validate source
    if (!isValidSource(source)) {
      return res.status(400).json({
        error: 'Invalid source',
        message: `Unknown tile source: ${source}`
      });
    }

    const count = tileforge.getTileCount(source);

    res.json({
      source,
      count
    });
  });

  return router;
}
