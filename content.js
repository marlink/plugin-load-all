// Content script for Load More Extension
// Runs in the context of web pages to detect and interact with content

// Import modular components
import { queryElements, throttle } from './modules/utils.js';
import { SELECTORS } from './modules/selectors.js';
import { 
  analyzePageContent, 
  isElementVisible, 
  generateElementSelector 
} from './modules/detection.js';
import { 
  executeLoadMore, 
  clickElement, 
  expandHiddenContent 
} from './modules/execution.js';

// Throttled scroll functions for performance
const throttledScrollTo = throttle((x, y) => {
  window.scrollTo(x, y);
}, 100); // 100ms throttle for scroll operations

const throttledScrollIntoView = throttle((element, options) => {
  element.scrollIntoView(options);
}, 150); // 150ms throttle for scrollIntoView

// queryElements function is now imported from utils module

// Cache for page analysis results
const pageAnalysisCache = {
  data: null,
  timestamp: 0,
  url: '',
  domHash: '',
  
  // Cache validity: 30 seconds or until DOM changes significantly
  isValid() {
    const now = Date.now();
    const currentUrl = window.location.href;
    const currentDomHash = this.generateDomHash();
    
    return this.data && 
           (now - this.timestamp < 30000) && 
           this.url === currentUrl &&
           this.domHash === currentDomHash;
  },
  
  // Generate a simple hash of key DOM elements for change detection
  generateDomHash() {
    const keyElements = queryElements(SELECTORS.CACHE_KEY_ELEMENTS);
    return keyElements.length.toString() + document.body.children.length.toString();
  },
  
  set(data) {
    this.data = data;
    this.timestamp = Date.now();
    this.url = window.location.href;
    this.domHash = this.generateDomHash();
  },
  
  get() {
    return this.isValid() ? this.data : null;
  },
  
  clear() {
    this.data = null;
    this.timestamp = 0;
    this.url = '';
    this.domHash = '';
  }
};

// Enhanced global error handler for the extension
window.addEventListener('error', (event) => {
  console.error('Blind nudist Extension: Uncaught error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
    stack: event.error?.stack
  });
  
  // Notify background script of critical errors
  try {
    chrome.runtime.sendMessage({
      type: 'ERROR_REPORT',
      error: {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack,
        url: window.location.href,
        timestamp: Date.now()
      }
    }).catch(() => {
      // Silently handle messaging errors to avoid infinite loops
    });
  } catch (e) {
    // Silently handle chrome.runtime errors
  }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Blind nudist Extension: Unhandled promise rejection:', {
    reason: event.reason,
    promise: event.promise,
    url: window.location.href,
    timestamp: Date.now()
  });
  
  try {
    chrome.runtime.sendMessage({
      type: 'PROMISE_REJECTION',
      error: {
        reason: event.reason?.toString(),
        stack: event.reason?.stack,
        url: window.location.href,
        timestamp: Date.now()
      }
    }).catch(() => {});
  } catch (e) {
    // Silently handle chrome.runtime errors
  }
});

// Auto-scroll to load more buttons when page loads
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(scrollToLoadMoreButton, 1000); // Delay to ensure page is fully loaded
});

// Also handle when page is fully loaded (for cases where DOMContentLoaded already fired)
window.addEventListener('load', () => {
  setTimeout(scrollToLoadMoreButton, 1500); // Slightly longer delay for full page load
});

// Set up mutation observer to detect dynamically loaded content
const setupMutationObserver = () => {
  // Create a throttled version of scrollToLoadMoreButton for the observer
  const throttledCheckForNewButtons = throttle(() => {
    // Only check if we haven't already found and scrolled to a button
    if (!window.loadMoreButtonFound) {
      const pageAnalysis = scanPageContent();
      if (pageAnalysis.patterns.buttons.length > 0 || pageAnalysis.patterns.links.length > 0) {
        scrollToLoadMoreButton();
      }
    }
  }, 1000);

  // Create mutation observer
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    
    // Check if any mutations are relevant (added nodes)
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        shouldCheck = true;
        break;
      }
    }
    
    if (shouldCheck) {
      throttledCheckForNewButtons();
    }
  });
  
  // Start observing with a configuration
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });
  
  return observer;
};

// Initialize mutation observer after page load
window.addEventListener('load', () => {
  // Set a flag to track if we've found a button
  window.loadMoreButtonFound = false;
  
  // Setup the observer with a slight delay
  setTimeout(() => {
    const observer = setupMutationObserver();
    
    // Disconnect after 30 seconds to avoid performance impact
    setTimeout(() => {
      observer.disconnect();
      console.log('Load More Extension: Disconnected mutation observer after timeout');
    }, 30000);
  }, 2000);
  
  // Ensure auto-detection is running
  if (!autoDetectionState.isTracking) {
    autoDetectionState.startAutoDetection();
  }
});

