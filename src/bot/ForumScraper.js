const cheerio = require('cheerio');
const logger = require('../utils/logger');

class ForumScraper {
  constructor() {
    this.defaultCategories = [
      'General Discussion',
      'Tech Talk',
      'Gaming',
      'Random Thoughts',
      'News & Updates',
      'Help & Support'
    ];
  }

  async scrapeCategories(page) {
    try {
      logger.info('Scraping forum categories...');
      
      const content = await page.content();
      const $ = cheerio.load(content);
      
      const categories = [];
      
      // NeoForum selectors for forum categories
      const categorySelectors = [
        '.forum-category-list .forum-category', // Main category cards
        '.category-list .category',             // Alternate category list
        '.category-card',                       // Card-style categories
        '.category-title',                      // Category titles
        '.forum-category-list a',               // Links to categories
      ];
      
      for (const selector of categorySelectors) {
        $(selector).each((i, element) => {
          const categoryName = $(element).text().trim();
          if (categoryName && !categories.includes(categoryName)) {
            categories.push(categoryName);
          }
        });
        
        if (categories.length > 0) break;
      }
      
      if (categories.length === 0) {
        logger.warn('No categories found, using default categories');
        return this.defaultCategories;
      }
      
      logger.info(`Found ${categories.length} categories:`, categories);
      return categories;
      
    } catch (error) {
      logger.error('Error scraping categories:', error);
      return this.defaultCategories;
    }
  }

