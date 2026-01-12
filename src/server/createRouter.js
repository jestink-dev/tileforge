/**
 * Express Router Factory
 * Creates a router that can be mounted on an existing Express app
 */

import { Router } from 'express';
import { TileForge } from '../TileForge.js';
import { createTilesRouter } from './routes/tiles.js';
import { createDownloadRouter } from './routes/download.js';
import { createSourcesRouter } from './routes/sources.js';

/**
 * Create an Express router with all TileForge endpoints
 *
 * @param {object} options - Configuration options
 * @param {string} options.dbPath - Path to SQLite database file
 * @param {number} options.maxConcurrentDownloads - Maximum concurrent downloads
 * @param {number} options.cacheSize - In-memory tile cache size
 * @param {number} options.rateLimit - Minimum ms between requests
 * @param {string} options.logLevel - Log level
 * @param {TileForge} options.tileforge - Existing TileForge instance (optional)
 * @returns {Router} Express router
 *
 * @example
 * // Basic usage
 * import express from 'express';
 * import { createRouter } from 'tileforge/router';
 *
 * const app = express();
 * app.use('/map', createRouter({ dbPath: './tiles.db' }));
 * app.listen(3000);
 *
 * @example
 * // With existing TileForge instance
 * import { TileForge, createRouter } from 'tileforge';
 *
 * const tf = new TileForge({ dbPath: './tiles.db' });
 * app.use('/map', createRouter({ tileforge: tf }));
 */
export function createRouter(options = {}) {
  const router = Router();

  // Use existing TileForge instance or create new one
  const tileforge = options.tileforge || new TileForge({
    dbPath: options.dbPath,
    maxConcurrentDownloads: options.maxConcurrentDownloads,
    cacheSize: options.cacheSize,
    rateLimit: options.rateLimit,
    logLevel: options.logLevel
  });

  // Store TileForge instance on router for cleanup access
  router.tileforge = tileforge;

  // Mount routes
  router.use('/tiles', createTilesRouter(tileforge));
  router.use('/api/download', createDownloadRouter(tileforge));
  router.use('/api/sources', createSourcesRouter(tileforge));

  // Health check
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now()
    });
  });

  // Root info
  router.get('/', (req, res) => {
    res.json({
      name: 'TileForge',
      version: '1.0.0',
      description: 'Offline map tile server',
      endpoints: {
        tiles: 'GET /tiles/:source/:z/:x/:y.png',
        tileCount: 'GET /tiles/:source/count',
        sources: 'GET /api/sources',
        sourceDetails: 'GET /api/sources/:sourceId',
        download: 'POST /api/download',
        downloadStatus: 'GET /api/download/:jobId',
        downloadList: 'GET /api/download',
        estimate: 'POST /api/download/estimate',
        health: 'GET /health'
      }
    });
  });

  return router;
}