// Function to automatically scroll to the first load more button
function scrollToLoadMoreButton(retryCount = 0) {
  const maxRetries = 5
  const retryDelay = 500
  
  const loadMoreSelectors = [
    'button[class*="load"], button[class*="more"], button[class*="show"]',
    'a[class*="load"], a[class*="more"], a[class*="show"]',
    '[class*="load-more"], [class*="show-more"], [class*="view-more"]',
    '.pagination a, .pager a',
    '[data-testid*="load"], [data-testid*="more"]',
    'button:contains("Load"), button:contains("More"), button:contains("Show")',
    'a:contains("Load"), a:contains("More"), a:contains("Show")'
  ]
  
  let targetElement = null
  
  // Find the best target element
  for (const selector of loadMoreSelectors) {
    try {
      const elements = document.querySelectorAll(selector)
      if (elements.length > 0) {
        // Find the first visible or below-viewport element
        for (const element of elements) {
          const rect = element.getBoundingClientRect()
          const isVisible = rect.width > 0 && rect.height > 0
          const isInOrBelowViewport = rect.top >= -100 // Allow some margin above viewport
          
          if (isVisible && isInOrBelowViewport) {
            targetElement = element
            break
          }
        }
        if (targetElement) break
      }
    } catch (e) {
      // Skip invalid selectors (like :contains which isn't valid CSS)
      continue
    }
  }
  
  if (targetElement) {
    // Calculate position to place button at top of viewport with margin
    const rect = targetElement.getBoundingClientRect()
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const targetY = scrollTop + rect.top - 80 // 80px margin from top
    
    // Use throttled smooth scrolling
    throttledScroll(() => {
      window.scrollTo({
        top: Math.max(0, targetY),
        behavior: 'smooth'
      })
    })
    
    // Add visual highlight
    const originalStyle = targetElement.style.cssText
    const originalTransition = targetElement.style.transition
    
    targetElement.style.transition = 'all 300ms ease'
    targetElement.style.boxShadow = '0 0 0 3px #3B82F6, 0 0 20px rgba(59, 130, 246, 0.3)'
    targetElement.style.transform = 'scale(1.02)'
    
    setTimeout(() => {
      targetElement.style.transition = originalTransition
      targetElement.style.boxShadow = ''
      targetElement.style.transform = ''
      setTimeout(() => {
        targetElement.style.cssText = originalStyle
      }, 300)
    }, 500)
    
    // Verify scroll position after a delay
    setTimeout(() => {
      verifyScrollPosition(targetElement, targetY)
    }, 1000)
    
    return true
  } else if (retryCount < maxRetries) {
    // Retry after delay if no element found
    setTimeout(() => {
      scrollToLoadMoreButton(retryCount + 1)
    }, retryDelay)
    return false
  }
  
  return false
}

