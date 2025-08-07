require('dotenv').config();
const NeoForumBot = require('./bot/NeoForumBot');
const logger = require('./utils/logger');

async function main() {
  try {
    logger.info('Starting NeoForum Bot...');
    
    const bot = new NeoForumBot({
      forumUrl: process.env.NEOFORUM_URL,
      username: process.env.NEOFORUM_USERNAME,
      password: process.env.NEOFORUM_PASSWORD,
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiBaseUrl: process.env.OPENAI_BASE_URL,
      postInterval: parseInt(process.env.POST_INTERVAL_MINUTES) || 0.15,
      maxPostsPerSession: parseInt(process.env.MAX_POSTS_PER_SESSION) || 5,
      enableDebug: process.env.ENABLE_DEBUG === 'true'
    });

    await bot.initialize();
    await bot.start();
    
  } catch (error) {
    logger.error('Bot startup failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

main();
