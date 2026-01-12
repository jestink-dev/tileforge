/**
 * Tile source configurations - SATELLITE IMAGERY ONLY
 * Each source defines the URL template and metadata
 */

export const tileSources = {
  arcgis: {
    name: 'ArcGIS World Imagery (Satellite)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles (c) Esri - Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 22,
    minZoom: 0,
    tileSize: 256,
    type: 'satellite',
    termsOfService: 'https://www.esri.com/en-us/legal/terms/full-master-agreement'
  },

  google: {
    name: 'Google Satellite',
    url: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    attribution: '(c) Google',
    maxZoom: 22,
    minZoom: 0,
    tileSize: 256,
    type: 'satellite',
    termsOfService: 'https://www.google.com/intl/en_us/help/terms_maps/'
  },

  'esri-world-imagery': {
    name: 'Esri World Imagery (High Resolution)',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '(c) Esri, Maxar, Earthstar Geographics',
    maxZoom: 22,
    minZoom: 0,
    tileSize: 256,
    type: 'satellite',
    termsOfService: 'https://www.esri.com/en-us/legal/terms/full-master-agreement'
  }
};

/**
 * Get tile URL with subdomain rotation
 * @param {string} source - Source identifier
 * @param {number} z - Zoom level
 * @param {number} x - Tile X coordinate
 * @param {number} y - Tile Y coordinate
 * @param {number} counter - Counter for subdomain rotation
 * @returns {string} Tile URL
 */
export function getTileUrl(source, z, x, y, counter = 0) {
  const config = tileSources[source];
  if (!config) {
    throw new Error(`Unknown tile source: ${source}`);
  }

  let url = config.url;

  // Replace {z}, {x}, {y} placeholders
  url = url.replace('{z}', z).replace('{x}', x).replace('{y}', y);

  // Handle subdomain rotation
  if (config.subdomains && config.subdomains.length > 0) {
    const subdomain = config.subdomains[counter % config.subdomains.length];
    url = url.replace('{s}', subdomain);
  }

  return url;
}

/**
 * Get list of available sources
 * @returns {Array<{id: string, name: string, attribution: string, maxZoom: number, minZoom: number}>}
 */
export function getAvailableSources() {
  return Object.keys(tileSources).map(key => ({
    id: key,
    name: tileSources[key].name,
    attribution: tileSources[key].attribution,
    maxZoom: tileSources[key].maxZoom,
    minZoom: tileSources[key].minZoom
  }));
}

/**
 * Check if a source exists
 * @param {string} sourceId - Source identifier
 * @returns {boolean}
 */
export function isValidSource(sourceId) {
  return sourceId in tileSources;
}