// Enhanced scroll functionality for plugin interactions
const scrollManager = {
  // Scroll to content bottom where new content will appear
  scrollToContentBottom(options = {}) {
    try {
      const { smooth = true, offset = 100 } = options;
      
      // Find the main content container
      const contentContainer = this.findMainContentContainer();
      if (!contentContainer) {
        console.warn('Blind nudist Extension: Could not find main content container');
        return false;
      }
      
      // Get the bottom position of current content
      const containerRect = contentContainer.getBoundingClientRect();
      const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
      const contentBottom = containerRect.bottom + currentScrollY;
      
      // Calculate target position (content bottom minus offset)
      const targetY = Math.max(0, contentBottom - offset);
      
      console.log('Blind nudist Extension: Scrolling to content bottom', {
        contentBottom,
        targetY,
        offset,
        containerRect
      });
      
      if (smooth) {
        throttledScrollTo(0, targetY);
      } else {
        window.scrollTo(0, targetY);
      }
      
      return true;
    } catch (error) {
      console.error('Blind nudist Extension: Error scrolling to content bottom:', error);
      return false;
    }
  },
  
  // Find the main content container on the page
  findMainContentContainer() {
    try {
      // Common content container selectors
      const contentSelectors = [
        'main',
        '[role="main"]',
        '.main-content',
        '.content',
        '.posts',
        '.items',
        '.results',
        '.feed',
        '.list',
        '#content',
        '#main',
        '.container:has(.post)',
        '.container:has(.item)',
        'article',
        '.articles'
      ];
      
      for (const selector of contentSelectors) {
        const elements = queryElements(selector);
        for (const element of elements) {
          if (this.isValidContentContainer(element)) {
            return element;
          }
        }
      }
      
      // Fallback: find the largest container with multiple child elements
      const allContainers = queryElements('div, section, main, article');
      let bestContainer = null;
      let maxScore = 0;
      
      for (const container of allContainers) {
        const score = this.scoreContentContainer(container);
        if (score > maxScore) {
          maxScore = score;
          bestContainer = container;
        }
      }
      
      return bestContainer;
    } catch (error) {
      console.error('Blind nudist Extension: Error finding content container:', error);
      return document.body; // Ultimate fallback
    }
  },
  
  // Check if an element is a valid content container
  isValidContentContainer(element) {
    try {
      if (!element || !isElementVisible(element)) return false;
      
      const rect = element.getBoundingClientRect();
      const childCount = element.children.length;
      
      // Must have reasonable size and multiple children
      return rect.height > 200 && rect.width > 300 && childCount >= 3;
    } catch (error) {
      return false;
    }
  },
  
  // Score a container based on content characteristics
  scoreContentContainer(element) {
    try {
      let score = 0;
      
      // Size scoring
      const rect = element.getBoundingClientRect();
      score += Math.min(rect.height / 100, 10); // Height bonus (max 10)
      score += Math.min(rect.width / 100, 5);   // Width bonus (max 5)
      
      // Child count scoring
      const childCount = element.children.length;
      score += Math.min(childCount, 20); // Child count bonus (max 20)
      
      // Content type scoring
      const className = element.className.toLowerCase();
      const id = element.id.toLowerCase();
      const tagName = element.tagName.toLowerCase();
      
      // Positive indicators
      const positiveKeywords = ['content', 'main', 'posts', 'items', 'results', 'feed', 'list', 'articles'];
      for (const keyword of positiveKeywords) {
        if (className.includes(keyword) || id.includes(keyword)) {
          score += 5;
        }
      }
      
      // Tag name bonuses
      if (tagName === 'main') score += 10;
      if (tagName === 'article') score += 5;
      if (element.getAttribute('role') === 'main') score += 10;
      
      // Negative indicators
      const negativeKeywords = ['header', 'footer', 'nav', 'sidebar', 'ad', 'banner'];
      for (const keyword of negativeKeywords) {
        if (className.includes(keyword) || id.includes(keyword)) {
          score -= 5;
        }
      }
      
      return Math.max(0, score);
    } catch (error) {
      return 0;
    }
  },
  
  // Scroll to show newly loaded content
  scrollToNewContent(previousContentCount, newContentCount) {
    try {
      if (newContentCount <= previousContentCount) return false;
      
      const contentContainer = this.findMainContentContainer();
      if (!contentContainer) return false;
      
      // Find new content elements (assuming they're at the bottom)
      const allContentItems = contentContainer.children;
      const newItemsCount = newContentCount - previousContentCount;
      const newItems = Array.from(allContentItems).slice(-newItemsCount);
      
      if (newItems.length > 0) {
        const firstNewItem = newItems[0];
        const rect = firstNewItem.getBoundingClientRect();
        const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
        const targetY = rect.top + currentScrollY - 100; // 100px offset from top
        
        console.log('Blind nudist Extension: Scrolling to new content', {
          newItemsCount,
          targetY,
          firstNewItem
        });
        
        throttledScrollTo(0, Math.max(0, targetY));
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Blind nudist Extension: Error scrolling to new content:', error);
      return false;
    }
  }
};

try {
  // Maximum retry attempts
  const MAX_RETRIES = 3;
  
  // Scan page for load more buttons
  const pageAnalysis = scanPageContent();
  let targetElement = null;
  let elementType = '';
  
  // Check if we have load more buttons
  if (pageAnalysis.patterns.buttons.length > 0) {
    targetElement = document.querySelector(pageAnalysis.patterns.buttons[0].selector);
    elementType = 'button';
  } else if (pageAnalysis.patterns.links.length > 0) {
    // Try links if no buttons found
    targetElement = document.querySelector(pageAnalysis.patterns.links[0].selector);
    elementType = 'link';
  }
  
  if (targetElement && isElementVisible(targetElement)) {
    // Scroll to the element with smooth behavior
    try {
      throttledScrollIntoView(targetElement, { 
        behavior: 'smooth', 
        block: 'center'
      });
      console.log(`Load More Extension: Auto-scrolled to load more ${elementType}`);
      
      // Mark that we've found a button
      window.loadMoreButtonFound = true;
      
      // Verify scroll position after a short delay
      setTimeout(() => {
        verifyScrollPosition(targetElement);
      }, 500);
    } catch (scrollError) {
      console.error('Load More Extension: Error during scroll operation:', scrollError);
      // Fallback to window.scrollTo if scrollIntoView fails
      const rect = targetElement.getBoundingClientRect();
      const scrollY = window.scrollY + rect.top - (window.innerHeight / 2);
      throttledScrollTo(0, scrollY);
      console.log('Load More Extension: Used fallback scroll method');
    }
  } else {
    console.log(`Load More Extension: Load more element not visible or not found (attempt ${retryCount + 1})`);
    
    // Retry with increasing delay if element not found and under max retries
    if (retryCount < MAX_RETRIES) {
      const nextRetryDelay = 1000 * (retryCount + 1); // Increasing delay: 1s, 2s, 3s
      console.log(`Load More Extension: Will retry in ${nextRetryDelay}ms`);
      setTimeout(() => {
        scrollToLoadMoreButton(retryCount + 1);
      }, nextRetryDelay);
    } else {
      console.log('Load More Extension: Maximum retry attempts reached');
    }
  }
} catch (error) {
  console.error('Load More Extension: Error during auto-scroll:', error);
}

// Verify that the element is actually visible in the viewport after scrolling
function verifyScrollPosition(element, targetY = null) {
  if (!element) return;
  
  try {
    const rect = element.getBoundingClientRect();
    const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    // Check if element is positioned correctly at top of viewport (with 80px margin)
    const isCorrectlyPositioned = targetY ? 
      Math.abs(currentScrollTop - targetY) < 50 : // Allow 50px tolerance
      (rect.top >= 60 && rect.top <= 120); // Element should be 60-120px from top
    
    if (!isCorrectlyPositioned) {
      console.log('Load More Extension: Element not correctly positioned, adjusting...');
      
      // Calculate correct position
      const correctY = targetY || (currentScrollTop + rect.top - 80);
      
      // Smooth scroll to correct position
      window.scrollTo({
        top: Math.max(0, correctY),
        behavior: 'smooth'
      });
      
      console.log(`Load More Extension: Adjusted scroll position to ${correctY}px`);
    } else {
      console.log('Load More Extension: Element correctly positioned at top of viewport');
    }
  } catch (error) {
    console.error('Load More Extension: Error verifying scroll position:', error);
  }
}

// Keyboard navigation support for accessibility
document.addEventListener('keydown', (event) => {
  // Alt + L: Start load more expansion
  if (event.altKey && event.key.toLowerCase() === 'l' && !window.loadMoreActive) {
    event.preventDefault()
    startContentExpansion({ method: 'auto' })
    notifyProgress('started', 0, 'Keyboard shortcut activated')
  }
  
  // Alt + S: Stop expansion
  if (event.altKey && event.key.toLowerCase() === 's' && window.loadMoreActive) {
    event.preventDefault()
    stopContentExpansion()
    notifyProgress('stopped', 0, 'Stopped via keyboard shortcut')
  }
})

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!message || typeof message.type !== 'string') {
      sendResponse({ error: 'Invalid message format' });
      return;
    }

    switch (message.type) {
      case 'SCAN_PAGE_CONTENT':
        try {
          const result = scanPageContent();
          sendResponse({ success: true, data: result });
        } catch (error) {
          console.error('Error scanning page content:', error);
          sendResponse({ error: 'Failed to scan page content', details: error.message });
        }
        break
        
      case 'START_EXPANSION':
        try {
          // Scroll to content bottom before starting expansion
          scrollManager.scrollToContentBottom({ smooth: true, offset: 150 });
          
          startContentExpansion(message.options || {});
          sendResponse({ success: true });
        } catch (error) {
          console.error('Error starting content expansion:', error);
          sendResponse({ error: 'Failed to start content expansion', details: error.message });
        }
        break
        
      case 'STOP_EXPANSION':
        try {
          stopContentExpansion();
          sendResponse({ success: true });
        } catch (error) {
          console.error('Error stopping content expansion:', error);
          sendResponse({ error: 'Failed to stop content expansion', details: error.message });
        }
        break
        
      case 'START_AUTO_DETECTION':
        try {
          autoDetectionState.startAutoDetection();
          sendResponse({ success: true, trackedCount: autoDetectionState.trackedElements.size });
        } catch (error) {
          console.error('Error starting auto-detection:', error);
          sendResponse({ error: 'Failed to start auto-detection', details: error.message });
        }
        break
        
      case 'STOP_AUTO_DETECTION':
        try {
          autoDetectionState.stopAutoDetection();
          autoDetectionState.clearTracking();
          sendResponse({ success: true });
        } catch (error) {
          console.error('Error stopping auto-detection:', error);
          sendResponse({ error: 'Failed to stop auto-detection', details: error.message });
        }
        break
        
      case 'GET_TRACKED_ELEMENTS':
        try {
          const trackedElements = Array.from(autoDetectionState.trackedElements).map(element => ({
            tagName: element.tagName,
            className: element.className,
            textContent: element.textContent?.trim().substring(0, 50),
            selector: generateElementSelector(element)
          }));
          sendResponse({ success: true, data: { trackedElements, count: trackedElements.length } });
        } catch (error) {
          console.error('Error getting tracked elements:', error);
          sendResponse({ error: 'Failed to get tracked elements', details: error.message });
        }
        break
        
      default:
        sendResponse({ error: 'Unknown message type', type: message.type });
    }
  } catch (error) {
    console.error('Error in message listener:', error);
    sendResponse({ error: 'Internal error processing message', details: error.message });
  }
})

