// Background service worker for Load More Extension
// Handles extension lifecycle and communication

// Initialize security utilities
const security = new SecurityUtils();

chrome.runtime.onInstalled.addListener(() => {
  console.log('Load More Extension installed')
})

// Handle messages from popup and content scripts with security validation
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    // Validate message structure and content
    const validation = security.validateMessage(message);
    if (!validation.valid) {
      console.error('Invalid message:', validation.error);
      sendResponse({ error: validation.error });
      return;
    }

    // Validate sender context
    if (!sender.tab?.id || sender.tab.id < 0) {
      sendResponse({ error: 'Invalid sender context' });
      return;
    }

    // Rate limiting check
    const rateCheck = security.checkRateLimit(`bg-${sender.tab.id}`);
    if (!rateCheck.allowed) {
      console.error('Rate limit exceeded for background operations');
      sendResponse({ error: rateCheck.error });
      return;
    }

    switch (message.type) {
      case 'SCAN_PAGE':
        handleScanPage(sender.tab.id, sendResponse);
        return true; // Keep message channel open for async response
        
      case 'EXPAND_CONTENT':
        if (message.options && typeof message.options === 'object') {
          handleExpandContent(sender.tab.id, message.options, sendResponse);
          return true;
        } else {
          sendResponse({ error: 'Invalid expansion options' });
        }
        break;
        
      case 'STOP_EXPANSION':
        handleStopExpansion(sender.tab.id, sendResponse);
        return true;
        
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('Background message handling error:', error);
    sendResponse({ error: 'Internal error processing message' });
  }
})

async function handleScanPage(tabId, sendResponse) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    sendResponse({ error: 'Invalid tab ID' });
    return;
  }

  try {
    // Validate tab exists and is accessible
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !security.validateUrl(tab.url)) {
      sendResponse({ error: 'Invalid or inaccessible tab' });
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: secureScriptScanForLoadMoreElements
    });
    
    sendResponse({ success: true, data: results[0]?.result });
  } catch (error) {
    console.error('Scan page error:', error);
    sendResponse({ error: 'Failed to scan page content' });
  }
}

async function handleExpandContent(tabId, options, sendResponse) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    sendResponse({ error: 'Invalid tab ID' });
    return;
  }

  try {
    // Validate tab exists and is accessible
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !security.validateUrl(tab.url)) {
      sendResponse({ error: 'Invalid or inaccessible tab' });
      return;
    }

    // Sanitize options before injection
    const sanitizedOptions = {
      maxClicks: Math.min(Math.max(parseInt(options.maxClicks) || 5, 1), 20),
      delay: Math.min(Math.max(parseInt(options.delay) || 1000, 500), 10000),
      method: ['button', 'link', 'scroll'].includes(options.method) ? options.method : 'button'
    };

    await chrome.scripting.executeScript({
       target: { tabId },
       func: secureScriptExpandContent,
       args: [sanitizedOptions]
     });
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Expand content error:', error);
    sendResponse({ error: 'Failed to expand content' });
  }
}

async function handleStopExpansion(tabId, sendResponse) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    sendResponse({ error: 'Invalid tab ID' });
    return;
  }

  try {
    // Validate tab exists and is accessible
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !security.validateUrl(tab.url)) {
      sendResponse({ error: 'Invalid or inaccessible tab' });
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      func: secureScriptStopContentExpansion
    });
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Stop expansion error:', error);
    sendResponse({ error: 'Failed to stop expansion' });
  }
}

