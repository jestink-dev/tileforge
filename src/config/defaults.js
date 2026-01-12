/**
 * Default configuration values for TileForge
 */

export const defaults = {
  // Server configuration
  port: 3000,

  // Database configuration
  dbPath: './data/tiles.db',

  // Download configuration
  maxConcurrentDownloads: 4,
  rateLimit: 500, // milliseconds between requests

  // Cache configuration
  cacheSize: 1000, // number of tiles to keep in memory

  // Logging
  logLevel: 'info', // 'error' | 'warn' | 'info' | 'debug'

  // Tile estimation constants
  averageTileSizeKB: 15, // average tile size in KB
  downloadTimePerTile: 0.5 // seconds per tile at default concurrency
};