/**
 * Scans the current page for load more patterns and content expansion opportunities
 * 
 * This function performs comprehensive analysis of the page to detect:
 * - Load more buttons and links with various text patterns
 * - Infinite scroll capabilities based on page height
 * - Pagination elements and navigation
 * - Lazy-loaded images and hidden content
 * 
 * @returns {Object} Analysis results containing:
 *   - patterns: Detected UI patterns (buttons, links, infiniteScroll, etc.)
 *   - pageInfo: Basic page metadata (URL, title, dimensions)
 *   - detectionSummary: Summary of findings and recommended expansion method
 * 
 * @throws {Error} When DOM access fails or page analysis encounters critical errors
 */
function scanPageContent() {
  try {
    // Check cache first
    const cachedResult = pageAnalysisCache.get();
    if (cachedResult) {
      console.log('Load More Extension: Using cached page analysis');
      return cachedResult;
    }
    
    // Use the imported analyzePageContent function for actual analysis
    const patterns = analyzePageContent();
    
    // Count content items for additional metadata
    const contentElements = queryElements(SELECTORS.CONTENT_CONTAINERS);
    const maxContentCount = contentElements.length;
    
    // Get page dimensions
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
  
    const result = {
      patterns,
      contentCount: maxContentCount,
      estimatedTotal: Math.max(maxContentCount * 2, 50),
      pageInfo: {
        url: window.location.href,
        title: document.title,
        scrollHeight,
        clientHeight
      },
      detectionSummary: {
        hasLoadMoreButtons: patterns.buttons.length > 0,
        hasLoadMoreLinks: patterns.links.length > 0,
        hasInfiniteScroll: patterns.infiniteScroll,
        hasPagination: patterns.pagination,
        hasLazyLoadedImages: patterns.lazyLoad,
        hasHiddenContent: patterns.hiddenContent.length > 0,
        recommendedMethod: determineRecommendedMethod(patterns)
      }
    }
    
    // Cache the result for future use
    pageAnalysisCache.set(result);
    
    return result;
  } catch (error) {
    console.error('Error in scanPageContent:', error);
    // Return minimal safe response on error
    return {
      patterns: { buttons: [], links: [], infiniteScroll: false, pagination: false, lazyLoad: false, hiddenContent: [] },
      contentCount: 0,
      estimatedTotal: 0,
      pageInfo: { url: window.location.href, title: document.title, scrollHeight: 0, clientHeight: 0 },
      detectionSummary: { hasLoadMoreButtons: false, hasLoadMoreLinks: false, hasInfiniteScroll: false, hasPagination: false, hasLazyLoadedImages: false, hasHiddenContent: false, recommendedMethod: 'none' },
      error: error.message
    }
  }
}

