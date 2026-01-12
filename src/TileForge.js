/**
 * TileForge - Main class for offline map tile management
 * Provides a unified API for downloading, caching, and serving map tiles
 */

import crypto from 'crypto';
import { TileDatabase } from './core/TileDatabase.js';
import { TileDownloader } from './core/TileDownloader.js';
import * as tileCalculator from './core/TileCalculator.js';
import { tileSources, getAvailableSources, isValidSource } from './config/sources.js';
import { defaults } from './config/defaults.js';
import { createLogger } from './utils/logger.js';

export class TileForge {
  /**
   * Create a new TileForge instance
   * @param {object} options - Configuration options
   * @param {string} options.dbPath - Path to SQLite database file (default: './data/tiles.db')
   * @param {number} options.maxConcurrentDownloads - Maximum concurrent downloads (default: 4)
   * @param {number} options.cacheSize - In-memory tile cache size (default: 1000)
   * @param {number} options.rateLimit - Minimum ms between requests (default: 500)
   * @param {string} options.logLevel - Log level: 'error' | 'warn' | 'info' | 'debug' (default: 'info')
   */
  constructor(options = {}) {
    this.config = {
      dbPath: options.dbPath || defaults.dbPath,
      maxConcurrentDownloads: options.maxConcurrentDownloads || defaults.maxConcurrentDownloads,
      cacheSize: options.cacheSize || defaults.cacheSize,
      rateLimit: options.rateLimit || defaults.rateLimit,
      logLevel: options.logLevel || defaults.logLevel
    };

    this.logger = createLogger(this.config.logLevel);

    // Initialize database
    this.database = new TileDatabase({
      dbPath: this.config.dbPath,
      cacheSize: this.config.cacheSize,
      logLevel: this.config.logLevel
    });

    // Initialize downloader
    this.downloader = new TileDownloader(this.database, {
      maxConcurrentDownloads: this.config.maxConcurrentDownloads,
      rateLimit: this.config.rateLimit,
      logLevel: this.config.logLevel
    });

    this.logger.info('TileForge initialized');
  }

  /**
   * Generate a unique job ID
   * @returns {string}
   */
  generateJobId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Download tiles for a geographic region
   * @param {object} options - Download options
   * @param {string} options.name - Name for this download job
   * @param {string} options.source - Tile source ('arcgis' | 'google' | 'esri-world-imagery')
   * @param {object} options.bounds - Geographic bounds {north, south, east, west}
   * @param {number} options.minZoom - Minimum zoom level
   * @param {number} options.maxZoom - Maximum zoom level
   * @returns {Promise<{jobId: string, totalTiles: number, status: string}>}
   */
  async download(options) {
    const { name, source, bounds, minZoom, maxZoom } = options;

    // Validate source
    if (!isValidSource(source)) {
      throw new Error(`Invalid tile source: ${source}. Available: ${getAvailableSources().map(s => s.id).join(', ')}`);
    }

    // Validate bounds
    if (!tileCalculator.isValidBounds(bounds)) {
      throw new Error('Invalid bounds. Must include north, south, east, west coordinates.');
    }

    // Validate zoom range
    if (!tileCalculator.isValidZoomRange(minZoom, maxZoom)) {
      throw new Error('Invalid zoom range. Must be between 0-22 and minZoom <= maxZoom.');
    }

    // Generate tile list
    const tiles = tileCalculator.getTileList(bounds, minZoom, maxZoom);
    const totalTiles = tiles.length;

    // Create job
    const jobId = this.generateJobId();

    // Save job to database
    this.database.createDownloadJob(
      jobId,
      name,
      source,
      bounds,
      minZoom,
      maxZoom,
      totalTiles
    );

    // Start download
    this.downloader.startJob(jobId, source, tiles);

    this.logger.info(`Download job started: ${jobId} (${totalTiles} tiles)`);

    return {
      jobId,
      name,
      source,
      totalTiles,
      status: 'running'
    };
  }

