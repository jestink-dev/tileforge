/**
 * Tile downloader service with concurrent download queue
 * Inspired by GMapCatcher's MapDownloader class
 */

import axios from 'axios';
import { getTileUrl } from '../config/sources.js';
import { createLogger } from '../utils/logger.js';
import { defaults } from '../config/defaults.js';

export class TileDownloader {
  /**
   * Create a new TileDownloader instance
   * @param {TileDatabase} database - TileDatabase instance
   * @param {object} options - Configuration options
   * @param {number} options.maxConcurrentDownloads - Maximum concurrent downloads
   * @param {number} options.rateLimit - Minimum ms between requests
   * @param {string} options.logLevel - Log level
   */
  constructor(database, options = {}) {
    const config = {
      maxConcurrentDownloads: options.maxConcurrentDownloads || defaults.maxConcurrentDownloads,
      rateLimit: options.rateLimit || defaults.rateLimit,
      logLevel: options.logLevel || defaults.logLevel
    };

    this.db = database;
    this.maxConcurrent = config.maxConcurrentDownloads;
    this.minRequestInterval = config.rateLimit;
    this.logger = createLogger(config.logLevel);

    this.queue = [];
    this.activeDownloads = 0;
    this.counter = 0; // For subdomain rotation
    this.activeJobs = new Map(); // jobId -> job data
    this.downloadStats = new Map(); // jobId -> stats

    // Rate limiting
    this.lastRequestTime = 0;
  }

  /**
   * Start a download job
   * @param {string} jobId
   * @param {string} source
   * @param {Array} tiles - Array of {x, y, z}
   * @returns {Promise<void>}
   */
  async startJob(jobId, source, tiles) {
    this.logger.info(`Starting download job ${jobId} for ${tiles.length} tiles from ${source}`);

    this.activeJobs.set(jobId, {
      id: jobId,
      source,
      tiles,
      totalTiles: tiles.length,
      downloadedTiles: 0,
      failedTiles: 0,
      status: 'running'
    });

    this.downloadStats.set(jobId, {
      startTime: Date.now(),
      downloadedCount: 0,
      failedCount: 0,
      skippedCount: 0
    });

    // Update job status in database
    this.db.updateJobStatus(jobId, 'running');

    // Queue all tiles for download
    for (const tile of tiles) {
      this.queueTile(jobId, source, tile.z, tile.x, tile.y);
    }

    this.processQueue();
  }

  /**
   * Queue a tile for download
   */
  queueTile(jobId, source, z, x, y) {
    // Check if tile already exists
    if (this.db.hasTile(z, x, y, source)) {
      this.logger.debug(`Tile ${source}/${z}/${x}/${y} already exists, skipping`);
      this.handleTileSkipped(jobId);
      return;
    }

    this.queue.push({ jobId, source, z, x, y });
  }

  /**
   * Process download queue
   */
  async processQueue() {
    while (this.activeDownloads < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();
      this.activeDownloads++;

      this.downloadTile(task)
        .then(() => {
          this.activeDownloads--;
          this.processQueue(); // Continue processing
        })
        .catch(error => {
          this.logger.error('Download task error:', error);
          this.activeDownloads--;
          this.processQueue();
        });
    }

    // Check if job is complete
    for (const [jobId, job] of this.activeJobs) {
      const stats = this.downloadStats.get(jobId);
      const total = stats.downloadedCount + stats.failedCount + stats.skippedCount;

      if (total >= job.totalTiles && this.activeDownloads === 0) {
        this.completeJob(jobId);
      }
    }
  }

