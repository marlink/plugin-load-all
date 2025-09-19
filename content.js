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

// Global error handler for uncaught exceptions
window.addEventListener('error', (event) => {
  console.error('Load More Extension - Uncaught error:', event.error);
});

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
        throttledScrollTo(0, document.documentElement.scrollHeight)
        actionTaken = true
        notifyProgress('scrolled', clickCount)
      }
    }
    
    // Method 3: Expand hidden content
    if (!actionTaken && (expansionMethod === 'auto' || expansionMethod === 'expand')) {
      const expandedCount = expandHiddenContent()
      if (expandedCount > 0) {
        actionTaken = true
        notifyProgress('expanded', clickCount, `${expandedCount} hidden elements`)
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
    }, 1000)
  })
}