  /**
   * Estimate download size and time
   * @param {object} options - Estimate options
   * @param {object} options.bounds - Geographic bounds {north, south, east, west}
   * @param {number} options.minZoom - Minimum zoom level
   * @param {number} options.maxZoom - Maximum zoom level
   * @returns {{tileCount: number, estimatedSizeMB: number, estimatedTimeMinutes: number}}
   */
  estimate(options) {
    const { bounds, minZoom, maxZoom } = options;

    // Validate bounds
    if (!tileCalculator.isValidBounds(bounds)) {
      throw new Error('Invalid bounds. Must include north, south, east, west coordinates.');
    }

    // Validate zoom range
    if (!tileCalculator.isValidZoomRange(minZoom, maxZoom)) {
      throw new Error('Invalid zoom range. Must be between 0-22 and minZoom <= maxZoom.');
    }

    const tileCount = tileCalculator.calculateTileCount(bounds, minZoom, maxZoom);
    const estimatedSizeMB = (tileCount * defaults.averageTileSizeKB) / 1024;
    const estimatedTimeMinutes = (tileCount * defaults.downloadTimePerTile) / 60;

    return {
      tileCount,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      estimatedTimeMinutes: Math.round(estimatedTimeMinutes * 100) / 100
    };
  }

  /**
   * Extend zoom levels for an existing job
   * @param {string} jobId - Job ID
   * @param {object} options - New zoom options
   * @param {number} options.minZoom - New minimum zoom level
   * @param {number} options.maxZoom - New maximum zoom level
   * @returns {Promise<{jobId: string, totalTiles: number, status: string}>}
   */
  async extendJob(jobId, options) {
    const { minZoom, maxZoom } = options;

    // Get existing job
    const job = this.database.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Validate zoom range
    if (!tileCalculator.isValidZoomRange(minZoom, maxZoom)) {
      throw new Error('Invalid zoom range. Must be between 0-22 and minZoom <= maxZoom.');
    }

    // Generate new tile list
    const tiles = tileCalculator.getTileList(job.bounds, minZoom, maxZoom);
    const totalTiles = tiles.length;

    // Update job in database
    this.database.updateJobZoomLevels(jobId, minZoom, maxZoom, totalTiles);
    this.database.updateJobStatus(jobId, 'running');

    // Start download (will skip existing tiles)
    this.downloader.startJob(jobId, job.source, tiles);

    this.logger.info(`Job ${jobId} extended to zoom ${minZoom}-${maxZoom} (${totalTiles} tiles)`);

    return {
      jobId,
      minZoom,
      maxZoom,
      totalTiles,
      status: 'running'
    };
  }

  /**
   * Get a cached tile
   * @param {string} source - Tile source
   * @param {number} z - Zoom level
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @returns {Buffer|null} Tile image data or null if not found
   */
  getTile(source, z, x, y) {
    // Validate coordinates
    if (!tileCalculator.isValidTile(x, y, z)) {
      return null;
    }

    return this.database.getTile(z, x, y, source);
  }

  /**
   * Check if a tile exists in cache
   * @param {string} source - Tile source
   * @param {number} z - Zoom level
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @returns {boolean}
   */
  hasTile(source, z, x, y) {
    return this.database.hasTile(z, x, y, source);
  }

  /**
   * Get job status (checks both active jobs and database)
   * @param {string} jobId - Job ID
   * @returns {object|null} Job status or null if not found
   */
  getJobStatus(jobId) {
    // Check active jobs first
    const activeStatus = this.downloader.getJobStatus(jobId);
    if (activeStatus) {
      return activeStatus;
    }

    // Check database
    const job = this.database.getJob(jobId);
    if (job) {
      return {
        jobId: job.id,
        name: job.name,
        source: job.source,
        bounds: job.bounds,
        minZoom: job.minZoom,
        maxZoom: job.maxZoom,
        totalTiles: job.totalTiles,
        downloadedTiles: job.downloadedTiles,
        progress: job.totalTiles > 0 ? Math.round((job.downloadedTiles / job.totalTiles) * 100) : 0,
        status: job.status,
        country: job.country,
        city: job.city,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      };
    }

    return null;
  }

