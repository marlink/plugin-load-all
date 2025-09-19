/**
 * Utility functions for DOM manipulation and performance optimization
 */

/**
 * Query elements with enhanced error handling and optional single element return
 * @param {string} selector - CSS selector
 * @param {Document|Element} context - Context to search within (default: document)
 * @param {boolean} single - Return single element instead of array
 * @returns {Element[]|Element|null} - Found elements or single element
 */
export function queryElements(selector, context = document, single = false) {
  try {
    if (single) {
      return context.querySelector(selector);
    }
    return Array.from(context.querySelectorAll(selector));
  } catch (error) {
    console.warn('Invalid selector:', selector, error);
    return single ? null : [];
  }
}

/**
 * Throttle function execution to improve performance
 * @param {Function} func - Function to throttle
 * @param {number} delay - Delay in milliseconds (default: 100)
 * @returns {Function} - Throttled function
 */
export function throttle(func, delay = 100) {
  let timeoutId;
  let lastExecTime = 0;
  
  return function (...args) {
    const currentTime = Date.now();
    
    if (currentTime - lastExecTime > delay) {
      func.apply(this, args);
      lastExecTime = currentTime;
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastExecTime = Date.now();
      }, delay - (currentTime - lastExecTime));
    }
  };
}