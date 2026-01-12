/**
 * Tile coordinate calculation utilities
 * Based on Web Mercator projection (EPSG:3857)
 */

/**
 * Convert latitude/longitude to tile coordinates
 * @param {number} lat - Latitude in degrees
 * @param {number} lng - Longitude in degrees
 * @param {number} zoom - Zoom level
 * @returns {{x: number, y: number, z: number}}
 */
export function latLngToTile(lat, lng, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lng + 180) / 360 * n);

  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);

  return { x, y, z: zoom };
}

/**
 * Convert tile coordinates to latitude/longitude (top-left corner)
 * @param {number} x - Tile X coordinate
 * @param {number} y - Tile Y coordinate
 * @param {number} z - Zoom level
 * @returns {{lat: number, lng: number}}
 */
export function tileToLatLng(x, y, z) {
  const n = Math.pow(2, z);
  const lng = x / n * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const lat = latRad * 180 / Math.PI;

  return { lat, lng };
}

/**
 * Get tile bounds for a geographic bounding box
 * @param {{north: number, south: number, east: number, west: number}} bounds
 * @param {number} zoom - Zoom level
 * @returns {{minX: number, maxX: number, minY: number, maxY: number, z: number}}
 */
export function getTileBounds(bounds, zoom) {
  const nwTile = latLngToTile(bounds.north, bounds.west, zoom);
  const seTile = latLngToTile(bounds.south, bounds.east, zoom);

  return {
    minX: Math.min(nwTile.x, seTile.x),
    maxX: Math.max(nwTile.x, seTile.x),
    minY: Math.min(nwTile.y, seTile.y),
    maxY: Math.max(nwTile.y, seTile.y),
    z: zoom
  };
}

/**
 * Generate list of tile coordinates for a bounding box and zoom range
 * @param {{north: number, south: number, east: number, west: number}} bounds
 * @param {number} minZoom
 * @param {number} maxZoom
 * @returns {Array<{x: number, y: number, z: number}>}
 */
export function getTileList(bounds, minZoom, maxZoom) {
  const tiles = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    const tileBounds = getTileBounds(bounds, z);

    for (let x = tileBounds.minX; x <= tileBounds.maxX; x++) {
      for (let y = tileBounds.minY; y <= tileBounds.maxY; y++) {
        tiles.push({ x, y, z });
      }
    }
  }

  return tiles;
}

/**
 * Calculate total number of tiles for a bounding box and zoom range
 * @param {{north: number, south: number, east: number, west: number}} bounds
 * @param {number} minZoom
 * @param {number} maxZoom
 * @returns {number}
 */
export function calculateTileCount(bounds, minZoom, maxZoom) {
  let count = 0;

  for (let z = minZoom; z <= maxZoom; z++) {
    const tileBounds = getTileBounds(bounds, z);
    const width = tileBounds.maxX - tileBounds.minX + 1;
    const height = tileBounds.maxY - tileBounds.minY + 1;
    count += width * height;
  }

  return count;
}

/**
 * Validate tile coordinates
 * @param {number} x - Tile X coordinate
 * @param {number} y - Tile Y coordinate
 * @param {number} z - Zoom level
 * @returns {boolean}
 */
export function isValidTile(x, y, z) {
  if (z < 0 || z > 22) return false;

  const maxTile = Math.pow(2, z) - 1;
  return x >= 0 && x <= maxTile && y >= 0 && y <= maxTile;
}

/**
 * Validate geographic bounds
 * @param {{north: number, south: number, east: number, west: number}} bounds
 * @returns {boolean}
 */
export function isValidBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') return false;

  const { north, south, east, west } = bounds;

  if (typeof north !== 'number' || typeof south !== 'number' ||
      typeof east !== 'number' || typeof west !== 'number') {
    return false;
  }

  // Valid latitude range: -85.051129 to 85.051129 (Web Mercator limits)
  if (north < -85.051129 || north > 85.051129) return false;
  if (south < -85.051129 || south > 85.051129) return false;

  // Valid longitude range: -180 to 180
  if (east < -180 || east > 180) return false;
  if (west < -180 || west > 180) return false;

  // North must be greater than south
  if (north <= south) return false;

  return true;
}

/**
 * Validate zoom range
 * @param {number} minZoom
 * @param {number} maxZoom
 * @returns {boolean}
 */
export function isValidZoomRange(minZoom, maxZoom) {
  if (typeof minZoom !== 'number' || typeof maxZoom !== 'number') return false;
  if (minZoom < 0 || minZoom > 22) return false;
  if (maxZoom < 0 || maxZoom > 22) return false;
  if (minZoom > maxZoom) return false;
  return true;
}
