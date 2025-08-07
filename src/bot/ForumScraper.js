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
      logger.info(`=== GETTING POST CONTENT FROM: ${postUrl} ===`);
      await page.goto(postUrl, { waitUntil: 'networkidle2' });
      
      // Wait for the page to fully load and render
      await page.waitForTimeout(3000);
      
      // Wait for content to be rendered (not just the initial HTML)
      await page.waitForFunction(() => {
        // Check if the page has actual content rendered, not just hydration data
        const body = document.body.innerText;
        return body && body.length > 100 && !body.includes('$undefined') && !body.includes('__className_');
      }, { timeout: 30000 });
      
      // Get the rendered content from the browser (not raw HTML)
      const renderedContent = await page.evaluate(() => {
        // Return the actual rendered text content, not HTML source
        return {
          bodyText: document.body.innerText,
          bodyHTML: document.body.innerHTML,
          title: document.title
        };
      });
      
      logger.debug(`Rendered content length: ${renderedContent.bodyText.length} characters`);
      logger.debug('Rendered content preview:', renderedContent.bodyText.substring(0, 200));
      
      // Load the rendered HTML for parsing
      const $ = cheerio.load(renderedContent.bodyHTML);
      logger.debug(`Rendered HTML length: ${renderedContent.bodyHTML.length} characters`);

      // Robust selector fallbacks for title - but avoid site title
      let title = '';
      
      // First try to extract title from the rendered text directly
      const fullText = renderedContent.bodyText;
      const textLines = fullText.split('\n').map(line => line.trim());
      
      // Look for title patterns in the text - often appears after navigation
      for (let i = 0; i < textLines.length && i < 20; i++) {
        const line = textLines[i];
        // Skip navigation and UI elements
        if (line.length > 10 && line.length < 100 &&
            !line.toLowerCase().includes('neoforum') &&
            !line.toLowerCase().includes('explore') &&
            !line.toLowerCase().includes('dashboard') &&
            !line.toLowerCase().includes('back to forum') &&
            !line.toLowerCase().includes('home') &&
            !line.toLowerCase().includes('/') &&
            !line.toLowerCase().includes('score') &&
            !line.toLowerCase().includes('music') &&
            !line.toLowerCase().includes('topic starter') &&
            !line.toLowerCase().includes('edited') &&
            !line.match(/^August \d+, \d+/) &&
            line.split(' ').length > 2 && line.split(' ').length < 15) {
          
          // This might be our title
          title = line.trim();
          logger.debug(`Found potential title from rendered text: "${title}"`);
          break;
        }
      }
      
      // Fallback to HTML selectors if text extraction didn't work
      if (!title) {
        const titleSelectors = [
          '.post-title',
          '.topic-title', 
          '.discussion-title',
          'article h1',
          'main h1',
          '.content h1',
          'h1:not(.site-title):not(.forum-title)',
          'h2',
          'h3'
        ];
        
        for (const selector of titleSelectors) {
          const titleElement = $(selector).first();
          if (titleElement.length > 0) {
            const titleText = titleElement.text().trim();
            // Filter out obvious site/forum titles
            if (titleText && 
                titleText.toLowerCase() !== 'neoforum' &&
                !titleText.toLowerCase().includes('forum') &&
                !titleText.toLowerCase().includes('community') &&
                !titleText.toLowerCase().includes('explore') &&
                !titleText.toLowerCase().includes('dashboard') &&
                titleText.length > 5 && titleText.length < 200) {
              title = titleText;
              logger.debug(`Found valid title with HTML selector "${selector}": "${title}"`);
              break;
            } else {
              logger.debug(`Rejected title "${titleText}" from selector "${selector}" - looks like site/forum title`);
            }
          }
        }
      }
      
      // Fallback to page title but filter
      if (!title) {
        const pageTitle = renderedContent.title || $('title').text().trim();
        logger.debug(`Page title: "${pageTitle}"`);
        // Extract post title from page title (e.g., "Post Title - NeoForum" -> "Post Title")
        if (pageTitle.includes(' - ')) {
          const parts = pageTitle.split(' - ');
          const potentialTitle = parts[0].trim();
          if (potentialTitle.toLowerCase() !== 'neoforum' && 
              !potentialTitle.toLowerCase().includes('forum') &&
              potentialTitle.length > 5) {
            title = potentialTitle;
            logger.debug(`Extracted title from page title: "${title}"`);
          }
        } else if (pageTitle && 
                   pageTitle.toLowerCase() !== 'neoforum' && 
                   !pageTitle.toLowerCase().includes('forum') &&
                   pageTitle.length > 5 && pageTitle.length < 200) {
          title = pageTitle;
          logger.debug(`Using full page title: "${title}"`);
        }
      }
      
      logger.debug(`Final extracted title: "${title}"`);
      
      // Enhanced body extraction with rendered content focus
      let body = '';
      
      // First, try to extract from the rendered text directly with intelligent filtering
      const bodyText = renderedContent.bodyText;
      logger.debug(`Full rendered text length: ${bodyText.length}`);
      
      // Split into lines and filter out navigation/UI elements
      const lines = bodyText.split('\n')
        .map(line => line.trim())
        .filter(line => 
          line.length > 20 && // Must be substantial
          !line.toLowerCase().includes('neoforum') &&
          !line.toLowerCase().includes('community based around') &&
          !line.toLowerCase().includes('navigate') &&
          !line.toLowerCase().includes('login') &&
          !line.toLowerCase().includes('register') &&
          !line.toLowerCase().includes('search') &&
          !line.toLowerCase().includes('home') &&
          !line.toLowerCase().includes('explore') &&
          !line.toLowerCase().includes('dashboard') &&
          !line.toLowerCase().includes('back to forum') &&
          !line.toLowerCase().includes('©') &&
          !line.toLowerCase().includes('privacy') &&
          !line.toLowerCase().includes('terms') &&
          !line.toLowerCase().includes('forum description') &&
          !line.toLowerCase().includes('score') &&
          !line.toLowerCase().includes('topic starter') &&
          !line.toLowerCase().includes('edited') &&
          !line.toLowerCase().includes('music') &&
          !line.includes('$') && // Avoid React hydration data
          !line.includes('__className_') &&
          !line.includes('$undefined') &&
          !line.includes('dangerouslySetInnerHTML') &&
          !line.match(/^\d+\s+score$/) && // Filter out score lines
          !line.match(/^August \d+, \d+/) && // Filter out date lines
          !line.includes('/')  // Filter out breadcrumb navigation
        );
      
      logger.debug(`Filtered to ${lines.length} meaningful lines`);
      
      // Look for the main post content in the filtered lines
      if (lines.length > 0) {
        logger.debug('Filtered lines:', lines.slice(0, 10)); // Log first 10 filtered lines for debugging
        
        // Find lines that look like actual post content (longer, more conversational)
        // But also accept shorter lines if they seem to be the main content
        const postLines = lines.filter(line => {
          const words = line.split(' ');
          return (
            (line.length > 30 && words.length > 5) && // Substantial content
            !line.toLowerCase().includes('reply') &&
            !line.toLowerCase().includes('quote') &&
            !line.toLowerCase().includes('edit') &&
            !line.toLowerCase().includes('share') &&
            !line.toLowerCase().includes('like') &&
            !line.toLowerCase().includes('report') &&
            !line.toLowerCase().includes('delete') &&
            !line.toLowerCase().includes('bookmark') &&
            // Exclude lines that are just post titles repeated
            !line.toLowerCase().includes('weekly') ||
            // Allow some specific content patterns even if shorter
            line.toLowerCase().includes('discussion') ||
            line.toLowerCase().includes('looking forward') ||
            line.toLowerCase().includes('everyone') ||
            line.toLowerCase().includes('thoughts') ||
            line.toLowerCase().includes('opinion') ||
            line.toLowerCase().includes('what do you think')
          );
        });
        
        logger.debug(`Found ${postLines.length} potential post content lines:`, postLines);
        
        if (postLines.length > 0) {
          // Take the first few substantial lines as the post content
          body = postLines.slice(0, 5).join(' ').trim();
          logger.info(`✅ Found post content from rendered text (${body.length} chars)`);
        } else if (lines.length > 0) {
          // Fallback: if no "conversational" lines found, take the longest meaningful lines
          const meaningfulLines = lines
            .filter(line => line.length > 25 && line.split(' ').length > 4)
            .sort((a, b) => b.length - a.length) // Sort by length, longest first
            .slice(0, 3); // Take top 3 longest lines
          
          if (meaningfulLines.length > 0) {
            body = meaningfulLines.join(' ').trim();
            logger.warn(`⚠️ Using fallback meaningful lines as post content (${body.length} chars)`);
          }
        }
      }
      
      // Fallback to HTML parsing if rendered text extraction didn't work
      if (!body || body.length < 100) {
        logger.warn('Rendered text extraction insufficient, trying HTML parsing...');
        
        const bodySelectors = [
          // Most specific - actual post content containers
          '.post-content',
          '.message-content', 
          '.post-body',
          '.topic-content',
          '.discussion-content',
          '.user-content',
          
          // Content within specific post containers
          '.post .content',
          '.message .content',
          '.topic .content',
          'article.post',
          'article.message',
          
          // Main content area but exclude headers/navigation
          'main .content:not(.forum-description):not(.category-description)',
          '.main-content:not(.forum-description):not(.category-description)'
        ];
      
        for (const selector of bodySelectors) {
          logger.debug(`Trying body selector: ${selector}`);
          const element = $(selector);
          if (element.length > 0) {
            const textContent = element.text().trim();
            logger.debug(`Found content with selector "${selector}": ${textContent.length} chars - "${textContent.substring(0, 100)}..."`);
            
            // Much stricter validation for post content
            const isValidPostContent = (
              textContent.length > 100 && // Must be substantial
              textContent.split(' ').length > 20 && // Must have enough words
              textContent.split('\n').length < 50 && // Not too many line breaks (avoid navigation)
              // Exclude obvious forum/site content and React hydration data
              !textContent.toLowerCase().includes('neoforum') &&
              !textContent.toLowerCase().includes('community based around') &&
              !textContent.toLowerCase().includes('forum description') &&
              !textContent.toLowerCase().includes('category:') &&
              !textContent.toLowerCase().includes('navigate to') &&
              !textContent.toLowerCase().includes('welcome to') &&
              !textContent.toLowerCase().includes('©') &&
              !textContent.toLowerCase().includes('privacy policy') &&
              !textContent.toLowerCase().includes('terms of service') &&
              !textContent.includes('$undefined') &&
              !textContent.includes('__className_') &&
              !textContent.includes('dangerouslySetInnerHTML') &&
              !textContent.includes('$L') && // React components
              // Must not be mostly navigation links
              (textContent.match(/http/g) || []).length < textContent.split(' ').length * 0.1
            );
            
            if (isValidPostContent) {
              body = textContent;
              logger.info(`✅ Found valid post body with HTML selector "${selector}" (${body.length} chars)`);
              break;
            } else {
              logger.debug(`❌ Rejected content from selector "${selector}" - failed validation checks`);
            }
          }
        }
      }
      
      // If still no body, try to find the main post specifically
      if (!body) {
        logger.warn('No specific post content found, trying post-specific search...');
        
        // Look for post containers specifically
        const postContainers = [
          '.post-container .content',
          '.message-container .content',
          '.topic-container .content',
          '[data-post-id] .content',
          '[class*="post-"] .content'
        ];
        
        for (const selector of postContainers) {
          const element = $(selector);
          if (element.length > 0) {
            const textContent = element.text().trim();
            logger.debug(`Post container "${selector}" found: ${textContent.length} chars`);
            
            // Filter the content more aggressively
            const filteredContent = textContent
              .replace(/neoforum/gi, '')
              .replace(/community based around.*?friends/gi, '')
              .replace(/forum description.*?\./gi, '')
              .trim();
            
            if (filteredContent.length > 50 && filteredContent.split(' ').length > 10) {
              body = filteredContent;
              logger.warn(`⚠️ Using filtered post container content: "${selector}"`);
              break;
            }
          }
        }
      }
      
      // Final emergency fallback - with aggressive filtering
      if (!body) {
        logger.error('Still no post body found, using emergency fallback with aggressive filtering...');
        
        // Get all text content but aggressively filter
        const allText = $('body').text();
        const filteredText = allText
          .replace(/neoforum/gi, '')
          .replace(/community based around.*?friends/gi, '')
          .replace(/forum description.*?\./gi, '')
          .replace(/welcome to.*?forum/gi, '')
          .replace(/category.*?:/gi, '')
          .replace(/navigate.*?to/gi, '')
          .replace(/privacy policy.*?/gi, '')
          .replace(/terms of service.*?/gi, '')
          .trim();
        
        // Try to extract meaningful paragraphs from the filtered text
        const sentences = filteredText.split(/[.!?]+/)
          .map(s => s.trim())
          .filter(s => s.length > 30 && 
                      s.split(' ').length > 5 &&
                      !s.toLowerCase().includes('forum') &&
                      !s.toLowerCase().includes('community') &&
                      !s.toLowerCase().includes('navigate'))
          .slice(0, 3); // Take first 3 meaningful sentences
        
        if (sentences.length > 0) {
          body = sentences.join('. ') + '.';
          logger.warn(`⚠️ Using emergency filtered fallback (${body.length} chars): "${body.substring(0, 100)}..."`);
        }
      }
      
      // If we still have obvious forum content or React data, reject it entirely
      if (body) {
        const suspiciousPatterns = [
          'neoforum',
          'community based around',
          'furry best friends',
          'forum description',
          'welcome to',
          '$undefined',
          '__className_',
          'dangerouslySetInnerHTML',
          '$L',
          'precedence',
          'crossOrigin',
          'nonce'
        ];
        
        const hasSuspiciousContent = suspiciousPatterns.some(pattern => 
          body.toLowerCase().includes(pattern.toLowerCase())
        );
        
        if (hasSuspiciousContent) {
          logger.error(`❌ Rejecting extracted content - contains forum description or React hydration patterns`);
          logger.debug(`Rejected content: "${body.substring(0, 200)}..."`);
          body = '';
        }
      }
      
      if (!body) {
        logger.error('❌ Could not find any valid post content after all attempts');
        // Log a snippet of the HTML for debugging
        logger.error('HTML structure analysis:');
        logger.debug('Available elements with content:');
        $('*').each((i, el) => {
          if (i < 10) { // Limit to first 10 elements
            const tagName = el.tagName;
            const className = $(el).attr('class') || '';
            const textContent = $(el).text().trim();
            if (textContent.length > 20 && textContent.length < 200) {
              logger.debug(`${tagName}.${className}: "${textContent.substring(0, 100)}..."`);
            }
          }
        });
        return null;
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
