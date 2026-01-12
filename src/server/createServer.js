/**
 * Standalone Server Factory
 * Creates a complete Express server with TileForge endpoints
 */

import express from 'express';
import cors from 'cors';
import { TileForge } from '../TileForge.js';
import { createRouter } from './createRouter.js';
import { createLogger } from '../utils/logger.js';
import { defaults } from '../config/defaults.js';

/**
 * Create a standalone TileForge server
 *
 * @param {object} options - Configuration options
 * @param {number} options.port - Server port (default: 3000)
 * @param {string} options.dbPath - Path to SQLite database file
 * @param {number} options.maxConcurrentDownloads - Maximum concurrent downloads
 * @param {number} options.cacheSize - In-memory tile cache size
 * @param {number} options.rateLimit - Minimum ms between requests
 * @param {string} options.logLevel - Log level
 * @param {TileForge} options.tileforge - Existing TileForge instance (optional)
 * @returns {{start: Function, stop: Function, app: Express, tileforge: TileForge}}
 *
 * @example
 * import { createServer } from 'tileforge/server';
 *
 * const server = createServer({
 *   port: 3000,
 *   dbPath: './tiles.db'
 * });
 *
 * await server.start();
 * console.log('Server running on port 3000');
 *
 * // Later...
 * await server.stop();
 */
export function createServer(options = {}) {
  const config = {
    port: options.port || defaults.port,
    dbPath: options.dbPath || defaults.dbPath,
    maxConcurrentDownloads: options.maxConcurrentDownloads || defaults.maxConcurrentDownloads,
    cacheSize: options.cacheSize || defaults.cacheSize,
    rateLimit: options.rateLimit || defaults.rateLimit,
    logLevel: options.logLevel || defaults.logLevel
  };

  const logger = createLogger(config.logLevel);

  // Create TileForge instance
  const tileforge = options.tileforge || new TileForge({
    dbPath: config.dbPath,
    maxConcurrentDownloads: config.maxConcurrentDownloads,
    cacheSize: config.cacheSize,
    rateLimit: config.rateLimit,
    logLevel: config.logLevel
  });

  // Create Express app
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // Mount TileForge router
  const router = createRouter({ tileforge });
  app.use('/', router);

  // Error handling
  app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  let server = null;

  return {
    app,
    tileforge,

    /**
     * Start the server
     * @returns {Promise<void>}
     */
    start() {
      return new Promise((resolve) => {
        server = app.listen(config.port, () => {
          logger.info(`TileForge server running on port ${config.port}`);
          logger.info(`Database: ${config.dbPath}`);
          logger.info(`Max concurrent downloads: ${config.maxConcurrentDownloads}`);
          logger.info('');
          logger.info('Available endpoints:');
          logger.info(`  GET  http://localhost:${config.port}/`);
          logger.info(`  GET  http://localhost:${config.port}/health`);
          logger.info(`  GET  http://localhost:${config.port}/api/sources`);
          logger.info(`  GET  http://localhost:${config.port}/tiles/:source/:z/:x/:y.png`);
          logger.info(`  POST http://localhost:${config.port}/api/download`);
          logger.info('');
          resolve();
        });

        // Graceful shutdown handlers
        process.on('SIGINT', () => this.stop());
        process.on('SIGTERM', () => this.stop());
      });
    },

    /**
     * Stop the server
     * @returns {Promise<void>}
     */
    stop() {
      return new Promise((resolve) => {
        logger.info('Shutting down gracefully...');

        if (server) {
          server.close(() => {
            tileforge.close();
            logger.info('Server closed');
            resolve();
          });
        } else {
          tileforge.close();
          resolve();
        }
      });
    }
  };
}
