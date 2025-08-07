const OpenAI = require('openai');
const logger = require('../utils/logger');

class OpenAIContentGenerator {
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

  async generateForumPost(category) {
    try {
      logger.info(`Generating content for category: ${category}`);
      
      const prompt = this.buildPrompt(category);
      
      const response = await this.openai.chat.completions.create({
        model: 'grok-beta',
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

      const generatedContent = response.choices[0].message.content;
      const { title, body } = this.parseGeneratedContent(generatedContent, category);
      
      logger.info(`Generated post: "${title}"`);
      
      return { title, body };
      
    } catch (error) {
      logger.error('Error generating content with OpenAI/Grok:', error);
      
      // Fallback to template-based generation
      return this.generateFallbackContent(category);
    }
  }

  buildPrompt(category) {
    const prompts = [
      `Create an engaging forum post for the "${category}" category. Include a catchy title and informative content that would spark discussion among community members.`,
      
      `Generate a thoughtful forum post about ${category}. Make it informative and engaging, suitable for a community discussion forum.`,
      
      `Write a forum post for the ${category} section that asks an interesting question or shares useful information that would encourage community participation.`,
      
      `Create a discussion starter for the ${category} forum category. Include both a compelling title and substantive content.`,
      
      `Generate a forum post about ${category} that would be valuable to the community and encourage helpful responses.`
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
        model: 'grok-beta',
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