  /**
   * Download a single tile
   */
  async downloadTile(task) {
    const { jobId, source, z, x, y } = task;

    try {
      // Rate limiting
      await this.rateLimit();

      const url = getTileUrl(source, z, x, y, this.counter++);
      this.logger.debug(`Downloading tile: ${url}`);

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'TileForge/1.0 (Offline Map Tile Caching)'
        }
      });

      if (response.status === 200 && response.data) {
        // Save tile to database
        const buffer = Buffer.from(response.data);
        this.db.saveTile(z, x, y, source, buffer);

        this.handleTileDownloaded(jobId);
        this.logger.debug(`Downloaded: ${source}/${z}/${x}/${y}`);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      this.logger.error(`Failed to download ${source}/${z}/${x}/${y}:`, error.message);
      this.handleTileFailed(jobId);
    }
  }

  /**
   * Rate limiting - wait if needed
   */
  async rateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const delay = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Handle successful tile download
   */
  handleTileDownloaded(jobId) {
    const job = this.activeJobs.get(jobId);
    const stats = this.downloadStats.get(jobId);

    if (job && stats) {
      job.downloadedTiles++;
      stats.downloadedCount++;

      // Update progress in database every 10 tiles
      if (stats.downloadedCount % 10 === 0) {
        this.db.updateJobProgress(jobId, stats.downloadedCount);
      }
    }
  }

  /**
   * Handle failed tile download
   */
  handleTileFailed(jobId) {
    const job = this.activeJobs.get(jobId);
    const stats = this.downloadStats.get(jobId);

    if (job && stats) {
      job.failedTiles++;
      stats.failedCount++;
    }
  }

  /**
   * Handle skipped tile (already exists)
   */
  handleTileSkipped(jobId) {
    const stats = this.downloadStats.get(jobId);
    if (stats) {
      stats.skippedCount++;
    }
  }

  /**
   * Complete a download job
   */
  completeJob(jobId) {
    const job = this.activeJobs.get(jobId);
    const stats = this.downloadStats.get(jobId);

    if (!job || !stats) return;

    const duration = (Date.now() - stats.startTime) / 1000;
    this.logger.info(`Job ${jobId} completed in ${duration.toFixed(1)}s`);
    this.logger.info(`  Downloaded: ${stats.downloadedCount}`);
    this.logger.info(`  Skipped: ${stats.skippedCount}`);
    this.logger.info(`  Failed: ${stats.failedCount}`);

    // Update final progress
    this.db.updateJobProgress(jobId, stats.downloadedCount);
    this.db.updateJobStatus(jobId, stats.failedCount > 0 ? 'completed_with_errors' : 'completed');

    // Clean up
    this.activeJobs.delete(jobId);
    this.downloadStats.delete(jobId);
  }

  /**
   * Cancel a download job
   */
  cancelJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      return false;
    }

    // Remove queued tiles for this job
    this.queue = this.queue.filter(task => task.jobId !== jobId);

    // Update status
    this.db.updateJobStatus(jobId, 'cancelled');

    // Clean up
    this.activeJobs.delete(jobId);
    this.downloadStats.delete(jobId);

    this.logger.info(`Job ${jobId} cancelled`);
    return true;
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    const job = this.activeJobs.get(jobId);
    const stats = this.downloadStats.get(jobId);

    if (!job || !stats) {
      return null;
    }

    const total = stats.downloadedCount + stats.failedCount + stats.skippedCount;
    const progress = job.totalTiles > 0 ? (total / job.totalTiles) * 100 : 0;

    return {
      jobId,
      source: job.source,
      totalTiles: job.totalTiles,
      downloadedTiles: stats.downloadedCount,
      skippedTiles: stats.skippedCount,
      failedTiles: stats.failedCount,
      progress: Math.round(progress),
      status: job.status,
      queuedTiles: this.queue.filter(t => t.jobId === jobId).length
    };
  }

  /**
   * Get all active jobs
   */
  getActiveJobs() {
    const jobs = [];
    for (const jobId of this.activeJobs.keys()) {
      jobs.push(this.getJobStatus(jobId));
    }
    return jobs;
  }

  /**
   * Check if a job is active
   */
  isJobActive(jobId) {
    return this.activeJobs.has(jobId);
  }
}
