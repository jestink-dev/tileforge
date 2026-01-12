/**
 * SQLite3 database layer for tile storage
 * Inspired by GMapCatcher's tilesRepoSQLite3.py
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { createLogger } from '../utils/logger.js';
import { defaults } from '../config/defaults.js';

export class TileDatabase {
  /**
   * Create a new TileDatabase instance
   * @param {object} options - Configuration options
   * @param {string} options.dbPath - Path to SQLite database file
   * @param {number} options.cacheSize - Maximum number of tiles to cache in memory
   * @param {string} options.logLevel - Log level ('error' | 'warn' | 'info' | 'debug')
   */
  constructor(options = {}) {
    const config = {
      dbPath: options.dbPath || defaults.dbPath,
      cacheSize: options.cacheSize || defaults.cacheSize,
      logLevel: options.logLevel || defaults.logLevel
    };

    this.dbPath = config.dbPath;
    this.db = null;
    this.cache = new Map(); // In-memory LRU cache
    this.maxCacheSize = config.cacheSize;
    this.logger = createLogger(config.logLevel);

    this.init();
  }

  /**
   * Initialize database and create tables if needed
   */
  init() {
    // Ensure data directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open database
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency

    // Create tiles table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tiles (
        z INTEGER NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        source TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        data BLOB NOT NULL,
        PRIMARY KEY (z, x, y, source)
      )
    `);

    // Create index for faster lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tiles_lookup
      ON tiles(source, z, x, y)
    `);

    // Create download jobs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS download_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        bounds TEXT NOT NULL,
        minZoom INTEGER NOT NULL,
        maxZoom INTEGER NOT NULL,
        totalTiles INTEGER NOT NULL,
        downloadedTiles INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        country TEXT DEFAULT NULL,
        city TEXT DEFAULT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `);

    this.logger.info('Database initialized:', this.dbPath);

    // Prepare statements for better performance
    this.prepareStatements();
  }

  /**
   * Prepare SQL statements
   */
  prepareStatements() {
    this.statements = {
      getTile: this.db.prepare('SELECT data FROM tiles WHERE z = ? AND x = ? AND y = ? AND source = ?'),
      hasTile: this.db.prepare('SELECT 1 FROM tiles WHERE z = ? AND x = ? AND y = ? AND source = ? LIMIT 1'),
      insertTile: this.db.prepare(`
        INSERT OR REPLACE INTO tiles (z, x, y, source, timestamp, data)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      deleteTile: this.db.prepare('DELETE FROM tiles WHERE z = ? AND x = ? AND y = ? AND source = ?'),
      deleteTilesByJob: this.db.prepare(`
        DELETE FROM tiles
        WHERE source = ?
        AND z >= ? AND z <= ?
        AND x >= ? AND x <= ?
        AND y >= ? AND y <= ?
      `),
      getTileCount: this.db.prepare('SELECT COUNT(*) as count FROM tiles WHERE source = ?'),
      getAllTileCount: this.db.prepare('SELECT COUNT(*) as count FROM tiles'),
      getSourceStats: this.db.prepare(`
        SELECT
          source,
          COUNT(*) as tileCount,
          SUM(LENGTH(data)) as totalSize,
          MIN(timestamp) as oldestTile,
          MAX(timestamp) as newestTile
        FROM tiles
        GROUP BY source
      `),

      // Download job statements
      createJob: this.db.prepare(`
        INSERT INTO download_jobs (id, name, source, bounds, minZoom, maxZoom, totalTiles, country, city, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      updateJobProgress: this.db.prepare(`
        UPDATE download_jobs
        SET downloadedTiles = ?, updatedAt = ?
        WHERE id = ?
      `),
      updateJobStatus: this.db.prepare(`
        UPDATE download_jobs
        SET status = ?, updatedAt = ?
        WHERE id = ?
      `),
      getJob: this.db.prepare('SELECT * FROM download_jobs WHERE id = ?'),
      getAllJobs: this.db.prepare('SELECT * FROM download_jobs ORDER BY createdAt DESC')
    };
  }

  /**
   * Get cache key for a tile
   */
  getCacheKey(z, x, y, source) {
    return `${source}/${z}/${x}/${y}`;
  }

  /**
   * Manage LRU cache - remove oldest if cache is full
   */
  manageCacheSize() {
    if (this.cache.size >= this.maxCacheSize) {
      // Remove first (oldest) item
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  /**
   * Get tile data from database
   * @param {number} z - Zoom level
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @param {string} source - Tile source
   * @returns {Buffer|null} Tile image data or null if not found
   */
  getTile(z, x, y, source) {
    const cacheKey = this.getCacheKey(z, x, y, source);

    // Check cache first
    if (this.cache.has(cacheKey)) {
      const data = this.cache.get(cacheKey);
      // Move to end (most recently used)
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, data);
      return data;
    }

    // Query database
    const row = this.statements.getTile.get(z, x, y, source);
    if (row && row.data) {
      // Add to cache
      this.manageCacheSize();
      this.cache.set(cacheKey, row.data);
      return row.data;
    }

    return null;
  }

  /**
   * Check if tile exists in database
   * @param {number} z
   * @param {number} x
   * @param {number} y
   * @param {string} source
   * @returns {boolean}
   */
  hasTile(z, x, y, source) {
    const cacheKey = this.getCacheKey(z, x, y, source);
    if (this.cache.has(cacheKey)) {
      return true;
    }

    const row = this.statements.hasTile.get(z, x, y, source);
    return !!row;
  }

  /**
   * Save tile to database
   * @param {number} z
   * @param {number} x
   * @param {number} y
   * @param {string} source
   * @param {Buffer} data - Tile image data
   */
  saveTile(z, x, y, source, data) {
    const timestamp = Date.now();
    this.statements.insertTile.run(z, x, y, source, timestamp, data);

    // Update cache
    const cacheKey = this.getCacheKey(z, x, y, source);
    this.manageCacheSize();
    this.cache.set(cacheKey, data);
  }

  /**
   * Delete tile from database
   * @param {number} z
   * @param {number} x
   * @param {number} y
   * @param {string} source
   */
  deleteTile(z, x, y, source) {
    this.statements.deleteTile.run(z, x, y, source);

    // Remove from cache
    const cacheKey = this.getCacheKey(z, x, y, source);
    this.cache.delete(cacheKey);
  }

  /**
   * Delete all tiles for a job based on bounds and zoom range
   * @param {string} source
   * @param {object} bounds - {north, south, east, west}
   * @param {number} minZoom
   * @param {number} maxZoom
   * @returns {number} Number of tiles deleted
   */
  deleteTilesForJob(source, bounds, minZoom, maxZoom) {
    // Import tile calculator to get tile bounds
    const { getTileBounds } = require('./TileCalculator.js');

    let totalDeleted = 0;
    for (let z = minZoom; z <= maxZoom; z++) {
      const tileBounds = getTileBounds(bounds, z);
      const result = this.statements.deleteTilesByJob.run(
        source,
        z, z,
        tileBounds.minX, tileBounds.maxX,
        tileBounds.minY, tileBounds.maxY
      );
      totalDeleted += result.changes;
    }

    // Clear cache for this source
    for (const key of this.cache.keys()) {
      if (key.startsWith(source + '/')) {
        this.cache.delete(key);
      }
    }

    return totalDeleted;
  }

  /**
   * Get statistics for all sources
   * @returns {Array}
   */
  getStats() {
    return this.statements.getSourceStats.all();
  }

  /**
   * Get tile count for a source
   * @param {string} source
   * @returns {number}
   */
  getTileCount(source) {
    const row = this.statements.getTileCount.get(source);
    return row?.count || 0;
  }

  /**
   * Get total tile count across all sources
   * @returns {number}
   */
  getTotalTileCount() {
    const row = this.statements.getAllTileCount.get();
    return row?.count || 0;
  }

  /**
   * Create download job
   */
  createDownloadJob(id, name, source, bounds, minZoom, maxZoom, totalTiles, country = null, city = null) {
    const now = Date.now();
    this.statements.createJob.run(
      id,
      name,
      source,
      JSON.stringify(bounds),
      minZoom,
      maxZoom,
      totalTiles,
      country,
      city,
      now,
      now
    );
  }

  /**
   * Update download job progress
   */
  updateJobProgress(id, downloadedTiles) {
    this.statements.updateJobProgress.run(downloadedTiles, Date.now(), id);
  }

  /**
   * Update download job status
   */
  updateJobStatus(id, status) {
    this.statements.updateJobStatus.run(status, Date.now(), id);
  }

  /**
   * Get download job
   */
  getJob(id) {
    const job = this.statements.getJob.get(id);
    if (job) {
      job.bounds = JSON.parse(job.bounds);
    }
    return job;
  }

  /**
   * Get all download jobs
   */
  getAllJobs() {
    const jobs = this.statements.getAllJobs.all();
    return jobs.map(job => ({
      ...job,
      bounds: JSON.parse(job.bounds)
    }));
  }

  /**
   * Delete download job
   */
  deleteJob(id) {
    const stmt = this.db.prepare('DELETE FROM download_jobs WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Rename download job
   */
  renameJob(id, newName) {
    const stmt = this.db.prepare('UPDATE download_jobs SET name = ?, updatedAt = ? WHERE id = ?');
    stmt.run(newName, Date.now(), id);
  }

  /**
   * Update location (country and city) for a download job
   */
  updateJobLocation(id, country, city) {
    const stmt = this.db.prepare('UPDATE download_jobs SET country = ?, city = ?, updatedAt = ? WHERE id = ?');
    stmt.run(country, city, Date.now(), id);
  }

  /**
   * Update zoom levels and total tiles for a download job
   */
  updateJobZoomLevels(id, minZoom, maxZoom, totalTiles) {
    const stmt = this.db.prepare('UPDATE download_jobs SET minZoom = ?, maxZoom = ?, totalTiles = ?, updatedAt = ? WHERE id = ?');
    stmt.run(minZoom, maxZoom, totalTiles, Date.now(), id);
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.logger.info('Database closed');
    }
  }
}
