// Injected script for Load More Extension
// This script runs in the page context to interact with page elements

(function() {
  'use strict';

  // Utility functions
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isElementVisible(element) {
    if (!element || !element.offsetParent) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && 
           rect.top >= 0 && rect.left >= 0 && 
           rect.bottom <= window.innerHeight && 
           rect.right <= window.innerWidth;
  }

  function scrollToElement(element) {
    element.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });
  }

  // Load more detection patterns
  const LOAD_MORE_PATTERNS = {
    texts: [
      'load more', 'show more', 'view more', 'see more', 'read more',
      'load additional', 'show additional', 'more results', 'next page',
      'continue reading', 'expand', 'show all', 'view all'
    ],
    selectors: [
      '[data-testid*="load"]',
      '[data-testid*="more"]',
      '[class*="load-more"]',
      '[class*="show-more"]',
      '[class*="view-more"]',
      '[class*="pagination"]',
      '.load-more',
      '.show-more',
      '.view-more',
      '.more-button',
      '.next-page',
      '.pagination a',
      '.pager a'
    ]
  };

  // Find load more elements
  function findLoadMoreElements() {
    const elements = [];
    
    // Text-based search
    const clickableElements = document.querySelectorAll('button, a, [role="button"], [onclick]');
    
    clickableElements.forEach(element => {
      const text = element.textContent?.toLowerCase().trim() || '';
      const className = element.className?.toLowerCase() || '';
      const allText = `${text} ${className}`;
      
      if (LOAD_MORE_PATTERNS.texts.some(pattern => allText.includes(pattern))) {
        elements.push({
          element,
          type: 'text-based',
          text: text.substring(0, 50),
          visible: isElementVisible(element)
        });
      }
    });

    // Selector-based search
    LOAD_MORE_PATTERNS.selectors.forEach(selector => {
      try {
        const found = document.querySelectorAll(selector);
        found.forEach(element => {
          if (!elements.some(e => e.element === element)) {
            elements.push({
              element,
              type: 'selector-based',
              text: element.textContent?.substring(0, 50) || '',
              visible: isElementVisible(element)
            });
          }
        });
      } catch (e) {
        // Ignore invalid selectors
      }
    });

    return elements.filter(e => e.visible);
  }

  // Check for infinite scroll
  function hasInfiniteScroll() {
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
    return scrollHeight > clientHeight * 1.5;
  }

  // Simulate infinite scroll
  async function triggerInfiniteScroll() {
    const initialHeight = document.documentElement.scrollHeight;
    
    // Scroll to bottom
    window.scrollTo(0, document.documentElement.scrollHeight);
    
    // Wait for potential content loading
    await sleep(2000);
    
    const newHeight = document.documentElement.scrollHeight;
    return newHeight > initialHeight;
  }

  // Click element safely
  async function clickElement(element) {
    try {
      // Scroll to element first
      scrollToElement(element);
      await sleep(500);

      // Try different click methods
      if (element.click) {
        element.click();
      } else if (element.onclick) {
        element.onclick();
      } else {
        // Dispatch click event
        const event = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        element.dispatchEvent(event);
      }

      return true;
    } catch (error) {
      console.warn('Failed to click element:', error);
      return false;
    }
  }

  // Main expansion function
  async function expandContent(options = {}) {
    const {
      maxClicks = 10,
      delay = 2000,
      method = 'auto'
    } = options;

    let clickCount = 0;
    let totalItemsLoaded = 0;

    // Send initial progress
    window.postMessage({
      type: 'LOAD_MORE_PROGRESS',
      action: 'started',
      clickCount,
      totalItemsLoaded
    }, '*');

    try {
      for (let i = 0; i < maxClicks; i++) {
        // Check if we should stop
        if (window.loadMoreStopped) {
          break;
        }

        // Find load more elements
        const loadMoreElements = findLoadMoreElements();
        
        if (loadMoreElements.length === 0) {
          // Try infinite scroll if no buttons found
          if (hasInfiniteScroll()) {
            const scrolled = await triggerInfiniteScroll();
            if (scrolled) {
              totalItemsLoaded += 5; // Estimate
              window.postMessage({
                type: 'LOAD_MORE_PROGRESS',
                action: 'scrolled',
                clickCount,
                totalItemsLoaded
              }, '*');
            } else {
              break; // No more content to load
            }
          } else {
            break; // No load more elements found
          }
        } else {
          // Click the first visible load more element
          const targetElement = loadMoreElements[0];
          const clicked = await clickElement(targetElement.element);
          
          if (clicked) {
            clickCount++;
            totalItemsLoaded += 10; // Estimate
            
            window.postMessage({
              type: 'LOAD_MORE_PROGRESS',
              action: 'clicked',
              clickCount,
              totalItemsLoaded,
              elementText: targetElement.text
            }, '*');
          }
        }

        // Wait before next action
        await sleep(delay);
      }

      // Send completion message
      window.postMessage({
        type: 'LOAD_MORE_PROGRESS',
        action: 'complete',
        clickCount,
        totalItemsLoaded
      }, '*');

    } catch (error) {
      console.error('Error during content expansion:', error);
      window.postMessage({
        type: 'LOAD_MORE_PROGRESS',
        action: 'error',
        error: error.message,
        clickCount,
        totalItemsLoaded
      }, '*');
    }
  }

  // Stop expansion
  function stopExpansion() {
    window.loadMoreStopped = true;
    window.postMessage({
      type: 'LOAD_MORE_PROGRESS',
      action: 'stopped'
    }, '*');
  }

  // Analyze page for load more elements
  function analyzePage() {
    const loadMoreElements = findLoadMoreElements();
    const infiniteScroll = hasInfiniteScroll();
    const pagination = document.querySelector('.pagination, .pager, [class*="pagination"]') !== null;

    // Count content items
    const contentSelectors = [
      'article', '.post', '.item', '.card', '.entry', '.result',
      '[data-testid*="post"]', '[data-testid*="item"]'
    ];
    
    let maxContentCount = 0;
    contentSelectors.forEach(selector => {
      try {
        const count = document.querySelectorAll(selector).length;
        maxContentCount = Math.max(maxContentCount, count);
      } catch (e) {
        // Ignore invalid selectors
      }
    });

    return {
      loadMoreElements: loadMoreElements.length,
      infiniteScroll,
      pagination,
      contentCount: maxContentCount,
      url: window.location.href
    };
  }

  // Expose functions to global scope for extension access
  window.loadMoreExtension = {
    expandContent,
    stopExpansion,
    analyzePage,
    findLoadMoreElements
  };

  // Reset stop flag
  window.loadMoreStopped = false;

})();