  async scrapeRecentPosts(page, forumName, limit = 10) {
    try {
      logger.info(`=== STARTING RECENT POSTS SCRAPING ===`);
      logger.info(`Scraping recent posts for forum: ${forumName}, limit: ${limit}`);
      const content = await page.content();
      logger.debug(`Page content length: ${content.length} characters`);
      logger.debug('CATEGORY PAGE HTML (first 1000 chars):', content.substring(0, 1000));
      
      const $ = cheerio.load(content);
      const recentPosts = [];
      
      logger.debug('Looking for .rounded-lg.group elements...');
      const roundedElements = $("div.rounded-lg.group");
      logger.debug(`Found ${roundedElements.length} .rounded-lg.group elements`);
      
      // Match post creation logic: scrape .rounded-lg.group, anchor with /forum/ and /post/ in href, title from h3 inside anchor
      $("div.rounded-lg.group").each((i, el) => {
        logger.debug(`Processing rounded element ${i + 1}...`);
        
        const anchors = $(el).find('a');
        logger.debug(`Found ${anchors.length} anchors in element ${i + 1}`);
        
        const anchor = $(el).find('a').filter((j, a) => {
          const href = $(a).attr('href');
          const hasForumAndPost = href && href.includes('/forum/') && href.includes('/post/');
          logger.debug(`Anchor ${j + 1}: href="${href}", hasForumAndPost=${hasForumAndPost}`);
          return hasForumAndPost;
        }).first();
        
        if (anchor.length > 0) {
          const href = anchor.attr('href');
          const h3 = anchor.find('h3');
          const title = h3.length > 0 ? h3.text().trim() : '';
          logger.debug(`Found valid anchor: title="${title}", href="${href}"`);
          
          // Try to get content preview from the post card
          let contentPreview = '';
          const contentSelectors = [
            '.post-preview, .post-excerpt',
            '.content-preview',
            'p',
            '.description',
            '.summary'
          ];
          
          for (const selector of contentSelectors) {
            const preview = $(el).find(selector).first().text().trim();
            if (preview && preview.length > 20 && preview.length < 300) {
              contentPreview = preview;
              logger.debug(`Found content preview with selector "${selector}": ${preview.substring(0, 50)}...`);
              break;
            }
          }
          
          // Get author if available
          let author = '';
          const authorSelectors = ['.author, .username, .poster, [class*="user"]'];
          for (const selector of authorSelectors) {
            const authorEl = $(el).find(selector).first().text().trim();
            if (authorEl) {
              author = authorEl;
              logger.debug(`Found author with selector "${selector}": ${author}`);
              break;
            }
          }
          
          if (title && href) {
            const postData = { 
              title, 
              link: href, 
              content: contentPreview,
              author: author
            };
            recentPosts.push(postData);
            logger.debug(`✅ Successfully scraped post ${recentPosts.length}:`, {
              title: title.substring(0, 50) + '...',
              hasContent: !!contentPreview,
              contentLength: contentPreview.length,
              hasAuthor: !!author,
              link: href
            });
          } else {
            logger.debug(`❌ Skipping post due to missing title or href: title="${title}", href="${href}"`);
          }
        } else {
          logger.debug(`No valid anchors found in element ${i + 1}`);
        }
      });
      // If still no posts, try global search for anchors with /forum/ and /post/ in href
      if (recentPosts.length === 0) {
        logger.info('No posts found with .rounded-lg.group strategy, trying global anchor search...');
        const allAnchors = $('a');
        logger.debug(`Found ${allAnchors.length} total anchors on page`);
        
        $('a').each((i, a) => {
          const href = $(a).attr('href');
          if (href && href.includes('/forum/') && href.includes('/post/')) {
            let title = '';
            const h3InA = $(a).find('h3');
            if (h3InA.length > 0) {
              title = h3InA.text().trim();
            } else {
              title = $(a).text().trim();
            }
            
            logger.debug(`Global search found anchor: title="${title}", href="${href}"`);
            
            // Try to get content from parent elements
            let contentPreview = '';
            const parent = $(a).parent();
            const contentText = parent.find('p, .content, .preview').first().text().trim();
            if (contentText && contentText.length > 20 && contentText.length < 200) {
              contentPreview = contentText;
            }
            
            if (title && href) {
              recentPosts.push({ 
                title, 
                link: href, 
                content: contentPreview 
              });
              logger.debug(`✅ Global search found post ${recentPosts.length}: ${title.substring(0, 50)}...`);
            }
          }
        });
        
        logger.info(`Global search found ${recentPosts.length} posts`);
      }
      
      // If still no posts, log the page structure for debugging
      if (recentPosts.length === 0) {
        logger.warn('No posts found with any strategy. Analyzing page structure...');
        logger.debug('All div elements with classes:', $('div[class]').map((i, el) => $(el).attr('class')).get().slice(0, 20));
        logger.debug('All links found:', $('a[href]').map((i, el) => $(el).attr('href')).get().slice(0, 10));
        logger.debug('Page title:', $('title').text());
        logger.debug('Looking for common post container patterns...');
        
        // Try some other common patterns
        const commonSelectors = [
          '.post-item',
          '.topic-item', 
          '.discussion-item',
          '.forum-post',
          '[class*="post"]',
          '[class*="topic"]',
          '.card'
        ];
        
        for (const selector of commonSelectors) {
          const elements = $(selector);
          if (elements.length > 0) {
            logger.debug(`Found ${elements.length} elements with selector: ${selector}`);
          }
        }
      }
      // Limit results
      if (recentPosts.length > limit) {
        recentPosts.splice(limit); // Remove elements beyond limit instead of reassigning
      }
      
      logger.info(`=== RECENT POSTS SCRAPING COMPLETE ===`);
      logger.info(`Found ${recentPosts.length} recent posts in total`);
      logger.debug('Final recent posts data:', recentPosts.map((p, i) => ({
        index: i + 1,
        title: p.title.substring(0, 40) + '...',
        hasContent: !!p.content,
        contentLength: p.content?.length || 0,
        hasAuthor: !!p.author,
        link: p.link
      })));
      
      return recentPosts;
    } catch (error) {
      logger.error('=== ERROR IN RECENT POSTS SCRAPING ===');
      logger.error('Error type:', error.constructor.name);
      logger.error('Error message:', error.message);
      logger.error('Error stack:', error.stack);
      logger.error('Forum name:', forumName);
      logger.error('Limit:', limit);
      
      // Try to get some basic page information for debugging
      try {
        const pageTitle = await page.title();
        const currentUrl = page.url();
        logger.error('Current page title:', pageTitle);
        logger.error('Current URL:', currentUrl);
      } catch (pageError) {
        logger.error('Could not get page information:', pageError.message);
      }
      
      return [];
    }
  }

  async scrapeForumStats(page) {
    try {
      const content = await page.content();
      const $ = cheerio.load(content);
      
      const stats = {
        totalPosts: this.extractNumber($, '.total-posts, .post-count'),
        totalUsers: this.extractNumber($, '.total-users, .user-count'),
        onlineUsers: this.extractNumber($, '.online-users, .users-online'),
        totalTopics: this.extractNumber($, '.total-topics, .topic-count')
      };
      
      logger.info('Forum stats:', stats);
      return stats;
      
    } catch (error) {
      logger.error('Error scraping forum stats:', error);
      return {};
    }
  }