// Secure functions to be injected into web pages
function secureScriptScanForLoadMoreElements() {
  // Secure selectors for "Load More" elements (no dangerous patterns)
  const loadMoreSelectors = [
    // Safe class name patterns
    'button[class*="load-more"]',
    'button[class*="show-more"]',
    'button[class*="view-more"]',
    'a[class*="load-more"]',
    'a[class*="show-more"]',
    
    // Safe pagination selectors
    'button[class*="next"]',
    'a[class*="next"]',
    '.pagination button',
    '.pagination a',
    '.pager button',
    '.pager a',
    
    // Safe data attributes
    '[data-testid*="load"]',
    '[data-testid*="more"]'
  ]

  let detectedElements = []
  let loadingMethod = 'None'

  // Check each selector with security validation
  for (const selector of loadMoreSelectors) {
    try {
      // Validate selector safety
      if (selector.includes('javascript:') || selector.includes('data:') || selector.includes('eval(')) {
        continue;
      }

      const elements = Array.from(document.querySelectorAll(selector));

      if (elements.length > 0) {
        detectedElements.push(...elements.map(el => ({
          tagName: el.tagName,
          className: (el.className || '').substring(0, 100),
          textContent: (el.textContent || '').trim().substring(0, 50),
          selector: selector.substring(0, 100)
        })));
        loadingMethod = 'Button/Link';
      }
    } catch (e) {
      console.warn('Selector failed:', selector, e);
    }
  }

  // Check for infinite scroll indicators
  const scrollHeight = document.documentElement.scrollHeight;
  const clientHeight = document.documentElement.clientHeight;
  if (scrollHeight > clientHeight * 1.5) {
    loadingMethod = loadingMethod === 'None' ? 'Infinite Scroll' : 'Mixed';
  }

  // Estimate content size with safe selectors
  const contentSelectors = [
    'article', '.post', '.item', '.card', '.entry', '.row', '.tile'
  ];
  
  let contentElements = [];
  for (const selector of contentSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > contentElements.length) {
        contentElements = Array.from(elements);
      }
    } catch (e) {
      console.warn('Content selector failed:', selector, e);
    }
  }

  return {
    detectedElements: Math.min(detectedElements.length, 1000),
    loadingMethod,
    contentElements: Math.min(contentElements.length, 10000),
    estimatedTotal: Math.max(contentElements.length * 2, detectedElements.length * 10, 50),
    pageHeight: Math.min(scrollHeight, 1000000),
    viewportHeight: Math.min(clientHeight, 10000),
    url: window.location.href.substring(0, 500)
  };
}

function secureScriptExpandContent(options = {}) {
  // Validate and sanitize options
  const maxClicks = Math.min(Math.max(parseInt(options.maxClicks) || 5, 1), 20);
  const delay = Math.min(Math.max(parseInt(options.delay) || 1000, 500), 10000);
  const method = ['button', 'link', 'scroll'].includes(options.method) ? options.method : 'button';
  
  window.loadMoreExpansionActive = true;
  window.loadMoreExpansionStopped = false;
  
  let clicksPerformed = 0;
  const startTime = Date.now();
  const maxDuration = 300000; // 5 minutes max
  
  async function performSecureExpansion() {
    if (window.loadMoreExpansionStopped || 
        clicksPerformed >= maxClicks || 
        (Date.now() - startTime) > maxDuration) {
      window.loadMoreExpansionActive = false;
      return;
    }

    // Safe selectors only
    const safeSelectors = [
      'button[class*="load-more"]',
      'button[class*="show-more"]',
      'a[class*="load-more"]',
      'a[class*="show-more"]',
      '.pagination button',
      '.pager button'
    ];

    let actionPerformed = false;
    
    for (const selector of safeSelectors) {
      try {
        // Validate selector safety
        if (selector.includes('javascript:') || selector.includes('data:') || selector.includes('eval(')) {
          continue;
        }

        const elements = Array.from(document.querySelectorAll(selector)).filter(el => 
          el.offsetParent !== null && // Element is visible
          !el.disabled && // Element is not disabled
          el.getBoundingClientRect().width > 0 && // Has dimensions
          el.getBoundingClientRect().height > 0
        );

        for (const element of elements.slice(0, 1)) { // Only click first match
          if (window.loadMoreExpansionStopped) return;
          
          try {
            element.click();
            actionPerformed = true;
            clicksPerformed++;
            
            await new Promise(resolve => setTimeout(resolve, delay));
            break;
          } catch (clickError) {
            console.warn('Click failed:', clickError);
          }
        }
        
        if (actionPerformed) break;
      } catch (e) {
        console.warn('Selector failed:', selector, e);
      }
    }

    // If no buttons found and scroll method allowed, try safe scrolling
    if (!actionPerformed && method === 'scroll') {
      try {
        const currentHeight = document.documentElement.scrollHeight;
        window.scrollTo({
          top: currentHeight,
          behavior: 'smooth'
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        actionPerformed = true;
      } catch (scrollError) {
        console.warn('Scroll failed:', scrollError);
      }
    }

    // Continue if action was performed and within limits
    if (actionPerformed && clicksPerformed < maxClicks && !window.loadMoreExpansionStopped) {
      setTimeout(performSecureExpansion, delay);
    } else {
      window.loadMoreExpansionActive = false;
      try {
        chrome.runtime.sendMessage({
          type: 'EXPANSION_COMPLETE',
          clicksPerformed: clicksPerformed,
          duration: Date.now() - startTime
        });
      } catch (msgError) {
        console.warn('Failed to send completion message:', msgError);
      }
    }
  }

  performSecureExpansion();
}

function secureScriptStopContentExpansion() {
  window.loadMoreExpansionStopped = true;
  window.loadMoreExpansionActive = false;
}