/**
 * Analyzes detected patterns to recommend the optimal content expansion method
 * 
 * Priority order:
 * 1. Infinite scroll (if detected and reliable)
 * 2. High-confidence load more buttons
 * 3. Lazy-loaded images (scroll method)
 * 4. Pagination links
 * 5. Hidden content expansion
 * 
 * @param {Object} patterns - Detected page patterns from scanPageContent
 * @param {Array} patterns.buttons - Detected load more buttons with confidence scores
 * @param {Array} patterns.links - Detected load more links
 * @param {boolean} patterns.infiniteScroll - Whether infinite scroll is detected
 * @param {boolean} patterns.lazyLoad - Whether lazy-loaded content is present
 * 
 * @returns {string} Recommended method: 'click', 'scroll', 'expand', or 'none'
 */
function determineRecommendedMethod(patterns) {
  // Determine the best method to expand content based on detected patterns
  
  // If we have high-confidence buttons, use them first
  if (patterns.buttons.length > 0 && patterns.buttons[0].confidence > 70) {
    return 'button';
  }
  
  // If we have high-confidence links, use them next
  if (patterns.links.length > 0 && patterns.links[0].confidence > 70) {
    return 'link';
  }
  
  // If we have detected infinite scroll, use that
  if (patterns.infiniteScroll) {
    return 'scroll';
  }
  
  // If we have pagination, use that
  if (patterns.pagination) {
    return 'pagination';
  }
  
  // If we have lazy-loaded images, use scroll method
  if (patterns.lazyLoad) {
    return 'scroll';
  }
  
  // If we have hidden content, use expand method
  if (patterns.hiddenContent.length > 0) {
    return 'expand';
  }
  
  // Default to auto method which will try multiple approaches
  return 'auto';
}

// isElementVisible, calculateElementConfidence, and generateElementSelector functions are now imported from detection module

/**
 * Initiates automated content expansion using detected patterns and user preferences
 * 
 * This function orchestrates the content expansion process by:
 * - Setting up global state and expansion parameters
 * - Analyzing the page for optimal expansion methods
 * - Executing expansion cycles with progress tracking
 * - Handling different expansion methods (click, scroll, expand)
 * 
 * @param {Object} options - Configuration options for expansion
 * @param {string} [options.method='auto'] - Expansion method: 'auto', 'click', 'scroll', 'expand'
 * @param {number} [options.maxClicks=10] - Maximum number of expansion attempts
 * @param {number} [options.delay=2000] - Delay between expansion attempts (ms)
 * @param {boolean} [options.stopOnError=false] - Whether to stop on first error
 * 
 * @throws {Error} When expansion setup fails or critical errors occur during execution
 */