  extractNumber(cheerioInstance, selector) {
    const text = cheerioInstance(selector).text();
    const match = text.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  extractTimestamp(element) {
    const timeSelectors = ['.timestamp', '.post-time', '.date', '[data-time]'];
    
    for (const selector of timeSelectors) {
      const timeElement = element.find(selector).first();
      if (timeElement.length > 0) {
        return timeElement.text().trim() || timeElement.attr('data-time');
      }
    }
    
    return null;
  }

  resolveUrl(url, baseUrl) {
    if (url.startsWith('http')) {
      return url;
    }
    
    const base = new URL(baseUrl);
    return new URL(url, base.origin).href;
  }

  async getPostContent(page, postUrl) {
    try {
      await page.goto(postUrl);
      // Wait for a reliable selector before scraping
      await page.waitForSelector('.post-content, .message-content, .post-body, h1, .topic-title', { timeout: 15000 });
      const content = await page.content();
      const $ = cheerio.load(content);

      // Robust selector fallbacks for title
      let title = $('.post-title, .topic-title, h1').first().text().trim();
      if (!title) {
        title = $('title').text().trim();
      }
      
      // Robust selector fallbacks for body
      let body = $('.post-content, .message-content, .post-body').first().text().trim();
      if (!body) {
        body = $('article').text().trim();
      }
      if (!body) {
        // Try more flexible selectors
        body = $('.card, .rounded-lg, .group').first().text().trim();
      }
      if (!body) {
        body = $('p').first().text().trim();
      }
      if (!body) {
        // Log a snippet of the HTML for debugging
        logger.error('Post body not found. HTML snippet:', content.slice(0, 1000));
      }
      
      // Author and timestamp
      let author = $('.post-author, .username').first().text().trim();
      if (!author) {
        author = $('[class*="author"], [class*="user"], .user-info').first().text().trim();
      }
      let timestamp = $('.post-time, .timestamp').first().text().trim();
      if (!timestamp) {
        timestamp = $('[class*="date"], [data-time]').first().text().trim();
      }

      // Scrape existing comments with multiple selector strategies
      const comments = [];
      const commentSelectors = [
        '.comment, .reply',
        '.comment-content, .reply-content',
        '.post-comment',
        '.message-reply',
        '[class*="comment"]',
        '.comment-body, .reply-body'
      ];
      
      for (const selector of commentSelectors) {
        $(selector).each((i, element) => {
          const commentText = $(element).text().trim();
          if (commentText && commentText.length > 10 && commentText.length < 500) {
            // Avoid duplicates and overly short/long comments
            if (!comments.includes(commentText)) {
              comments.push(commentText);
            }
          }
        });
        if (comments.length >= 5) break; // Limit to 5 comments for context
      }
      
      logger.debug(`Found ${comments.length} existing comments for post: ${title}`);
      logger.debug('Comments preview:', comments.map((c, i) => `${i+1}. ${c.substring(0, 50)}...`));

      // If no body, consider post not found
      if (!body) {
        logger.warn('Could not find post body for:', postUrl);
        return null;
      }

      const postContent = {
        title,
        content: body,
        author,
        timestamp,
        comments: comments.slice(0, 5), // Limit to first 5 comments
        url: postUrl
      };
      
      logger.info(`=== POST CONTENT SCRAPING COMPLETE ===`);
      logger.info(`Successfully scraped post: "${title}"`);
      logger.debug('Final post content structure:', {
        title: postContent.title,
        contentLength: postContent.content.length,
        commentsCount: postContent.comments.length,
        hasAuthor: !!postContent.author,
        hasTimestamp: !!postContent.timestamp,
        url: postContent.url
      });
      logger.debug('Post content preview:', {
        contentStart: postContent.content.substring(0, 100) + '...',
        commentsPreview: postContent.comments.map(c => c.substring(0, 30) + '...')
      });
      
      return postContent;
    } catch (error) {
      logger.error('Error getting post content:', error);
      return null;
    }
  }
}

module.exports = ForumScraper;
