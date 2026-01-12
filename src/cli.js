#!/usr/bin/env node

/**
 * TileForge CLI
 * Command-line interface for the TileForge tile server
 */

import { program } from 'commander';
import { TileForge } from './TileForge.js';
import { createServer } from './server/createServer.js';
import { getAvailableSources } from './config/sources.js';
import { defaults } from './config/defaults.js';

program
  .name('tileforge')
  .description('Offline map tile server - download, cache, and serve satellite map tiles')
  .version('1.0.0');

// =============================================================================
// serve - Start the HTTP server
// =============================================================================
program
  .command('serve')
  .description('Start the TileForge HTTP server')
  .option('-p, --port <number>', 'Port to listen on', String(defaults.port))
  .option('-d, --db <path>', 'Database file path', defaults.dbPath)
  .option('-c, --concurrent <number>', 'Max concurrent downloads', String(defaults.maxConcurrentDownloads))
  .option('-l, --log-level <level>', 'Log level (error, warn, info, debug)', defaults.logLevel)
  .action(async (options) => {
    const server = createServer({
      port: parseInt(options.port, 10),
      dbPath: options.db,
      maxConcurrentDownloads: parseInt(options.concurrent, 10),
      logLevel: options.logLevel
    });

    await server.start();
  });

// =============================================================================
// download - Download tiles for a region
// =============================================================================
program
  .command('download')
  .description('Download tiles for a geographic region')
  .requiredOption('-n, --name <name>', 'Name for this download job')
  .requiredOption('-s, --source <source>', 'Tile source (arcgis, google, esri-world-imagery)')
  .requiredOption('-b, --bounds <bounds>', 'Geographic bounds as "south,north,west,east"')
  .requiredOption('-z, --zoom <range>', 'Zoom range as "min-max" (e.g., "16-20")')
  .option('-d, --db <path>', 'Database file path', defaults.dbPath)
  .option('-c, --concurrent <number>', 'Max concurrent downloads', String(defaults.maxConcurrentDownloads))
  .option('-l, --log-level <level>', 'Log level', defaults.logLevel)
  .action(async (options) => {
    try {
      // Parse bounds
      const boundsParts = options.bounds.split(',').map(s => parseFloat(s.trim()));
      if (boundsParts.length !== 4 || boundsParts.some(isNaN)) {
        console.error('Error: Invalid bounds format. Use "south,north,west,east"');
        process.exit(1);
      }
      const [south, north, west, east] = boundsParts;
      const bounds = { north, south, east, west };

      // Parse zoom range
      const zoomParts = options.zoom.split('-').map(s => parseInt(s.trim(), 10));
      if (zoomParts.length !== 2 || zoomParts.some(isNaN)) {
        console.error('Error: Invalid zoom format. Use "min-max" (e.g., "16-20")');
        process.exit(1);
      }
      const [minZoom, maxZoom] = zoomParts;

      // Create TileForge instance
      const tf = new TileForge({
        dbPath: options.db,
        maxConcurrentDownloads: parseInt(options.concurrent, 10),
        logLevel: options.logLevel
      });

      console.log(`Starting download: ${options.name}`);
      console.log(`  Source: ${options.source}`);
      console.log(`  Bounds: N=${north}, S=${south}, E=${east}, W=${west}`);
      console.log(`  Zoom: ${minZoom}-${maxZoom}`);
      console.log('');

      // Start download
      const job = await tf.download({
        name: options.name,
        source: options.source,
        bounds,
        minZoom,
        maxZoom
      });

      console.log(`Job started: ${job.jobId}`);
      console.log(`Total tiles: ${job.totalTiles}`);
      console.log('');

      // Monitor progress
      const progressInterval = setInterval(() => {
        const status = tf.getJobStatus(job.jobId);
        if (status) {
          process.stdout.write(`\rProgress: ${status.progress}% (${status.downloadedTiles}/${status.totalTiles} tiles)`);

          if (status.status === 'completed' || status.status === 'completed_with_errors') {
            clearInterval(progressInterval);
            console.log('\n');
            console.log(`Download complete!`);
            console.log(`  Downloaded: ${status.downloadedTiles}`);
            console.log(`  Skipped: ${status.skippedTiles || 0}`);
            console.log(`  Failed: ${status.failedTiles || 0}`);
            tf.close();
            process.exit(0);
          }
        }
      }, 1000);

      // Handle interrupt
      process.on('SIGINT', () => {
        clearInterval(progressInterval);
        console.log('\nCancelling download...');
        tf.cancelJob(job.jobId);
        tf.close();
        process.exit(0);
      });

    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// =============================================================================
// estimate - Estimate download size
// =============================================================================
program
  .command('estimate')
  .description('Estimate download size and time')
  .requiredOption('-b, --bounds <bounds>', 'Geographic bounds as "south,north,west,east"')
  .requiredOption('-z, --zoom <range>', 'Zoom range as "min-max" (e.g., "16-20")')
  .action((options) => {
    try {
      // Parse bounds
      const boundsParts = options.bounds.split(',').map(s => parseFloat(s.trim()));
      if (boundsParts.length !== 4 || boundsParts.some(isNaN)) {
        console.error('Error: Invalid bounds format. Use "south,north,west,east"');
        process.exit(1);
      }
      const [south, north, west, east] = boundsParts;
      const bounds = { north, south, east, west };

      // Parse zoom range
      const zoomParts = options.zoom.split('-').map(s => parseInt(s.trim(), 10));
      if (zoomParts.length !== 2 || zoomParts.some(isNaN)) {
        console.error('Error: Invalid zoom format. Use "min-max" (e.g., "16-20")');
        process.exit(1);
      }
      const [minZoom, maxZoom] = zoomParts;

      // Create temporary TileForge instance for estimation
      const tf = new TileForge({ logLevel: 'error' });
      const estimate = tf.estimate({ bounds, minZoom, maxZoom });
      tf.close();

      console.log('Download Estimate:');
      console.log(`  Tile count: ${estimate.tileCount.toLocaleString()}`);
      console.log(`  Estimated size: ${estimate.estimatedSizeMB} MB`);
      console.log(`  Estimated time: ${estimate.estimatedTimeMinutes} minutes`);

    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// =============================================================================
// jobs - List all download jobs
// =============================================================================
program
  .command('jobs')
  .description('List all download jobs')
  .option('-d, --db <path>', 'Database file path', defaults.dbPath)
  .action((options) => {
    try {
      const tf = new TileForge({ dbPath: options.db, logLevel: 'error' });
      const jobs = tf.getJobs();
      tf.close();

      if (jobs.length === 0) {
        console.log('No download jobs found.');
        return;
      }

      console.log('Download Jobs:');
      console.log('');

      for (const job of jobs) {
        const progress = job.totalTiles > 0
          ? Math.round((job.downloadedTiles / job.totalTiles) * 100)
          : 0;

        console.log(`  ${job.jobId}`);
        console.log(`    Name: ${job.name}`);
        console.log(`    Source: ${job.source}`);
        console.log(`    Status: ${job.status}`);
        console.log(`    Progress: ${progress}% (${job.downloadedTiles}/${job.totalTiles})`);
        console.log(`    Zoom: ${job.minZoom}-${job.maxZoom}`);
        if (job.country || job.city) {
          console.log(`    Location: ${[job.city, job.country].filter(Boolean).join(', ')}`);
        }
        console.log('');
      }

    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// =============================================================================
// status - Get status of a specific job
// =============================================================================
program
  .command('status <jobId>')
  .description('Get status of a download job')
  .option('-d, --db <path>', 'Database file path', defaults.dbPath)
  .action((jobId, options) => {
    try {
      const tf = new TileForge({ dbPath: options.db, logLevel: 'error' });
      const status = tf.getJobStatus(jobId);
      tf.close();

      if (!status) {
        console.error(`Job not found: ${jobId}`);
        process.exit(1);
      }

      console.log('Job Status:');
      console.log(`  ID: ${status.jobId}`);
      console.log(`  Name: ${status.name || 'N/A'}`);
      console.log(`  Source: ${status.source}`);
      console.log(`  Status: ${status.status}`);
      console.log(`  Progress: ${status.progress}%`);
      console.log(`  Total tiles: ${status.totalTiles}`);
      console.log(`  Downloaded: ${status.downloadedTiles || 0}`);
      if (status.skippedTiles !== undefined) {
        console.log(`  Skipped: ${status.skippedTiles}`);
      }
      if (status.failedTiles !== undefined) {
        console.log(`  Failed: ${status.failedTiles}`);
      }

    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// =============================================================================
// cancel - Cancel a running job
// =============================================================================
program
  .command('cancel <jobId>')
  .description('Cancel a running download job')
  .option('-d, --db <path>', 'Database file path', defaults.dbPath)
  .action((jobId, options) => {
    try {
      const tf = new TileForge({ dbPath: options.db, logLevel: 'error' });
      const success = tf.cancelJob(jobId);
      tf.close();

      if (success) {
        console.log(`Job cancelled: ${jobId}`);
      } else {
        console.log(`Job not found or not running: ${jobId}`);
      }

    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// =============================================================================
// delete - Delete a job and its tiles
// =============================================================================
program
  .command('delete <jobId>')
  .description('Delete a download job and its cached tiles')
  .option('-d, --db <path>', 'Database file path', defaults.dbPath)
  .option('--keep-tiles', 'Keep the cached tiles', false)
  .action((jobId, options) => {
    try {
      const tf = new TileForge({ dbPath: options.db, logLevel: 'error' });
      const result = tf.deleteJob(jobId, !options.keepTiles);
      tf.close();

      if (result.deleted) {
        console.log(`Job deleted: ${jobId}`);
        if (!options.keepTiles) {
          console.log(`Tiles removed: ${result.tilesDeleted}`);
        }
      } else {
        console.error(`Job not found: ${jobId}`);
        process.exit(1);
      }

    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// =============================================================================
// sources - List available tile sources
// =============================================================================
program
  .command('sources')
  .description('List available tile sources')
  .action(() => {
    const sources = getAvailableSources();

    console.log('Available Tile Sources:');
    console.log('');

    for (const source of sources) {
      console.log(`  ${source.id}`);
      console.log(`    Name: ${source.name}`);
      console.log(`    Zoom: ${source.minZoom}-${source.maxZoom}`);
      console.log(`    Attribution: ${source.attribution}`);
      console.log('');
    }
  });

// =============================================================================
// stats - Show database statistics
// =============================================================================
program
  .command('stats')
  .description('Show database statistics')
  .option('-d, --db <path>', 'Database file path', defaults.dbPath)
  .action((options) => {
    try {
      const tf = new TileForge({ dbPath: options.db, logLevel: 'error' });
      const stats = tf.getStats();
      const totalTiles = tf.getTotalTileCount();
      tf.close();

      console.log('Database Statistics:');
      console.log(`  Total tiles: ${totalTiles.toLocaleString()}`);
      console.log('');

      if (stats.length === 0) {
        console.log('  No tiles cached yet.');
        return;
      }

      console.log('By Source:');
      for (const stat of stats) {
        const sizeMB = Math.round((stat.totalSize / 1024 / 1024) * 100) / 100;
        console.log(`  ${stat.source}:`);
        console.log(`    Tiles: ${stat.tileCount.toLocaleString()}`);
        console.log(`    Size: ${sizeMB} MB`);
      }

    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Parse arguments
program.parse();