function startContentExpansion(options = {}) {
  try {
    const { maxClicks = 10, delay = 2000, method = 'auto' } = options
    
    // Set global flags
    window.loadMoreActive = true
    window.loadMoreStopped = false
    
    let clickCount = 0
    let lastContentCount = getCurrentContentCount()
    
    // Get page patterns for smarter expansion
    const pageAnalysis = scanPageContent()
    const recommendedMethod = pageAnalysis.detectionSummary.recommendedMethod
    
    // Use recommended method if auto is selected
    const expansionMethod = method === 'auto' ? recommendedMethod : method
    
    async function performExpansion() {
      try {
        if (window.loadMoreStopped || clickCount >= maxClicks) {
          window.loadMoreActive = false
          notifyProgress('complete', clickCount)
          return
        }
      } catch (error) {
        console.error('Error in performExpansion:', error);
        window.loadMoreActive = false
        notifyProgress('error', clickCount, error.message)
        return
      }

    let actionTaken = false
    
    // Track if content count has increased
    const currentContentCount = getCurrentContentCount()
    const contentIncreased = currentContentCount > lastContentCount
    
    // Method 1: Click visible load more buttons
    if (expansionMethod === 'auto' || expansionMethod === 'button') {
      const loadMoreButton = findBestLoadMoreButton()
      if (loadMoreButton && isElementVisible(loadMoreButton)) {
        try {
          // Scroll button into view (throttled)
          throttledScrollIntoView(loadMoreButton, { behavior: 'smooth', block: 'center' })
          await sleep(500)
          
          // Click the button
          loadMoreButton.click()
          clickCount++
          actionTaken = true
          
          notifyProgress('clicked', clickCount, loadMoreButton.textContent?.trim().substring(0, 30))
          
        } catch (error) {
          console.warn('Failed to click load more button:', error)
        }
      }
    }
    
    // Method 2: Infinite scroll
    if (!actionTaken && (expansionMethod === 'auto' || expansionMethod === 'scroll')) {
      const currentScroll = window.pageYOffset
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      
      if (currentScroll < maxScroll * 0.9) {
        // Store current content count before scrolling
        const preScrollContentCount = getCurrentContentCount()
        
        throttledScrollTo(0, document.documentElement.scrollHeight)
        actionTaken = true
        notifyProgress('scrolled', clickCount)
        
        // Wait for potential lazy loading, then check for new content
        await sleep(delay)
        const postScrollContentCount = getCurrentContentCount()
        
        if (postScrollContentCount > preScrollContentCount) {
          // New content was loaded, scroll to show it
          await scrollToNewlyLoadedContent(preScrollContentCount, postScrollContentCount)
        }
      }
    }
    
    // Method 3: Expand hidden content
    if (!actionTaken && (expansionMethod === 'auto' || expansionMethod === 'expand')) {
      const preExpandContentCount = getCurrentContentCount()
      const expandedCount = expandHiddenContent()
      if (expandedCount > 0) {
        actionTaken = true
        notifyProgress('expanded', clickCount, `${expandedCount} hidden elements`)
        
        // Wait for content to render, then scroll to newly visible content
        await sleep(300)
        const postExpandContentCount = getCurrentContentCount()
        
        if (postExpandContentCount > preExpandContentCount) {
          await scrollToNewlyLoadedContent(preExpandContentCount, postExpandContentCount)
        }
      }
    }
    
    // Method 4: Handle pagination
    if (!actionTaken && (expansionMethod === 'auto' || expansionMethod === 'pagination')) {
      const nextPageLink = findNextPageLink()
      if (nextPageLink) {
        try {
          // Store current content count in sessionStorage before navigating
          sessionStorage.setItem('loadMoreExtension_prevCount', currentContentCount)
          nextPageLink.click()
          actionTaken = true
          notifyProgress('pagination', clickCount, 'Navigating to next page')
        } catch (error) {
          console.warn('Failed to navigate to next page:', error)
        }
      }
    }
    
    if (actionTaken) {
      // Wait for content to load
      await sleep(delay)
      
      // Check if new content was loaded
      const newContentCount = getCurrentContentCount()
      if (newContentCount > lastContentCount) {
        lastContentCount = newContentCount
        notifyProgress('loaded', clickCount, `${newContentCount} items`)
        
        // Scroll to newly loaded content
        await scrollToNewlyLoadedContent(currentContentCount, newContentCount)
      }
      
      // Continue expansion
      if (!window.loadMoreStopped) {
        setTimeout(performExpansion, 500)
      }
    } else {
      // No more actions available
      window.loadMoreActive = false
      notifyProgress('complete', clickCount)
    }
    }
    
    performExpansion()
  } catch (error) {
    console.error('Error in startContentExpansion:', error);
    window.loadMoreActive = false
    window.loadMoreStopped = true
    notifyProgress('error', 0, error.message)
  }
}

/**
 * Scrolls to newly loaded content after successful expansion
 * @param {number} previousCount - Content count before expansion
 * @param {number} newCount - Content count after expansion
 */
async function scrollToNewlyLoadedContent(previousCount, newCount) {
  try {
    if (newCount <= previousCount) {
      console.log('Blind nudist Extension: No new content to scroll to');
      return;
    }

    console.log(`Blind nudist Extension: Scrolling to newly loaded content (${previousCount} -> ${newCount})`);
    
    // Wait a moment for content to render
    await sleep(500);
    
    // Use the enhanced scroll manager
    const scrolled = scrollManager.scrollToNewContent(previousCount, newCount);
    
    if (!scrolled) {
      // Fallback: try to find new content elements manually
      const contentElements = queryElements(SELECTORS.CONTENT_CONTAINERS);
      
      if (contentElements.length >= previousCount + 1) {
        // Find the first newly loaded element (at index previousCount)
        const firstNewElement = contentElements[previousCount];
        
        if (firstNewElement && isElementVisible(firstNewElement)) {
          console.log('Blind nudist Extension: Scrolling to first new item (fallback)');
          
          // Use throttled scroll with smooth behavior
          throttledScrollIntoView(firstNewElement, {
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest'
          });
          
          return;
        }
      }
      
      // Ultimate fallback: scroll to content bottom
      console.log('Blind nudist Extension: Ultimate fallback - scroll to content bottom');
      scrollManager.scrollToContentBottom({ smooth: true, offset: 100 });
    }
    
  } catch (error) {
    console.error('Blind nudist Extension: Error scrolling to new content:', error);
  }
}

