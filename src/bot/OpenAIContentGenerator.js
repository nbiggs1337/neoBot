const OpenAI = require('openai');
const logger = require('../utils/logger');

class OpenAIContentGenerator {
  async generateComment(post, recentPosts = []) {
    try {
      logger.info(`=== COMMENT GENERATION START ===`);
      logger.info(`Generating comment for post: "${post.title}"`);
      logger.info(`Recent posts context provided: ${recentPosts.length} posts`);
      
      // Log the actual post content being analyzed
      logger.info(`=== TARGET POST CONTENT ANALYSIS ===`);
      logger.info(`Post title: "${post.title}"`);
      logger.info(`Post content length: ${post.content?.length || 0} characters`);
      logger.info(`Post content preview: "${(post.content || '').substring(0, 200)}..."`);
      logger.info(`Post author: ${post.author || 'unknown'}`);
      logger.info(`Post timestamp: ${post.timestamp || 'unknown'}`);
      
      logger.debug('Target post data received:', {
        title: post.title,
        contentLength: post.content?.length || 0,
        hasExistingComments: !!post.comments,
        existingCommentsCount: post.comments?.length || 0,
        author: post.author,
        timestamp: post.timestamp,
        url: post.url
      });
      
      logger.debug('Recent posts context received:', recentPosts.map(p => ({
        title: p.title,
        hasContent: !!p.content,
        contentLength: p.content?.length || 0,
        author: p.author
      })));
      
      // Build context from recent posts in the same category
      let contextText = '';
      if (recentPosts && recentPosts.length > 0) {
        const otherPosts = recentPosts.filter(p => p.title !== post.title).slice(0, 3);
        logger.debug(`Filtered ${otherPosts.length} other posts for context (excluding target post)`);
        
        if (otherPosts.length > 0) {
          contextText = '\n\nRecent posts in this category for context:\n' + 
                       otherPosts.map((p, i) => `${i+1}. ${p.title}: ${(p.content || '').substring(0, 150)}...`).join('\n');
          logger.debug('Built context text length:', contextText.length);
        }
      }
      
      // Include existing comments if available
      let existingCommentsText = '';
      if (post.comments && post.comments.length > 0) {
        logger.info(`Found ${post.comments.length} existing comments on this post`);
        existingCommentsText = '\n\nExisting comments on this post:\n' + 
                              post.comments.slice(0, 3).map((c, i) => `Comment ${i+1}: ${c.substring(0, 100)}...`).join('\n');
        logger.debug('Built existing comments text length:', existingCommentsText.length);
      } else {
        logger.info('No existing comments found on this post');
      }
      
      const prompt = `Read the following forum post and write a thoughtful, relevant comment that adds value to the discussion. Your comment should be engaging, constructive, and encourage further conversation.

Title: ${post.title}
Content: ${post.content}${contextText}${existingCommentsText}

Guidelines:
- Write a natural, conversational comment
- Add new insights or ask thoughtful questions
- Avoid repeating what's already been said
- Keep it concise but meaningful
- Be respectful and community-minded

Reply with a single comment only:`;

      logger.info('=== SENDING TO GROK AI ===');
      logger.info(`Prompt length: ${prompt.length} characters`);
      logger.debug('Full prompt being sent to Grok:', prompt);
      
      const response = await this.openai.chat.completions.create({
        model: 'grok-2-1212',
        messages: [
          {
            role: 'system',
            content: 'You are an engaged community member who writes thoughtful, insightful comments on forum posts. Your comments add value to discussions, ask good questions, share relevant experiences, and encourage others to participate. Write naturally and conversationally, address some part of the post in the reply.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 250,
        temperature: 0.8
      });
      
      logger.info('=== RECEIVED FROM GROK AI ===');
      logger.debug('Raw Grok response:', JSON.stringify(response, null, 2));
      if (!response || !response.choices || !response.choices[0] || !response.choices[0].message || !response.choices[0].message.content) {
        logger.error('Grok response missing expected comment content:', response);
        throw new Error('Grok response missing expected comment content');
      }
      
      const comment = response.choices[0].message.content.trim();
      logger.info(`=== COMMENT GENERATION SUCCESS ===`);
      logger.info(`Generated comment length: ${comment.length} characters`);
      logger.info(`Generated comment preview: ${comment.substring(0, 100)}...`);
      logger.debug(`Full generated comment: ${comment}`);
      
      return comment;
    } catch (error) {
      logger.error('=== COMMENT GENERATION ERROR ===');
      logger.error('Error generating comment with Grok AI:', error && error.stack ? error.stack : error);
      logger.info('Falling back to template-based comment generation');
      
      // Fallback to template-based comment
      const fallbackComment = this.generateFallbackComment(post.title || 'the topic');
      logger.info(`Fallback comment generated: ${fallbackComment}`);
      return fallbackComment;
    }
  }
  constructor(apiKey, baseUrl = 'https://api.x.ai/v1') {
    this.openai = new OpenAI({
      apiKey: apiKey,
      baseURL: baseUrl
    });
    
    this.topicTemplates = [
      'Discussion about {category}',
      'What are your thoughts on {category}?',
      'Latest trends in {category}',
      'Best practices for {category}',
      'Community insights on {category}',
      'Exploring {category} together',
      'Weekly {category} roundup',
      'Tips and tricks for {category}'
    ];
  }

  async generateForumPost(category, content) {
    try {
      logger.info(`Generating content for category: ${category}`);
      let recentPostsText = '';
      if (content && Array.isArray(content) && content.length > 0) {
        recentPostsText = content.map((p, i) => `Post ${i+1}: ${p.title}\n${p.content || ''}`).join('\n---\n');
      }
      const prompt = this.buildPrompt(category, recentPostsText);
      logger.debug('OpenAI prompt:', prompt);
      const response = await this.openai.chat.completions.create({
        model: 'grok-2-1212',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful community member creating engaging forum posts. Generate original, thoughtful content that encourages discussion and follows community guidelines.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.8
      });
      logger.debug('OpenAI response:', response);
      if (!response || !response.choices || !response.choices[0] || !response.choices[0].message || !response.choices[0].message.content) {
        logger.error('OpenAI response missing expected content:', response);
        throw new Error('OpenAI response missing expected content');
      }
      const generatedContent = response.choices[0].message.content;
      const { title, body } = this.parseGeneratedContent(generatedContent, category);
      logger.info(`Generated post: "${title}"`);
      return { title, body };
    } catch (error) {
      logger.error('Error generating content with OpenAI/Grok:', error && error.stack ? error.stack : error);
      // Fallback to template-based generation
      return this.generateFallbackContent(category);
    }
  }

  buildPrompt(category, recentPostsText) {
    let contextBlock = '';
    if (recentPostsText) {
      contextBlock = `Here are the most recent posts in the "${category}" category:\n${recentPostsText}\n---\n`;
    }
    const prompts = [
      `${contextBlock}Create an engaging forum post for the "${category}" category. Include a catchy title and informative content that would spark discussion among community members, and avoid repeating recent topics.`,
      `${contextBlock}Generate a thoughtful forum post about ${category}. Make it informative and engaging, suitable for a community discussion forum, and avoid repeating recent topics.`,
      `${contextBlock}Write a forum post for the ${category} section that asks an interesting question or shares useful information that would encourage community participation, and avoid repeating recent topics.`,
      `${contextBlock}Create a discussion starter for the ${category} forum category. Include both a compelling title and substantive content, and avoid repeating recent topics.`,
      `${contextBlock}Generate a forum post about ${category} that would be valuable to the community and encourage helpful responses, and avoid repeating recent topics.`
    ];
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  parseGeneratedContent(content, category) {
    const lines = content.split('\n').filter(line => line.trim());
    
    let title = '';
    let body = '';
    
    // Try to extract title from the first line or look for "Title:" pattern
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      
      if (firstLine.toLowerCase().startsWith('title:')) {
        title = firstLine.substring(6).trim();
        body = lines.slice(1).join('\n').trim();
      } else if (firstLine.length < 100 && lines.length > 1) {
        title = firstLine;
        body = lines.slice(1).join('\n').trim();
      } else {
        // Generate a title from category if not found
        title = this.generateTitleFromCategory(category);
        body = content.trim();
      }
    }
    
    // Clean up the content
    title = title.replace(/['"]/g, '').trim();
    body = body.replace(/^(Body:|Content:)/i, '').trim();
    
    // Ensure we have both title and body
    if (!title) {
      title = this.generateTitleFromCategory(category);
    }
    
    if (!body) {
      body = this.generateFallbackBody(category);
    }
    
    return { title, body };
  }

  generateTitleFromCategory(category) {
    const template = this.topicTemplates[Math.floor(Math.random() * this.topicTemplates.length)];
    return template.replace('{category}', category);
  }

  generateFallbackContent(category) {
    const title = this.generateTitleFromCategory(category);
    const body = this.generateFallbackBody(category);
    
    return { title, body };
  }

  generateFallbackComment(topic) {
    const fallbackComments = [
      `Great points about ${topic}! I'd love to hear more perspectives on this.`,
      `Thanks for sharing this insight on ${topic}. What do others think?`,
      `Interesting discussion about ${topic}. Has anyone else experienced something similar?`,
      `This is a valuable topic. I'm curious about other approaches to ${topic}.`,
      `Good question about ${topic}! Looking forward to seeing what the community thinks.`,
      `Thanks for bringing up ${topic}. This could lead to some great discussion.`,
      `Thoughtful post about ${topic}. What are your thoughts, community?`,
      `I appreciate you sharing this about ${topic}. Any other insights to add?`
    ];
    
    return fallbackComments[Math.floor(Math.random() * fallbackComments.length)];
  }

  generateFallbackBody(category) {
    const fallbackBodies = [
      `I'd love to hear everyone's thoughts on ${category}. What are your experiences and insights?`,
      
      `Let's discuss ${category}! What are the latest developments or trends you've noticed?`,
      
      `Starting a conversation about ${category}. What would you like to share with the community?`,
      
      `I'm curious about different perspectives on ${category}. What's your take on this topic?`,
      
      `Opening up a discussion on ${category}. Looking forward to hearing from everyone!`
    ];
    
    return fallbackBodies[Math.floor(Math.random() * fallbackBodies.length)];
  }

  async generateTopicIdeas(categories) {
    try {
      const prompt = `Generate 5 engaging forum topic ideas for each of these categories: ${categories.join(', ')}. 
                     Format the response as a JSON object with categories as keys and arrays of topic ideas as values.`;
      
      const response = await this.openai.chat.completions.create({
        model: 'grok-2-1212',
        messages: [
          {
            role: 'system',
            content: 'You are a community manager generating engaging forum topics. Provide diverse, thoughtful topic ideas that encourage community participation.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 800,
        temperature: 0.9
      });

      return JSON.parse(response.choices[0].message.content);
      
    } catch (error) {
      logger.error('Error generating topic ideas:', error);
      return null;
    }
  }
}

module.exports = OpenAIContentGenerator;
