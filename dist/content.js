// Content script for Load More Extension
// Runs in the context of web pages to detect and interact with content

// Initialize security utilities
const security = new SecurityUtils();

// Listen for messages from popup with security validation
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    // Validate message structure and content
    const validation = security.validateMessage(message);
    if (!validation.valid) {
      console.error('Invalid message:', validation.error);
      sendResponse({ error: validation.error });
      return;
    }

    // Rate limiting check
    const rateCheck = security.checkRateLimit(sender.tab?.id || 'unknown');
    if (!rateCheck.allowed) {
      console.error('Rate limit exceeded');
      sendResponse({ error: rateCheck.error });
      return;
    }

    switch (message.type) {
      case 'SCAN_PAGE_CONTENT':
        sendResponse(scanPageContent());
        break;
        
      case 'START_EXPANSION':
        if (message.options && typeof message.options === 'object') {
          startContentExpansion(message.options);
          sendResponse({ success: true });
        } else {
          sendResponse({ error: 'Invalid expansion options' });
        }
        break;
        
      case 'STOP_EXPANSION':
        stopContentExpansion();
        sendResponse({ success: true });
        break;
        
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('Message handling error:', error);
    sendResponse({ error: 'Internal error processing message' });
  }
});

function scanPageContent() {
  // Enhanced detection for various "Load More" patterns
  const patterns = {
    buttons: [],
    links: [],
    infiniteScroll: false,
    pagination: false,
    lazyLoad: false,
    hiddenContent: []
  }

  // Text-based detection (case insensitive)
  const loadMoreTexts = [
    'load more', 'show more', 'view more', 'see more', 'read more',
    'load additional', 'show additional', 'view additional',
    'more results', 'more items', 'more posts', 'more content',
    'continue reading', 'expand', 'next page', 'load next',
    'show all', 'view all', 'display more', 'reveal more',
    'load comments', 'show comments', 'view replies', 'show replies'
  ]

  // Find buttons and links with load more text using secure queries
  const clickableElements = security.secureQuerySelectorAll('button, a, [role="button"], [data-action], [data-load-more], [data-toggle], [data-expand], .load-more, .show-more, .view-more, .expand')
  
  clickableElements.forEach(element => {
    const text = element.textContent?.toLowerCase().trim() || ''
    const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || ''
    const title = element.getAttribute('title')?.toLowerCase() || ''
    const className = element.className?.toLowerCase() || ''
    const id = element.id?.toLowerCase() || ''
    const dataAttributes = Array.from(element.attributes)
      .filter(attr => attr.name.startsWith('data-'))
      .map(attr => `${attr.name}=${attr.value}`)
      .join(' ')
      .toLowerCase()
    
    const allText = `${text} ${ariaLabel} ${title} ${className} ${id} ${dataAttributes}`
    
    // Check for load more patterns
    const matchesLoadMore = loadMoreTexts.some(pattern => allText.includes(pattern))
    
    // Check for icon-only buttons (no text but has icon class)
    const hasIconClass = className.includes('icon') || 
                         className.includes('arrow') || 
                         className.includes('chevron') ||
                         className.includes('plus') ||
                         className.includes('expand')
    
    // Check for buttons with only + or ↓ symbols
    const hasExpandSymbol = text === '+' || 
                           text === '↓' || 
                           text === '⌄' || 
                           text === '▼' ||
                           text === '...' ||
                           text === '…'
    
    if (matchesLoadMore || (hasIconClass && element.children.length < 3) || hasExpandSymbol) {
      const elementInfo = {
        tagName: element.tagName,
        text: text.substring(0, 50),
        className: element.className,
        id: element.id,
        visible: isElementVisible(element),
        selector: generateSelector(element),
        confidence: calculateConfidence(element, matchesLoadMore, hasIconClass, hasExpandSymbol)
      }
      
      if (element.tagName === 'BUTTON' || element.getAttribute('role') === 'button') {
        patterns.buttons.push(elementInfo)
      } else {
        patterns.links.push(elementInfo)
      }
    }
  })

  // Check for infinite scroll indicators
  const scrollHeight = document.documentElement.scrollHeight
  const clientHeight = document.documentElement.clientHeight
  patterns.infiniteScroll = scrollHeight > clientHeight * 1.5

  // Check for pagination using secure queries
  const paginationSelectors = [
    '.pagination', '.pager', '.page-nav', '.pages', '.page-numbers',
    'nav.navigation', 'ul.pages'
  ]
  
  patterns.pagination = paginationSelectors.some(selector => {
    try {
      return security.secureQuerySelector(selector) !== null;
    } catch {
      return false;
    }
  })
  
  // Detect lazy-loaded images using secure queries
  const lazyLoadedImages = security.secureQuerySelectorAll('img[loading="lazy"], img[data-src], img[data-lazy], img[data-lazy-src], [data-lazy-load], [data-lazyload]')
  patterns.lazyLoad = lazyLoadedImages.length > 0
  
  // Detect hidden content sections using secure queries
  const hiddenContentSelectors = [
    '.hidden', '.collapse:not(.show)', '[aria-hidden="true"]', 
    '.accordion-content:not(.active)', '.tab-content:not(.active)',
    '[data-hidden="true"]', '[data-collapsed="true"]'
  ]
  
  hiddenContentSelectors.forEach(selector => {
    try {
      const elements = security.secureQuerySelectorAll(selector);
      if (elements.length > 0) {
        patterns.hiddenContent.push({
          selector: security.sanitizeText(selector),
          count: elements.length
        });
      }
    } catch (error) {
      console.warn('Skipped invalid selector:', selector);
    }
  })

  // Count content items using secure queries
  const contentSelectors = [
    'article', '.post', '.item', '.card', '.entry', '.result', '.row', '.tile'
  ]
  
  let maxContentCount = 0
  contentSelectors.forEach(selector => {
    try {
      const count = security.secureQuerySelectorAll(selector).length;
      maxContentCount = Math.max(maxContentCount, count);
    } catch (error) {
      console.warn('Skipped invalid content selector:', selector);
    }
  })

  // Sort buttons and links by confidence
  patterns.buttons.sort((a, b) => b.confidence - a.confidence);
  patterns.links.sort((a, b) => b.confidence - a.confidence);
  
  return {
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
}

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

function isElementVisible(element) {
  if (!element) return false;
  
  // Check if element or any parent has display:none or visibility:hidden
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  
  // Check if element has zero dimensions and no background
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  
  // Check if element is within viewport or reasonably close
  const viewportHeight = window.innerHeight;
  if (rect.bottom < -100 || rect.top > viewportHeight + 500) return false;
  
  // Check if element has opacity 0
  if (parseFloat(style.opacity) === 0) return false;
  
  // Check if element is covered by another element
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const elementAtPoint = document.elementFromPoint(centerX, centerY);
  if (elementAtPoint && !element.contains(elementAtPoint) && !elementAtPoint.contains(element)) {
    // Element is covered by another element
    return false;
  }
  
  return true;
}

function calculateConfidence(element, matchesLoadMore, hasIconClass, hasExpandSymbol) {
  let confidence = 0;
  
  // Text-based confidence
  if (matchesLoadMore) confidence += 40;
  
  // Visual indicators
  if (hasIconClass) confidence += 15;
  if (hasExpandSymbol) confidence += 20;
  
  // Position-based confidence (elements at the bottom of content areas)
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  if (rect.top > viewportHeight * 0.7) confidence += 10;
  
  // Interaction hints
  if (element.tagName === 'BUTTON' || element.getAttribute('role') === 'button') confidence += 15;
  if (element.getAttribute('aria-expanded') === 'false') confidence += 20;
  if (element.getAttribute('aria-controls')) confidence += 15;
  
  // Data attributes that suggest expandability
  if (element.hasAttribute('data-load-more') || 
      element.hasAttribute('data-toggle') || 
      element.hasAttribute('data-expand')) {
    confidence += 25;
  }
  
  return Math.min(confidence, 100); // Cap at 100%
}

function generateSelector(element) {
  // Generate a unique selector for the element
  if (element.id) {
    return `#${element.id}`
  }
  
  if (element.className) {
    const classes = element.className.split(' ').filter(c => c.length > 0)
    if (classes.length > 0) {
      return `${element.tagName.toLowerCase()}.${classes.join('.')}`
    }
  }
  
  // Check for data attributes that might be useful
  const dataAttrs = Array.from(element.attributes)
    .filter(attr => attr.name.startsWith('data-') && attr.value)
    .map(attr => `[${attr.name}="${attr.value}"]`);
    
  if (dataAttrs.length > 0) {
    return `${element.tagName.toLowerCase()}${dataAttrs[0]}`;
  }
  
  // Fallback to tag name with text content
  const text = element.textContent?.trim().substring(0, 20)
  return `${element.tagName.toLowerCase()}:contains("${text}")`
}

function startContentExpansion(options = {}) {
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
    if (window.loadMoreStopped || clickCount >= maxClicks) {
      window.loadMoreActive = false
      notifyProgress('complete', clickCount)
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
          // Scroll button into view
          loadMoreButton.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
        window.scrollTo(0, document.documentElement.scrollHeight)
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
        const element = document.querySelector(buttonInfo.selector);
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
        const element = document.querySelector(linkInfo.selector);
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
  const contentSelectors = [
    'article', '.post', '.item', '.card', '.entry', '.result',
    '[class*="post"]', '[class*="item"]', '[class*="card"]'
  ]
  
  let maxCount = 0
  contentSelectors.forEach(selector => {
    const count = document.querySelectorAll(selector).length
    maxCount = Math.max(maxCount, count)
  })
  
  return maxCount || document.querySelectorAll('*').length
}

function stopContentExpansion() {
  try {
    window.loadMoreStopped = true;
    window.loadMoreActive = false;
    window.loadMoreExpansionStopped = true;
    window.loadMoreExpansionActive = false;
    notifyProgress('stopped', 0);
  } catch (error) {
    console.warn('Error stopping content expansion:', error);
  }
}

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
}

function expandHiddenContent() {
  let expandedCount = 0
  
  // Selectors for common hidden content patterns
  const hiddenContentSelectors = [
    '.hidden', '.collapse:not(.show)', '[aria-hidden="true"]', 
    '[style*="display: none"]', '[style*="display:none"]',
    '[style*="visibility: hidden"]', '[style*="visibility:hidden"]',
    '.accordion-content:not(.active)', '.tab-content:not(.active)',
    '[data-hidden="true"]', '[data-collapsed="true"]'
  ]
  
  // Try to expand each type of hidden content
  hiddenContentSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector)
    elements.forEach(element => {
      // Skip tiny elements that are likely UI controls
      const rect = element.getBoundingClientRect()
      if (rect.width < 50 || rect.height < 50) return
      
      // Try different methods to show the element
      if (element.classList.contains('hidden')) {
        element.classList.remove('hidden')
        expandedCount++
      } else if (element.classList.contains('collapse')) {
        element.classList.add('show')
        expandedCount++
      } else if (element.hasAttribute('aria-hidden')) {
        element.setAttribute('aria-hidden', 'false')
        expandedCount++
      } else if (element.style.display === 'none') {
        element.style.display = 'block'
        expandedCount++
      } else if (element.style.visibility === 'hidden') {
        element.style.visibility = 'visible'
        expandedCount++
      } else if (element.hasAttribute('data-hidden')) {
        element.setAttribute('data-hidden', 'false')
        expandedCount++
      } else if (element.hasAttribute('data-collapsed')) {
        element.setAttribute('data-collapsed', 'false')
        expandedCount++
      }
    })
  })
  
  return expandedCount
}

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
      const element = document.querySelector(selector)
      if (element && isElementVisible(element)) {
        return element
      }
    } catch (error) {
      // Some complex selectors might not be supported in all browsers
      console.warn(`Error with selector "${selector}":`, error)
    }
  }
  
  // Fallback: look for links with "next" text
  const allLinks = document.querySelectorAll('a')
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