function findBestLoadMoreButton() {
  // Get page analysis with confidence scores
  const pageAnalysis = scanPageContent();
  
  // First try buttons with high confidence scores
  if (pageAnalysis.patterns.buttons.length > 0) {
    // Sort by confidence (already done in scanPageContent)
    const highConfidenceButtons = pageAnalysis.patterns.buttons.filter(btn => btn.confidence > 60);
    
    for (const buttonInfo of highConfidenceButtons) {
      try {
        const element = queryElements(buttonInfo.selector, document, true);
        if (element && isElementVisible(element)) {
          return element;
        }
      } catch (error) {
        console.warn(`Error with selector "${buttonInfo.selector}":`, error);
      }
    }
  }
  
  // Then try links with high confidence scores
  if (pageAnalysis.patterns.links.length > 0) {
    const highConfidenceLinks = pageAnalysis.patterns.links.filter(link => link.confidence > 60);
    
    for (const linkInfo of highConfidenceLinks) {
      try {
        const element = queryElements(linkInfo.selector, document, true);
        if (element && isElementVisible(element)) {
          return element;
        }
      } catch (error) {
        console.warn(`Error with selector "${linkInfo.selector}":`, error);
      }
    }
  }
  
  // Fallback to traditional selectors
  const selectors = [
    // High priority - explicit load more buttons
    'button[class*="load-more"]:not([disabled])',
    'button[class*="show-more"]:not([disabled])',
    'a[class*="load-more"]',
    'a[class*="show-more"]',
    
    // Medium priority - text-based detection
    'button:not([disabled])',
    'a[href]',
    '[role="button"]'
  ]
  
  const loadMoreTexts = ['load more', 'show more', 'view more', 'see more', 'next']
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector)
    
    for (const element of elements) {
      if (!isElementVisible(element)) continue // Skip hidden elements
      
      const text = element.textContent?.toLowerCase().trim() || ''
      const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || ''
      
      if (loadMoreTexts.some(pattern => text.includes(pattern) || ariaLabel.includes(pattern))) {
        return element
      }
    }
  }
  
  return null
}

function getCurrentContentCount() {
  const contentElements = queryElements(SELECTORS.CONTENT_CONTAINERS)
  return contentElements.length || queryElements(SELECTORS.ALL_ELEMENTS).length
}

function stopContentExpansion() {
  window.loadMoreStopped = true
  window.loadMoreActive = false
  notifyProgress('stopped', 0)
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  autoDetectionState.stopAutoDetection();
  autoDetectionState.clearTracking();
});

// Clean up on navigation
window.addEventListener('pagehide', () => {
  autoDetectionState.stopAutoDetection();
  autoDetectionState.clearTracking();
});

/**
 * Notifies progress updates with accessibility support via ARIA live regions
 * 
 * @param {string} action - The action performed ('clicked', 'scrolled', 'complete', 'error')
 * @param {number} count - Current count of actions performed
 * @param {string} details - Additional details about the action
 */
function notifyProgress(action, count, details = '') {
  // Send progress update to popup
  chrome.runtime.sendMessage({
    type: 'EXPANSION_PROGRESS',
    action,
    count,
    details,
    timestamp: Date.now()
  }).catch(() => {
    // Popup might be closed, ignore errors
  })
  
  // Create or update ARIA live region for screen readers
  let liveRegion = document.getElementById('load-more-extension-live-region')
  if (!liveRegion) {
    liveRegion = document.createElement('div')
    liveRegion.id = 'load-more-extension-live-region'
    liveRegion.setAttribute('aria-live', 'polite')
    liveRegion.setAttribute('aria-atomic', 'true')
    liveRegion.style.cssText = `
      position: absolute !important;
      left: -10000px !important;
      width: 1px !important;
      height: 1px !important;
      overflow: hidden !important;
    `
    document.body.appendChild(liveRegion)
  }
  
  // Update live region with accessible message
  const messages = {
    clicked: `Load more content expanded. ${count} items loaded.`,
    scrolled: `Page scrolled to load more content. ${count} actions performed.`,
    complete: `Content expansion complete. Total ${count} items loaded.`,
    error: `Content expansion error: ${details}`,
    stopped: 'Content expansion stopped by user.'
  }
  
  liveRegion.textContent = messages[action] || `Content expansion: ${action}. Count: ${count}.`
}

// expandHiddenContent function is now imported from execution module

