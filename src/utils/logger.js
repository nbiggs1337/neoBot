const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  formatMessage(level, message, ...args) {
    const timestamp = this.getTimestamp();
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ') : '';
    
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
  }

  writeToFile(level, formattedMessage) {
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDir, `bot-${date}.log`);
    
    fs.appendFileSync(logFile, formattedMessage + '\n');
  }

  log(level, message, ...args) {
    const formattedMessage = this.formatMessage(level, message, ...args);
    
    // Console output with colors
    switch (level) {
      case 'error':
        console.error('\x1b[31m%s\x1b[0m', formattedMessage);
        break;
      case 'warn':
        console.warn('\x1b[33m%s\x1b[0m', formattedMessage);
        break;
      case 'info':
        console.info('\x1b[36m%s\x1b[0m', formattedMessage);
        break;
      case 'debug':
        if (process.env.ENABLE_DEBUG === 'true') {
          console.log('\x1b[35m%s\x1b[0m', formattedMessage);
        }
        break;
      default:
        console.log(formattedMessage);
    }
    
    // Write to file
    this.writeToFile(level, formattedMessage);
  }

  info(message, ...args) {
    this.log('info', message, ...args);
  }

  error(message, ...args) {
    this.log('error', message, ...args);
  }

  warn(message, ...args) {
    this.log('warn', message, ...args);
  }

  debug(message, ...args) {
    this.log('debug', message, ...args);
  }
}

module.exports = new Logger();