  /**
   * Get all jobs
   * @returns {Array} List of all jobs
   */
  getJobs() {
    const dbJobs = this.database.getAllJobs();

    return dbJobs.map(job => {
      // Check if job is active
      const activeStatus = this.downloader.getJobStatus(job.id);

      if (activeStatus) {
        return {
          ...job,
          ...activeStatus
        };
      }

      return {
        jobId: job.id,
        name: job.name,
        source: job.source,
        bounds: job.bounds,
        minZoom: job.minZoom,
        maxZoom: job.maxZoom,
        totalTiles: job.totalTiles,
        downloadedTiles: job.downloadedTiles,
        progress: job.totalTiles > 0 ? Math.round((job.downloadedTiles / job.totalTiles) * 100) : 0,
        status: job.status,
        country: job.country,
        city: job.city,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      };
    });
  }

  /**
   * Cancel a running job
   * @param {string} jobId - Job ID
   * @returns {boolean} True if cancelled, false if not found
   */
  cancelJob(jobId) {
    return this.downloader.cancelJob(jobId);
  }

  /**
   * Delete a job and optionally its tiles
   * @param {string} jobId - Job ID
   * @param {boolean} deleteTiles - Whether to delete associated tiles (default: true)
   * @returns {{deleted: boolean, tilesDeleted: number}}
   */
  deleteJob(jobId, deleteTiles = true) {
    const job = this.database.getJob(jobId);
    if (!job) {
      return { deleted: false, tilesDeleted: 0 };
    }

    // Cancel if running
    this.downloader.cancelJob(jobId);

    let tilesDeleted = 0;
    if (deleteTiles) {
      tilesDeleted = this.database.deleteTilesForJob(
        job.source,
        job.bounds,
        job.minZoom,
        job.maxZoom
      );
    }

    // Delete job record
    this.database.deleteJob(jobId);

    this.logger.info(`Job ${jobId} deleted (${tilesDeleted} tiles removed)`);

    return { deleted: true, tilesDeleted };
  }

  /**
   * Rename a job
   * @param {string} jobId - Job ID
   * @param {string} newName - New name
   * @returns {boolean} True if renamed, false if not found
   */
  renameJob(jobId, newName) {
    const job = this.database.getJob(jobId);
    if (!job) {
      return false;
    }

    this.database.renameJob(jobId, newName);
    return true;
  }

  /**
   * Update job location metadata
   * @param {string} jobId - Job ID
   * @param {string} country - Country name
   * @param {string} city - City name
   * @returns {boolean} True if updated, false if not found
   */
  updateJobLocation(jobId, country, city) {
    const job = this.database.getJob(jobId);
    if (!job) {
      return false;
    }

    this.database.updateJobLocation(jobId, country, city);
    return true;
  }

  /**
   * Get available tile sources
   * @returns {Array<{id: string, name: string, attribution: string, maxZoom: number, minZoom: number}>}
   */
  getSources() {
    return getAvailableSources();
  }

  /**
   * Get source with statistics
   * @param {string} sourceId - Source ID
   * @returns {object|null} Source info with tile count
   */
  getSource(sourceId) {
    if (!isValidSource(sourceId)) {
      return null;
    }

    const source = tileSources[sourceId];
    const tileCount = this.database.getTileCount(sourceId);

    return {
      id: sourceId,
      name: source.name,
      attribution: source.attribution,
      maxZoom: source.maxZoom,
      minZoom: source.minZoom,
      tileCount
    };
  }

  /**
   * Get statistics for all sources
   * @returns {Array}
   */
  getStats() {
    return this.database.getStats();
  }

  /**
   * Get tile count for a source
   * @param {string} source - Source ID
   * @returns {number}
   */
  getTileCount(source) {
    return this.database.getTileCount(source);
  }

  /**
   * Get total tile count across all sources
   * @returns {number}
   */
  getTotalTileCount() {
    return this.database.getTotalTileCount();
  }

  /**
   * Close database connection and cleanup
   */
  close() {
    this.database.close();
    this.logger.info('TileForge closed');
  }
}
