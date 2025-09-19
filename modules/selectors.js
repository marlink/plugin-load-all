/**
 * Selectors Module - Centralized CSS selectors for the extension
 */

export const SELECTORS = {
  CLICKABLE_ELEMENTS: 'button, a, [role="button"], [onclick], [data-action], [data-load-more], [data-toggle], [data-expand], .load-more, .show-more, .view-more, .expand',
  LOAD_MORE_BUTTONS: 'button[class*="load-more"]:not([disabled]), button[class*="show-more"]:not([disabled]), button[class*="view-more"]:not([disabled])',
  LOAD_MORE_LINKS: 'a[class*="load-more"], a[class*="show-more"], a[class*="view-more"]',
  LAZY_IMAGES: 'img[loading="lazy"], img[data-src], img[data-lazy], img[data-lazy-src], [data-lazy-load], [data-lazyload]',
  PAGINATION: '.pagination, .pager, [class*="pagination"], [class*="page-nav"]',
  CONTENT_CONTAINERS: 'article, .post, .item, .card, .entry, [class*="content"], [class*="item"], [class*="post"]',
  HIDDEN_CONTENT: '.hidden, .collapse:not(.show), [aria-hidden="true"], [style*="display: none"], [style*="display:none"], [style*="visibility: hidden"], [style*="visibility:hidden"], .accordion-content:not(.active), .tab-content:not(.active), [data-hidden="true"], [data-collapsed="true"]',
  CACHE_KEY_ELEMENTS: 'button, a[href], [role="button"]',
  ALL_ELEMENTS: '*'
};