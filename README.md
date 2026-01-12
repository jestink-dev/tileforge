# TileForge

Offline map tile server - download, cache, and serve satellite map tiles for offline use.

TileForge allows you to download satellite imagery tiles from various sources (ArcGIS, Google, Esri) and serve them locally for mapping applications that need offline functionality.

## Features

- Download satellite map tiles from multiple sources
- SQLite-based tile storage (portable single-file database)
- Concurrent download management with rate limiting
- In-memory LRU caching for fast tile serving
- REST API for tile serving and download management
- CLI for command-line usage
- Can be used as a library, CLI tool, or Express middleware

## Installation

```bash
# Install as a dependency
npm install tileforge

# Or install globally for CLI usage
npm install -g tileforge
```

## Quick Start

### CLI Usage

```bash
# Start the tile server
tileforge serve --port 3000

# Download tiles for a region
tileforge download \
  --name "My Area" \
  --source arcgis \
  --bounds "40.74,40.76,-73.99,-73.97" \
  --zoom 16-20

# List available sources
tileforge sources

# Estimate download size
tileforge estimate --bounds "40.74,40.76,-73.99,-73.97" --zoom 16-20

# List download jobs
tileforge jobs

# Get job status
tileforge status <jobId>
```

### Programmatic Usage

```javascript
import { TileForge } from 'tileforge';

const tf = new TileForge({
  dbPath: './tiles.db',
  maxConcurrentDownloads: 4
});

// Download tiles
const job = await tf.download({
  name: 'Manhattan',
  source: 'arcgis',
  bounds: {
    north: 40.7589,
    south: 40.7014,
    east: -73.9389,
    west: -74.0259
  },
  minZoom: 16,
  maxZoom: 20
});

console.log(`Started job: ${job.jobId}`);

// Check progress
const status = tf.getJobStatus(job.jobId);
console.log(`Progress: ${status.progress}%`);

// Get a tile
const tile = tf.getTile('arcgis', 16, 1234, 5678);

// Close when done
tf.close();
```

### Express Middleware

```javascript
import express from 'express';
import { createRouter } from 'tileforge/router';

const app = express();

// Mount TileForge routes
app.use('/map', createRouter({
  dbPath: './tiles.db'
}));

app.listen(3000);
```

### Standalone Server

```javascript
import { createServer } from 'tileforge/server';

const server = createServer({
  port: 3000,
  dbPath: './tiles.db'
});

await server.start();
```

## API Reference

### TileForge Class

```javascript
const tf = new TileForge(options);
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dbPath` | string | `'./data/tiles.db'` | Path to SQLite database |
| `maxConcurrentDownloads` | number | `4` | Maximum concurrent downloads |
| `cacheSize` | number | `1000` | In-memory tile cache size |
| `rateLimit` | number | `500` | Minimum ms between requests |
| `logLevel` | string | `'info'` | Log level (error/warn/info/debug) |

#### Methods

##### `download(options)`
Start downloading tiles for a geographic region.

```javascript
const job = await tf.download({
  name: 'Area Name',
  source: 'arcgis',         // 'arcgis' | 'google' | 'esri-world-imagery'
  bounds: {
    north: 40.76,
    south: 40.74,
    east: -73.97,
    west: -73.99
  },
  minZoom: 16,
  maxZoom: 20
});
```

##### `estimate(options)`
Estimate download size and time.

```javascript
const estimate = tf.estimate({
  bounds: { north, south, east, west },
  minZoom: 16,
  maxZoom: 20
});
// Returns: { tileCount, estimatedSizeMB, estimatedTimeMinutes }
```

##### `extendJob(jobId, options)`
Extend zoom levels for an existing job.

```javascript
await tf.extendJob(jobId, { minZoom: 14, maxZoom: 20 });
```

##### `getTile(source, z, x, y)`
Get a cached tile.

```javascript
const buffer = tf.getTile('arcgis', 16, 1234, 5678);
```

##### `hasTile(source, z, x, y)`
Check if a tile is cached.

```javascript
const exists = tf.hasTile('arcgis', 16, 1234, 5678);
```

##### `getJobStatus(jobId)`
Get the status of a download job.

```javascript
const status = tf.getJobStatus(jobId);
// Returns: { jobId, progress, status, downloadedTiles, totalTiles, ... }
```

##### `getJobs()`
Get all download jobs.

```javascript
const jobs = tf.getJobs();
```

##### `cancelJob(jobId)`
Cancel a running download job.

```javascript
tf.cancelJob(jobId);
```

##### `deleteJob(jobId, deleteTiles)`
Delete a job and optionally its tiles.

```javascript
const result = tf.deleteJob(jobId, true);
// Returns: { deleted: true, tilesDeleted: 1234 }
```

##### `getSources()`
Get available tile sources.

```javascript
const sources = tf.getSources();
// Returns: [{ id, name, attribution, minZoom, maxZoom }, ...]
```

##### `close()`
Close database connection.

```javascript
tf.close();
```

## REST API Endpoints

When running the server, the following endpoints are available:

### Tiles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tiles/:source/:z/:x/:y.png` | Get a cached tile |
| GET | `/tiles/:source/count` | Get tile count for source |

### Downloads

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/download` | Start new download |
| GET | `/api/download` | List all jobs |
| GET | `/api/download/:jobId` | Get job status |
| DELETE | `/api/download/:jobId` | Delete job |
| PATCH | `/api/download/:jobId/rename` | Rename job |
| PATCH | `/api/download/:jobId/extend` | Extend zoom levels |
| POST | `/api/download/estimate` | Estimate download |

### Sources

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sources` | List all sources |
| GET | `/api/sources/:sourceId` | Get source details |

### Server

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API info |
| GET | `/health` | Health check |

## CLI Commands

```bash
tileforge <command> [options]
```

| Command | Description |
|---------|-------------|
| `serve` | Start the HTTP server |
| `download` | Download tiles for a region |
| `estimate` | Estimate download size |
| `jobs` | List all download jobs |
| `status <jobId>` | Get job status |
| `cancel <jobId>` | Cancel a running job |
| `delete <jobId>` | Delete a job |
| `sources` | List available sources |
| `stats` | Show database statistics |

### Examples

```bash
# Start server on port 3001
tileforge serve --port 3001 --db ./my-tiles.db

# Download with custom settings
tileforge download \
  --name "NYC Central Park" \
  --source google \
  --bounds "40.764,40.800,-73.981,-73.949" \
  --zoom 15-19 \
  --concurrent 8

# Estimate before downloading
tileforge estimate --bounds "40.764,40.800,-73.981,-73.949" --zoom 15-19
```

## Available Tile Sources

| ID | Name | Max Zoom |
|----|------|----------|
| `arcgis` | ArcGIS World Imagery | 22 |
| `google` | Google Satellite | 22 |
| `esri-world-imagery` | Esri World Imagery (High Res) | 22 |

## Using with Map Libraries

### OpenLayers

```javascript
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';

const layer = new TileLayer({
  source: new XYZ({
    url: 'http://localhost:3000/tiles/arcgis/{z}/{x}/{y}.png'
  })
});
```

### Leaflet

```javascript
const layer = L.tileLayer('http://localhost:3000/tiles/arcgis/{z}/{x}/{y}.png', {
  maxZoom: 22
});
```

## License

MIT

## Legal Notice

When using tile sources, please respect their Terms of Service:

- **ArcGIS/Esri**: https://www.esri.com/en-us/legal/terms/full-master-agreement
- **Google**: https://www.google.com/intl/en_us/help/terms_maps/

This tool is intended for legitimate offline caching purposes. Please ensure your usage complies with the respective provider's terms.
