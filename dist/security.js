/**
 * Security utilities for Load More Extension
 * Provides input validation, sanitization, and rate limiting
 */

class SecurityUtils {
  constructor() {
    this.rateLimiter = new Map();
    this.maxRequestsPerMinute = 30;
    this.validMessageTypes = new Set(['SCAN_PAGE', 'EXPAND_CONTENT', 'STOP_EXPANSION']);
  }

  /**
   * Validates message structure and content
   */
  validateMessage(message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'Invalid message format' };
    }

    if (!message.type || typeof message.type !== 'string') {
      return { valid: false, error: 'Missing or invalid message type' };
    }

    if (!this.validMessageTypes.has(message.type)) {
      return { valid: false, error: 'Unknown message type' };
    }

    // Validate tab ID if present
    if (message.tabId !== undefined) {
      if (!Number.isInteger(message.tabId) || message.tabId < 0) {
        return { valid: false, error: 'Invalid tab ID' };
      }
    }

    return { valid: true };
  }

  /**
   * Sanitizes text content to prevent XSS
   */
  sanitizeText(text) {
    if (typeof text !== 'string') {
      return '';
    }
    
    return text
      .replace(/[<>'"&]/g, (char) => {
        const entities = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        };
        return entities[char];
      })
      .slice(0, 1000); // Limit length
  }

  /**
   * Validates DOM element selectors
   */
  validateSelector(selector) {
    if (typeof selector !== 'string' || selector.length === 0) {
      return false;
    }

    // Block dangerous selectors
    const dangerousPatterns = [
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /on\w+=/i,
      /<script/i,
      /eval\(/i,
      /expression\(/i
    ];

    return !dangerousPatterns.some(pattern => pattern.test(selector));
  }

  /**
   * Rate limiting check
   */
  checkRateLimit(identifier) {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    if (!this.rateLimiter.has(identifier)) {
      this.rateLimiter.set(identifier, []);
    }

    const requests = this.rateLimiter.get(identifier);
    
    // Remove old requests
    const recentRequests = requests.filter(time => time > windowStart);
    this.rateLimiter.set(identifier, recentRequests);

    if (recentRequests.length >= this.maxRequestsPerMinute) {
      return { allowed: false, error: 'Rate limit exceeded' };
    }

    recentRequests.push(now);
    return { allowed: true };
  }

  /**
   * Validates URL for security
   */
  validateUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Only allow http and https
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Block localhost and private IPs in production
      const hostname = urlObj.hostname.toLowerCase();
      if (hostname === 'localhost' || 
          hostname.startsWith('127.') ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Secure element query with validation
   */
  secureQuerySelector(selector, context = document) {
    if (!this.validateSelector(selector)) {
      throw new Error('Invalid selector');
    }

    try {
      return context.querySelector(selector);
    } catch (error) {
      console.error('Selector query failed:', error);
      return null;
    }
  }

  /**
   * Secure element query all with validation
   */
  secureQuerySelectorAll(selector, context = document) {
    if (!this.validateSelector(selector)) {
      throw new Error('Invalid selector');
    }

    try {
      return Array.from(context.querySelectorAll(selector));
    } catch (error) {
      console.error('Selector query failed:', error);
      return [];
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityUtils;
} else if (typeof window !== 'undefined') {
  window.SecurityUtils = SecurityUtils;
}