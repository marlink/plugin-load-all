/**
 * Detection Module - Handles page analysis and pattern detection
 * Separated from execution logic for better code organization
 */

// Import centralized selectors
import { SELECTORS } from './selectors.js';
import { queryElements } from './utils.js';

/**
 * Analyzes page content to detect load more patterns
 * @returns {Object} Analysis results with detected patterns
 */
export function analyzePageContent() {
  const patterns = {
    buttons: [],
    links: [],
    pagination: false,
    lazyLoad: false,
    infiniteScroll: false,
    hiddenContent: false
  };

  try {
    // Find all clickable elements that might be load more buttons
    const clickableElements = queryElements(SELECTORS.CLICKABLE_ELEMENTS);
    
    clickableElements.forEach(element => {
      const text = element.textContent?.toLowerCase().trim() || '';
      const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
      const className = element.className?.toLowerCase() || '';
      const id = element.id?.toLowerCase() || '';
      
      // Check for load more text patterns
      const loadMorePatterns = [
        'load more', 'show more', 'view more', 'see more', 'read more',
        'more results', 'more items', 'more posts', 'more content',
        'load additional', 'show additional', 'expand', 'continue'
      ];
      
      const matchesLoadMore = loadMorePatterns.some(pattern => 
        text.includes(pattern) || ariaLabel.includes(pattern) || 
        className.includes(pattern.replace(' ', '-')) || 
        id.includes(pattern.replace(' ', '-'))
      );
      
      if (matchesLoadMore) {
        const confidence = calculateElementConfidence(element, text, className, ariaLabel);
        const selector = generateElementSelector(element);
        
        if (element.tagName.toLowerCase() === 'button') {
          patterns.buttons.push({
            element,
            selector,
            text: text.slice(0, 50),
            confidence,
            visible: isElementVisible(element)
          });
        } else if (element.tagName.toLowerCase() === 'a') {
          patterns.links.push({
            element,
            selector,
            text: text.slice(0, 50),
            href: element.href || '',
            confidence,
            visible: isElementVisible(element)
          });
        }
      }
    });

    // Detect pagination
    patterns.pagination = queryElements(SELECTORS.PAGINATION, document, true) !== null;
    
    // Detect lazy-loaded images
    const lazyLoadedImages = queryElements(SELECTORS.LAZY_IMAGES);
    patterns.lazyLoad = lazyLoadedImages.length > 0;
    
    // Detect infinite scroll indicators
    patterns.infiniteScroll = detectInfiniteScroll();
    
    // Detect hidden content
    const hiddenElements = queryElements(SELECTORS.HIDDEN_CONTENT);
    patterns.hiddenContent = hiddenElements.length > 0;

    // Count content items
    const contentElements = queryElements(SELECTORS.CONTENT_CONTAINERS);
    const maxContentCount = contentElements.length;

    // Sort buttons and links by confidence
    patterns.buttons.sort((a, b) => b.confidence - a.confidence);
    patterns.links.sort((a, b) => b.confidence - a.confidence);

    return {
      patterns,
      contentCount: maxContentCount,
      timestamp: Date.now(),
      url: window.location.href
    };

  } catch (error) {
    console.error('Error during page analysis:', error);
    return {
      patterns,
      contentCount: 0,
      timestamp: Date.now(),
      url: window.location.href,
      error: error.message
    };
  }
}

/**
 * Calculates confidence score for a potential load more element
 * @param {Element} element - The element to analyze
 * @param {string} text - Element text content
 * @param {string} className - Element class names
 * @param {string} ariaLabel - Element aria label
 * @returns {number} Confidence score (0-100)
 */
function calculateElementConfidence(element, text, className, ariaLabel) {
  let confidence = 0;
  
  // Base confidence for matching text
  if (text.includes('load more') || text.includes('show more')) confidence += 40;
  else if (text.includes('more')) confidence += 25;
  else if (text.includes('load') || text.includes('show')) confidence += 15;
  
  // Bonus for specific class names
  if (className.includes('load-more') || className.includes('show-more')) confidence += 30;
  else if (className.includes('more') || className.includes('expand')) confidence += 15;
  
  // Bonus for aria labels
  if (ariaLabel.includes('load more') || ariaLabel.includes('show more')) confidence += 20;
  
  // Bonus for visibility
  if (isElementVisible(element)) confidence += 10;
  
  // Penalty for disabled elements
  if (element.disabled || element.getAttribute('aria-disabled') === 'true') confidence -= 20;
  
  return Math.min(100, Math.max(0, confidence));
}

/**
 * Detects infinite scroll patterns on the page
 * @returns {boolean} True if infinite scroll is detected
 */
function detectInfiniteScroll() {
  // Check for common infinite scroll indicators
  const infiniteScrollSelectors = [
    '[class*="infinite"]',
    '[data-infinite]',
    '[class*="endless"]',
    '[data-endless]'
  ];
  
  return infiniteScrollSelectors.some(selector => 
    queryElements(selector, document, true) !== null
  );
}

/**
 * Generates a unique CSS selector for an element
 * @param {Element} element - The element to generate selector for
 * @returns {string} CSS selector string
 */
function generateElementSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }
  
  if (element.className) {
    const classes = element.className.split(' ').filter(c => c.trim());
    if (classes.length > 0) {
      return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
    }
  }
  
  // Fallback to nth-child selector
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(element) + 1;
    return `${element.tagName.toLowerCase()}:nth-child(${index})`;
  }
  
  return element.tagName.toLowerCase();
}

/**
 * Checks if an element is visible to the user
 * @param {Element} element - The element to check
 * @returns {boolean} True if element is visible
 */
function isElementVisible(element) {
  if (!element) return false;
  
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}