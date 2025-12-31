const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
  };
  
  class Logger {
    constructor() {
      this.level = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'];
    }
  
    formatMessage(level, ...args) {
      const timestamp = new Date().toISOString();
      return `[${timestamp}] [${level}] ${args.join(' ')}`;
    }
  
    error(...args) {
      if (this.level >= LOG_LEVELS.ERROR) {
        console.error(this.formatMessage('ERROR', ...args));
      }
    }
  
    warn(...args) {
      if (this.level >= LOG_LEVELS.WARN) {
        console.warn(this.formatMessage('WARN', ...args));
      }
    }
  
    info(...args) {
      if (this.level >= LOG_LEVELS.INFO) {
        console.log(this.formatMessage('INFO', ...args));
      }
    }
  
    debug(...args) {
      if (this.level >= LOG_LEVELS.DEBUG) {
        console.log(this.formatMessage('DEBUG', ...args));
      }
    }
  }
  
  module.exports = new Logger();