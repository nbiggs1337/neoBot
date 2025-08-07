const puppeteer = require('puppeteer');
const OpenAIContentGenerator = require('./OpenAIContentGenerator');
const ForumScraper = require('./ForumScraper');
const logger = require('../utils/logger');

class NeoForumBot {
  async commentOnRecentPosts(forumSlug, recentPosts) {
    logger.info(`Starting to comment on recent posts in forum: ${forumSlug}`);
    logger.info(`Received ${recentPosts.length} recent posts to process`);
    logger.debug('Recent posts being processed:', recentPosts.map(p => ({ title: p.title, link: p.link, hasContent: !!p.content })));
    
    for (const post of recentPosts) {
      try {
        logger.info(`Processing post for commenting: "${post.title}"`);
        logger.debug('Post data before getting full content:', post);
        
        // Get full post content
        const postUrl = this.config.forumUrl + post.link;
        logger.debug('Navigating to post URL for full content:', postUrl);
        const postContent = await this.forumScraper.getPostContent(this.page, postUrl);
        
        if (!postContent || !postContent.content) {
          logger.warn('Could not get post content for:', postUrl);
          continue;
        }
        
        logger.info(`Successfully scraped full post content for: "${postContent.title}"`);
        logger.debug('Full post content structure:', {
          title: postContent.title,
          contentLength: postContent.content?.length || 0,
          hasComments: !!postContent.comments,
          commentsCount: postContent.comments?.length || 0,
          author: postContent.author,
          timestamp: postContent.timestamp
        });
        
        // Generate comment with context from recent posts
        logger.info('Calling content generator with post content and recent posts context...');
        logger.debug('Passing to content generator:', {
          targetPost: { title: postContent.title, contentLength: postContent.content.length },
          recentPostsCount: recentPosts.length,
          recentPostsTitles: recentPosts.map(p => p.title)
        });
        
        const commentText = await this.contentGenerator.generateComment(postContent, recentPosts);
        logger.info(`Generated comment (${commentText.length} chars):`, commentText.substring(0, 100) + '...');
        // Find comment box and submit comment
        logger.info('=== COMMENT FORM INTERACTION START ===');
        logger.debug('Looking for comment form...');
        try {
          // Try multiple selector strategies with shorter timeout
          let commentBox = null;
          let submitButton = null;
          
          // Strategy 1: Standard selectors
          try {
            logger.debug('Waiting for comment form elements...');
            await this.page.waitForSelector('textarea, input[type="text"], form', { timeout: 8000 });
            commentBox = await this.page.$('textarea[name="comment"]') ||
                        await this.page.$('#comment') ||
                        await this.page.$('.comment-box') ||
                        await this.page.$('.reply-content') ||
                        await this.page.$('textarea');
            logger.debug('Standard selector result:', !!commentBox);
          } catch (e) {
            logger.debug('Standard selectors failed, trying fallbacks...', e.message);
          }
          
          // Strategy 2: Look for any textarea or text input
          if (!commentBox) {
            logger.debug('Trying fallback selectors...');
            const textareas = await this.page.$$('textarea');
            const textInputs = await this.page.$$('input[type="text"]');
            commentBox = textareas[0] || textInputs[0];
            logger.debug('Fallback selector result:', !!commentBox, `textareas: ${textareas.length}, inputs: ${textInputs.length}`);
          }
          
          if (commentBox) {
            logger.info('✅ Found comment box, typing comment...');
            await commentBox.focus();
            await this.page.waitForTimeout(500); // Small delay after focus
            await commentBox.type(commentText);
            logger.debug('Comment text typed successfully');
            
            // Wait a moment for any dynamic content to load
            await this.page.waitForTimeout(1000);
            
            // Find submit button with multiple strategies
            logger.debug('Searching for submit button...');
            const submitSelectors = [
              'button[type="submit"]',           // Most specific - actual submit buttons
              'form button',                     // Buttons inside forms
              '.submit-comment',
              '.reply-button', 
              '.post-comment',
              '.send-comment',
              '.comment-submit',
              'input[type="submit"]'
            ];
            
            // First pass: Look for specific submit-related buttons
            for (const selector of submitSelectors) {
              try {
                const buttons = await this.page.$$(selector);
                for (const btn of buttons) {
                  // Safely get button text
                  let buttonText = '';
                  try {
                    buttonText = await this.page.evaluate(button => {
                      try {
                        return button && button.textContent ? button.textContent.trim() : '';
                      } catch (e) {
                        return '';
                      }
                    }, btn);
                  } catch (evalError) {
                    logger.debug(`Could not evaluate button text for selector "${selector}":`, evalError.message);
                    continue;
                  }
                  
                  logger.debug(`Found button with selector "${selector}": "${buttonText}"`);
                  
                  // Check if button text looks like a submit button
                  const submitKeywords = ['post', 'submit', 'reply', 'send', 'comment', 'add comment', 'post comment'];
                  const excludeKeywords = ['explore', 'cancel', 'back', 'edit', 'delete', 'share', 'like', 'vote'];
                  
                  const isSubmitButton = submitKeywords.some(keyword => buttonText.toLowerCase().includes(keyword));
                  const isExcluded = excludeKeywords.some(keyword => buttonText.toLowerCase().includes(keyword));
                  
                  if (isSubmitButton && !isExcluded) {
                    logger.info(`✅ Found valid submit button: "${buttonText}" (selector: ${selector})`);
                    submitButton = btn;
                    break;
                  } else {
                    logger.debug(`❌ Skipping button "${buttonText}" - isSubmit: ${isSubmitButton}, isExcluded: ${isExcluded}`);
                  }
                }
                
                if (submitButton) break;
              } catch (selectorError) {
                logger.debug(`Error with selector "${selector}":`, selectorError.message);
                continue;
              }
            }
            
            // Second pass: If no specific submit button found, look for generic buttons but filter more carefully
            if (!submitButton) {
              logger.debug('No specific submit button found, trying generic button search...');
              try {
                const allButtons = await this.page.$$('button');
                logger.debug(`Found ${allButtons.length} total buttons on page`);
                
                for (const btn of allButtons) {
                  let buttonText = '';
                  try {
                    buttonText = await this.page.evaluate(button => {
                      try {
                        return button && button.textContent ? button.textContent.trim() : '';
                      } catch (e) {
                        return '';
                      }
                    }, btn);
                  } catch (evalError) {
                    continue;
                  }
                  
                  logger.debug(`Analyzing generic button: "${buttonText}"`);
                  
                  // Much stricter filtering for generic buttons
                  const strongSubmitKeywords = ['post comment', 'add comment', 'submit', 'post', 'reply'];
                  const excludeKeywords = ['explore', 'cancel', 'back', 'edit', 'delete', 'share', 'like', 'vote', 'search', 'filter', 'sort', 'menu', 'dropdown'];
                  
                  const isStrongSubmit = strongSubmitKeywords.some(keyword => buttonText.toLowerCase().includes(keyword));
                  const isExcluded = excludeKeywords.some(keyword => buttonText.toLowerCase().includes(keyword));
                  
                  if (isStrongSubmit && !isExcluded && buttonText.length < 50) {
                    logger.warn(`⚠️ Using generic button as submit: "${buttonText}"`);
                    submitButton = btn;
                    break;
                  }
                }
              } catch (genericError) {
                logger.debug('Error in generic button search:', genericError.message);
              }
            }
            
            if (submitButton) {
              logger.info('=== SUBMITTING COMMENT ===');
              
              try {
                // Scroll button into view and ensure it's clickable
                await submitButton.scrollIntoView();
                await this.page.waitForTimeout(500);
                
                // Click the submit button
                logger.debug('Clicking submit button...');
                await submitButton.click();
                
                // Wait for submission to process
                logger.debug('Waiting for comment submission to process...');
                await this.page.waitForTimeout(3000); // 3 second delay for upload
                
                // Try to detect if comment was successful
                try {
                  // Look for success indicators or page changes
                  await this.page.waitForFunction(
                    () => {
                      try {
                        // Check for common success indicators
                        const successIndicators = [
                          document.querySelector('.success'),
                          document.querySelector('.comment-success'),
                          document.querySelector('[class*="success"]'),
                          // Or check if comment box was cleared
                          document.querySelector('textarea')?.value === ''
                        ];
                        return successIndicators.some(indicator => indicator);
                      } catch (e) {
                        return false;
                      }
                    },
                    { timeout: 5000 }
                  ).catch(() => {
                    logger.debug('No clear success indicator found, assuming comment posted');
                  });
                } catch (e) {
                  logger.debug('Could not verify comment submission, continuing...');
                }
                
                logger.info(`✅ Comment submitted on post: ${postContent.title}`);
                
                // Additional delay before moving to next post
                await this.page.waitForTimeout(2000);
                
              } catch (clickError) {
                logger.error('❌ Error clicking submit button:', clickError.message);
                logger.debug('Submit button click error details:', clickError);
              }
              
            } else {
              logger.error('❌ Could not find submit button for post:', postUrl);
              try {
                logger.debug('Available buttons on page:');
                const allButtons = await this.page.$$eval('button, input[type="submit"]', buttons => 
                  buttons.map(btn => {
                    try {
                      return { 
                        text: btn.textContent ? btn.textContent.trim() : '', 
                        type: btn.type || '', 
                        className: btn.className || '' 
                      };
                    } catch (e) {
                      return { text: 'error', type: 'error', className: 'error' };
                    }
                  })
                );
                logger.debug('All buttons found:', allButtons);
              } catch (buttonListError) {
                logger.debug('Could not enumerate buttons:', buttonListError.message);
              }
            }
          } else {
            logger.error('❌ Could not find comment box for post:', postUrl);
            // Log page content for debugging
            try {
              const html = await this.page.content();
              const formMatches = html.match(/<form[\s\S]*?<\/form>|<textarea[\s\S]*?\/?>|<input[^>]*>/gi);
              logger.debug('Page HTML snippet (forms and inputs):', 
                formMatches?.slice(0, 5) || 'No forms/inputs found'
              );
            } catch (htmlError) {
              logger.debug('Could not extract HTML for debugging:', htmlError.message);
            }
          }
        } catch (formError) {
          logger.error('❌ Error with comment form interaction:', {
            name: formError.name,
            message: formError.message,
            code: formError.code
          });
          logger.debug('Full form error details:', formError);
        }
      } catch (err) {
        logger.error('Error commenting on post:', err);
      }
    }
  }
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.page = null;
    this.contentGenerator = new OpenAIContentGenerator(config.openaiApiKey, config.openaiBaseUrl);
    this.forumScraper = new ForumScraper();
    this.isLoggedIn = false;
    this.postCount = 0;
  }

  async initialize() {
    logger.info('Initializing bot...');
    logger.debug('Config:', this.config);
    
    this.browser = await puppeteer.launch({
      headless: !this.config.enableDebug,
      devtools: this.config.enableDebug,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    logger.info('Bot initialized successfully');
  }

  async start() {
    logger.debug('Starting bot main loop...');
    try {
      logger.debug('Calling login()');
      await this.login();
      logger.debug('Login successful, starting bot cycle');
      await this.runBotCycle();
    } catch (error) {
      logger.error('Bot error:', error);
      await this.cleanup();
    }
  }

  async login() {
    logger.info('Attempting to log in to neoforum...');
    logger.debug('Navigating to forum URL:', this.config.forumUrl + "/login");
    await this.page.goto(this.config.forumUrl + "/login");
    logger.debug('Waiting for login form selector...');
    await this.page.waitForSelector('input[id="email"], #username');
    logger.debug('Login form should be visible now');
    // Fill login form
    const usernameSelector = await this.page.$('input[id="email"]') || await this.page.$('input[name="email"]') || await this.page.$('#username');
    const passwordSelector = await this.page.$('input[id="password"]') || await this.page.$('#password');
    logger.debug('usernameSelector:', !!usernameSelector, 'passwordSelector:', !!passwordSelector);
    if (usernameSelector && passwordSelector) {
      try {
        logger.debug('Typing username:', this.config.username);
        await usernameSelector.type(this.config.username);
        logger.debug('Typing password: [hidden]');
        await passwordSelector.type(this.config.password);
      } catch (err) {
        logger.error('Error typing username or password:', err && err.stack ? err.stack : err);
        throw err;
      }
      try {
        logger.debug('Submitting login form...');
        const submitButton = await this.page.$('button[type="submit"], input[type="submit"], .login-button');
        if (submitButton) {
          await Promise.all([
            this.page.waitForNavigation(),
            submitButton.click()
          ]);
          logger.debug('Login navigation complete');
          this.isLoggedIn = true;
          logger.info('Successfully logged in to neoforum');
        } else {
          logger.error('Could not find submit button');
          throw new Error('Could not find submit button');
        }
      } catch (err) {
        logger.error('Error submitting login form:', err && err.stack ? err.stack : err);
        throw err;
      }
    } else {
      logger.error('Could not find login form elements');
      throw new Error('Could not find login form elements');
    }
  }

  async runBotCycle() {
    logger.info('Starting comment-only bot cycle...');
    logger.debug('Max comments per session:', this.config.maxPostsPerSession);
    let commentCount = 0;
    
    while (commentCount < this.config.maxPostsPerSession) {
      try {
        logger.debug(`Comment cycle iteration: ${commentCount + 1}`);
        // Get forum categories
        logger.debug('Getting forum categories...');
        const categories = await this.getForumCategories();
        logger.debug('Categories found:', categories);
        
        // Select a random category to comment in
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        logger.debug('Selected category for commenting:', randomCategory);
        
        // Compute forum slug from category name
        const forumSlug = randomCategory.toLowerCase().replace(/\s+/g, '-');
        
        // Navigate to the category page before scraping
        const categoryUrl = `${this.config.forumUrl}/forum/${encodeURIComponent(forumSlug)}`;
        logger.debug('Navigating to category URL for commenting:', categoryUrl);
        await this.page.goto(categoryUrl);
        
        // Scrape recent posts to comment on
        logger.debug('Scraping recent posts for commenting in category:', forumSlug);
        const recentPosts = await this.forumScraper.scrapeRecentPosts(this.page, forumSlug, 5);
        logger.info(`Found ${recentPosts.length} recent posts for commenting`);
        logger.debug('Recent posts data structure:', JSON.stringify(recentPosts, null, 2));

        if (recentPosts.length > 0) {
          logger.info(`Starting to comment on ${recentPosts.length} recent posts in category: ${randomCategory}`);
          // Comment on recent posts in this category
          await this.commentOnRecentPosts(forumSlug, recentPosts);
          commentCount++;
          logger.info(`Completed comment cycle ${commentCount}/${this.config.maxPostsPerSession}`);
        } else {
          logger.warn(`No recent posts found in category ${randomCategory}, skipping...`);
        }
        
        // Wait before next comment cycle
        if (commentCount < this.config.maxPostsPerSession) {
          const waitTime = this.config.postInterval * 60 * 1000; // Convert to milliseconds
          logger.info(`Waiting ${this.config.postInterval} minutes before next comment cycle...`);
          logger.debug('Sleeping for', waitTime, 'ms');
          await this.delay(waitTime);
        }
      } catch (error) {
        logger.error('Error in comment cycle:', error);
        logger.debug('Sleeping for 30000 ms before retrying');
        await this.delay(30000); // Wait 30 seconds before retrying
      }
    }
    logger.info('Comment-only bot cycle completed');
    await this.cleanup();
  }

  async getForumCategories() {
    logger.debug('Checking FORUM_CATEGORIES from env...');
    const categoriesFromEnv = process.env.FORUM_CATEGORIES?.split(',').map(cat => cat.trim()) || [];
    logger.debug('FORUM_CATEGORIES:', categoriesFromEnv);
    if (categoriesFromEnv.length > 0) {
      logger.debug('Using categories from env');
      return categoriesFromEnv;
    }
    logger.debug('Scraping categories from forum...');
    return await this.forumScraper.scrapeCategories(this.page);
  }

  async createForumPost(category, content) {
    logger.info(`Creating post in category: ${category}`);
    logger.debug('Post content:', content);
    try {
      // Navigate to the category (adjust URL structure based on your forum)
      const categoryUrl = `${this.config.forumUrl}/forum/${encodeURIComponent(category.toLowerCase().replace(/\s+/g, '-'))}`;
      logger.debug('Navigating to category URL:', categoryUrl);
      await this.page.goto(categoryUrl);
      // Find and click "New Topic" or "Create Post" button
      logger.debug('Waiting for new topic/create post button...');
      // Try to find the button by its text content
      const buttonTexts = ["New Topic", "Create Post", "Start Topic", "Add Topic", "New Discussion"];
      let foundButton = false;
      await this.page.waitForSelector('button, a', { timeout: 15000 });
      const allButtons = await this.page.$$('button, a');
      for (const btn of allButtons) {
        const text = await this.page.evaluate(el => el.textContent.trim(), btn);
        logger.debug('Button text found:', text);
        if (buttonTexts.some(t => text.toLowerCase().includes(t.toLowerCase()))) {
          logger.debug(`Clicking button with text: ${text}`);
          await btn.click();
          foundButton = true;
          break;
        }
      }
      if (!foundButton) {
        logger.error('Could not find new topic/create post button by text. Dumping page HTML for debugging.');
        const html = await this.page.content();
        logger.error('PAGE HTML:', html);
        throw new Error('Could not find new topic/create post button by text');
      }
      // Wait for the post creation form
      logger.debug('Waiting for post creation form...');
      await this.page.waitForSelector('input[name="title"], #title');
      // Fill in the post details
      logger.debug('Typing post title:', content.title);
      await this.page.type('input[name="title"], #title', content.title);
      // Handle different types of content editors
      logger.debug('Finding content editor selector...');
      const contentSelector = await this.page.$('textarea[name="content"]') || 
                             await this.page.$('#content') || 
                             await this.page.$('.editor-content') ||
                             await this.page.$('.post-content');
      logger.debug('Content selector found:', !!contentSelector);
      if (contentSelector) {
        logger.debug('Focusing and typing post body');
        await this.page.focus('textarea[name="content"], #content, .editor-content, .post-content');
        await this.page.type('textarea[name="content"], #content, .editor-content, .post-content', content.body);
      }
      // Submit the post
      logger.debug('Submitting post...');
      await Promise.all([
        this.page.waitForNavigation({ timeout: 10000 }),
        this.page.click('button[type="submit"], .submit-post, .create-topic')
      ]);
      logger.info(`Successfully created post: "${content.title}"`);
    } catch (error) {
      logger.error('Error creating forum post:', error);
      throw error;
    }
  }

  async cleanup() {
    logger.info('Cleaning up...');
    logger.debug('Closing browser...');
    if (this.browser) {
      await this.browser.close();
      logger.debug('Browser closed');
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = NeoForumBot;
