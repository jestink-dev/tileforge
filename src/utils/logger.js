/**
 * Simple logger utility for TileForge
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

/**
 * Create a logger instance with the specified log level
 * @param {string} level - Log level ('error' | 'warn' | 'info' | 'debug')
 * @returns {object} Logger instance
 */
export function createLogger(level = 'info') {
  const currentLevel = LOG_LEVELS[level] || LOG_LEVELS.info;

  function log(logLevel, message, ...args) {
    if (LOG_LEVELS[logLevel] <= currentLevel) {
      const timestamp = new Date().toISOString();
      const fn = logLevel === 'error' ? console.error : console.log;
      fn(`[${timestamp}] [${logLevel.toUpperCase()}]`, message, ...args);
    }
  }

  return {
    error: (message, ...args) => log('error', message, ...args),
    warn: (message, ...args) => log('warn', message, ...args),
    info: (message, ...args) => log('info', message, ...args),
    debug: (message, ...args) => log('debug', message, ...args)
  };
}

// Default logger instance (uses 'info' level)
const logger = createLogger(process.env.LOG_LEVEL || 'info');

export default logger;