function findNextPageLink() {
  // Common selectors for pagination next links
  const nextPageSelectors = [
    'a.next', 'a.pagination-next', 'a[rel="next"]',
    'a[aria-label="Next"]', 'a[aria-label="Next page"]',
    '.pagination a:last-child', '.pagination li:last-child a',
    'a:has(> .next-icon)', 'a:has(> .icon-next)',
    'a:has(> .icon-arrow-right)', 'a:has(> .fa-arrow-right)',
    'a.page-link:contains("Next")', 'a.page-link:contains(">")'
  ]
  
  // Try each selector
  for (const selector of nextPageSelectors) {
    try {
      const element = queryElements(selector, document, true)
      if (element && isElementVisible(element)) {
        return element
      }
    } catch (error) {
      // Some complex selectors might not be supported in all browsers
      console.warn(`Error with selector "${selector}":`, error)
    }
  }
  
  // Fallback: look for links with "next" text
  const allLinks = queryElements('a')
  for (const link of allLinks) {
    const text = link.textContent?.toLowerCase().trim() || ''
    const ariaLabel = link.getAttribute('aria-label')?.toLowerCase() || ''
    
    if ((text.includes('next') || ariaLabel.includes('next')) && 
        !text.includes('previous') && !ariaLabel.includes('previous') &&
        isElementVisible(link)) {
      return link
    }
  }
  
  return null
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Automatic detection and tracking state
let autoDetectionState = {
  trackedElements: new Set(),
  lastDetectionTime: 0,
  detectionInterval: null,
  isTracking: false,
  
  // Track a load more element
  trackElement(element) {
    if (!element || this.trackedElements.has(element)) return false;
    
    try {
      this.trackedElements.add(element);
      
      // Add visual indicator (subtle border)
      const originalBorder = element.style.border;
      element.style.border = '1px dashed rgba(59, 130, 246, 0.3)';
      element.setAttribute('data-bn-tracked', 'true');
      
      // Store original border for restoration
      element.setAttribute('data-bn-original-border', originalBorder);
      
      console.log('Blind nudist Extension: Tracking element:', element);
      return true;
    } catch (error) {
      console.error('Blind nudist Extension: Error tracking element:', error);
      return false;
    }
  },
  
  // Stop tracking an element
  untrackElement(element) {
    if (!element || !this.trackedElements.has(element)) return false;
    
    try {
      this.trackedElements.delete(element);
      
      // Restore original styling
      const originalBorder = element.getAttribute('data-bn-original-border') || '';
      element.style.border = originalBorder;
      element.removeAttribute('data-bn-tracked');
      element.removeAttribute('data-bn-original-border');
      
      return true;
    } catch (error) {
      console.error('Blind nudist Extension: Error untracking element:', error);
      return false;
    }
  },
  
  // Clear all tracked elements
  clearTracking() {
    for (const element of this.trackedElements) {
      this.untrackElement(element);
    }
    this.trackedElements.clear();
  },
  
  // Start automatic detection
  startAutoDetection() {
    if (this.isTracking) return;
    
    this.isTracking = true;
    this.performDetection();
    
    // Set up periodic detection
    this.detectionInterval = setInterval(() => {
      this.performDetection();
    }, 5000); // Check every 5 seconds
    
    console.log('Blind nudist Extension: Auto-detection started');
  },
  
  // Stop automatic detection
  stopAutoDetection() {
    if (!this.isTracking) return;
    
    this.isTracking = false;
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
    
    console.log('Blind nudist Extension: Auto-detection stopped');
  },
  
  // Perform detection and tracking
  performDetection() {
    try {
      const now = Date.now();
      if (now - this.lastDetectionTime < 2000) return; // Throttle to every 2 seconds
      
      this.lastDetectionTime = now;
      
      // Detect load more buttons
      const loadMoreButtons = queryElements(SELECTORS.LOAD_MORE_BUTTONS);
      const loadMoreLinks = queryElements(SELECTORS.LOAD_MORE_LINKS);
      const paginationElements = queryElements(SELECTORS.PAGINATION);
      
      // Track new elements
      [...loadMoreButtons, ...loadMoreLinks, ...paginationElements].forEach(element => {
        if (isElementVisible(element)) {
          this.trackElement(element);
        }
      });
      
      // Remove tracking from elements that are no longer visible or valid
      for (const element of this.trackedElements) {
        if (!document.contains(element) || !isElementVisible(element)) {
          this.untrackElement(element);
        }
      }
      
      // Notify about tracked elements
      if (this.trackedElements.size > 0) {
        chrome.runtime.sendMessage({
          type: 'AUTO_DETECTION_UPDATE',
          data: {
            trackedCount: this.trackedElements.size,
            url: window.location.href,
            timestamp: now
          }
        }).catch(() => {});
      }
      
    } catch (error) {
      console.error('Blind nudist Extension: Error in auto-detection:', error);
    }
  }
};

// Initialize content script
console.log('Load More Extension content script loaded')

// Auto-detect on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      const scanResult = scanPageContent()
      if (scanResult.patterns.buttons.length > 0 || scanResult.patterns.links.length > 0) {
        console.log('Load More Extension: Detected expandable content')
      }
      
      // Start automatic detection after a short delay
      autoDetectionState.startAutoDetection();
    }, 1000)
  })
} else {
  // Page already loaded, start detection immediately
  setTimeout(() => {
    autoDetectionState.startAutoDetection();
  }, 500);
}