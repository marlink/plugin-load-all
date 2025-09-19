/**
 * Execution Module - Handles all action-based functionality
 * Separated from detection logic for better code organization
 */

import { queryElements } from './utils.js';
import { SELECTORS } from './selectors.js';

/**
 * Clicks an element with proper event simulation
 * @param {Element} element - Element to click
 * @returns {boolean} - Success status
 */
export function clickElement(element) {
  if (!element || !element.click) {
    return false;
  }

  try {
    // Simulate proper click events
    const events = ['mousedown', 'mouseup', 'click'];
    events.forEach(eventType => {
      const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(event);
    });

    // Also trigger the native click
    element.click();
    return true;
  } catch (error) {
    console.warn('Failed to click element:', error);
    return false;
  }
}

/**
 * Expands hidden content elements
 * @returns {number} - Number of elements expanded
 */
export function expandHiddenContent() {
  const elements = queryElements(SELECTORS.HIDDEN_CONTENT);
  let expandedCount = 0;

  elements.forEach(element => {
    // Skip tiny elements (likely not content)
    const rect = element.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) {
      return;
    }

    // Try different expansion methods
    if (element.style.display === 'none') {
      element.style.display = '';
      expandedCount++;
    } else if (element.style.visibility === 'hidden') {
      element.style.visibility = 'visible';
      expandedCount++;
    } else if (element.hasAttribute('aria-hidden')) {
      element.removeAttribute('aria-hidden');
      expandedCount++;
    } else if (element.classList.contains('hidden')) {
      element.classList.remove('hidden');
      expandedCount++;
    }
  });

  return expandedCount;
}

/**
 * Scrolls to trigger lazy loading
 * @param {number} scrollAmount - Amount to scroll (default: window height)
 */
export function triggerLazyLoading(scrollAmount = window.innerHeight) {
  // Scroll down to trigger lazy loading
  window.scrollBy(0, scrollAmount);
  
  // Wait a bit then scroll back up slightly to ensure visibility
  setTimeout(() => {
    window.scrollBy(0, -50);
  }, 100);
}

/**
 * Handles infinite scroll detection and triggering
 * @returns {boolean} - Whether infinite scroll was triggered
 */
export function handleInfiniteScroll() {
  const scrollHeight = document.documentElement.scrollHeight;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const clientHeight = window.innerHeight;
  
  // Check if we're near the bottom (within 200px)
  const nearBottom = scrollHeight - scrollTop - clientHeight < 200;
  
  if (nearBottom) {
    // Trigger lazy loading
    triggerLazyLoading();
    
    // Look for lazy loading images and trigger them
    const lazyImages = queryElements(SELECTORS.LAZY_IMAGES);
    lazyImages.forEach(img => {
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      }
      if (img.dataset.lazySrc) {
        img.src = img.dataset.lazySrc;
        img.removeAttribute('data-lazy-src');
      }
    });
    
    return true;
  }
  
  return false;
}

/**
 * Navigates to the next page
 * @param {string} url - URL to navigate to
 * @returns {boolean} - Success status
 */
export function navigateToNextPage(url) {
  if (!url) return false;
  
  try {
    window.location.href = url;
    return true;
  } catch (error) {
    console.warn('Failed to navigate to next page:', error);
    return false;
  }
}

/**
 * Executes the main load more action
 * @param {Object} options - Execution options
 * @returns {Object} - Execution results
 */
export function executeLoadMore(options = {}) {
  const results = {
    success: false,
    action: null,
    elementsFound: 0,
    expandedContent: 0,
    error: null
  };

  try {
    // First, try to expand hidden content
    results.expandedContent = expandHiddenContent();
    
    // Look for load more buttons
    const loadMoreButtons = queryElements(SELECTORS.LOAD_MORE_BUTTONS);
    if (loadMoreButtons.length > 0) {
      const button = loadMoreButtons[0];
      if (clickElement(button)) {
        results.success = true;
        results.action = 'button_click';
        results.elementsFound = loadMoreButtons.length;
        return results;
      }
    }

    // Look for load more links
    const loadMoreLinks = queryElements(SELECTORS.LOAD_MORE_LINKS);
    if (loadMoreLinks.length > 0) {
      const link = loadMoreLinks[0];
      if (clickElement(link)) {
        results.success = true;
        results.action = 'link_click';
        results.elementsFound = loadMoreLinks.length;
        return results;
      }
    }

    // Try infinite scroll
    if (handleInfiniteScroll()) {
      results.success = true;
      results.action = 'infinite_scroll';
      return results;
    }

    // If nothing else worked, just expand content
    if (results.expandedContent > 0) {
      results.success = true;
      results.action = 'content_expansion';
    }

  } catch (error) {
    results.error = error.message;
    console.error('Error executing load more:', error);
  }

  return results;
}