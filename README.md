# NeoFo2. **AI Content Generator** (`OpenAIContentGenerator.js`)
   - Integrates wi3. **Content Generation**: Uses OpenAI SDK with Grok AI to generate topic-appropriate content
4. **Post Creation**: Creates new forum posts in random categories OpenAI SDK using Grok AI endpoint
   - Creates engaging titles and post bodies
   - Has fallback content generation for reliabilityum Bot

A Node.js bot that automatically logs into your neoforum, generates engaging content using XAI SDK, and creates forum posts across different categories.

## Features

- **Automated Login**: Securely logs into your neoforum using credentials
- **AI Content Generation**: Uses OpenAI SDK with Grok AI to generate engaging forum posts
- **Multi-Category Support**: Creates posts across different forum categories
- **Smart Scraping**: Automatically detects forum categories and structure
- **Rate Limiting**: Configurable posting intervals to avoid spam
- **Comprehensive Logging**: Detailed logs for monitoring and debugging
- **Headless Operation**: Can run with or without browser UI

## Prerequisites

- Node.js 16+ installed
- OpenAI API key (configured for Grok AI endpoint)
- Admin access to your neoforum

## Installation

1. Clone or download this project
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment template:
   ```bash
   copy .env.example .env
   ```
4. Configure your environment variables in `.env`:
   ```env
   NEOFORUM_URL=https://your-neoforum-url.com
   NEOFORUM_USERNAME=your_username
   NEOFORUM_PASSWORD=your_password
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_BASE_URL=https://api.x.ai/v1
   POST_INTERVAL_MINUTES=30
   MAX_POSTS_PER_SESSION=5
   ENABLE_DEBUG=true
   FORUM_CATEGORIES=General Discussion,Tech Talk,Gaming,Random Thoughts
   ```

## Configuration

### Environment Variables

- `NEOFORUM_URL`: Your forum's base URL
- `NEOFORUM_USERNAME`: Your admin username
- `NEOFORUM_PASSWORD`: Your admin password
- `OPENAI_API_KEY`: Your OpenAI API key for Grok AI access
- `OPENAI_BASE_URL`: Grok AI endpoint (https://api.x.ai/v1)
- `POST_INTERVAL_MINUTES`: Minutes to wait between posts (default: 30)
- `MAX_POSTS_PER_SESSION`: Maximum posts per bot session (default: 5)
- `ENABLE_DEBUG`: Show browser UI for debugging (default: true)
- `FORUM_CATEGORIES`: Comma-separated list of forum categories

### OpenAI API Key for Grok

1. Get an OpenAI API key that has access to Grok AI
2. Configure the base URL to point to Grok's endpoint: `https://api.x.ai/v1`
3. Add both the API key and base URL to your `.env` file

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## How It Works

1. **Initialization**: Bot starts up and launches a browser instance
2. **Login**: Automatically logs into your neoforum using provided credentials
3. **Category Detection**: Scrapes available forum categories or uses configured ones
3. **Content Generation**: Uses OpenAI SDK with Grok AI to generate topic-appropriate content
5. **Post Creation**: Creates new forum posts in random categories
6. **Rate Limiting**: Waits specified interval between posts
7. **Cleanup**: Gracefully shuts down after completing the session

## File Structure

```
neoBot/
├── src/
│   ├── bot/
│   │   ├── NeoForumBot.js              # Main bot controller
│   │   ├── OpenAIContentGenerator.js   # AI content generation using OpenAI SDK
│   │   └── ForumScraper.js             # Forum scraping utilities
│   ├── utils/
│   │   └── logger.js               # Logging utility
│   └── index.js                    # Entry point
├── logs/                           # Generated log files
├── .env                           # Environment configuration
├── package.json                   # Dependencies and scripts
└── README.md                      # This file
```

## Customization

### Forum Structure
The bot automatically adapts to different forum structures, but you may need to adjust selectors in:
- `NeoForumBot.js` for login and post creation elements
- `ForumScraper.js` for category and content detection

### Content Generation
Modify `OpenAIContentGenerator.js` to:
- Adjust content prompts and templates
- Change topic generation strategies
- Customize content formatting

### Posting Behavior
Configure posting behavior in:
- Environment variables for timing and limits
- `NeoForumBot.js` for posting logic and error handling

## Logging

The bot generates detailed logs in the `logs/` directory:
- Daily log files with timestamps
- Color-coded console output
- Error tracking and debugging information

## Safety Features

- **Rate Limiting**: Prevents spam with configurable intervals
- **Session Limits**: Maximum posts per session to avoid overposting
- **Error Handling**: Graceful recovery from network and parsing errors
- **Cleanup**: Proper browser cleanup on shutdown

## Troubleshooting

### Common Issues

1. **Login Fails**: Check forum URL and credentials
2. **Content Generation Errors**: Verify OpenAI API key and Grok endpoint connectivity
3. **Post Creation Fails**: Check forum selectors and permissions
4. **Categories Not Found**: Manually specify categories in .env

### Debug Mode

Enable debug mode in `.env`:
```env
ENABLE_DEBUG=true
```

This will:
- Show browser UI for visual debugging
- Enable detailed console logging
- Display network requests and responses

## Legal & Ethical Use

This bot is designed for:
- Forum administrators managing their own communities
- Legitimate content generation and community engagement
- Educational and development purposes

Ensure you have proper authorization before running this bot on any forum.

## Support

For issues and questions:
1. Check the logs in the `logs/` directory
2. Enable debug mode for visual troubleshooting
3. Review forum-specific selector configuration

## License

MIT License - See LICENSE file for details
