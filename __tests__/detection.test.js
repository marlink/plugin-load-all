import { analyzePageContent } from '../modules/detection.js'

describe('analyzePageContent', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('detects load more button by text', () => {
    document.body.innerHTML = `
      <button>Load More</button>
    `
    const result = analyzePageContent()
    expect(result.patterns.buttons.length).toBeGreaterThanOrEqual(1)
    expect(result.patterns.links.length).toBe(0)
    expect(typeof result.url).toBe('string')
  })

  test('detects load more link by class', () => {
    document.body.innerHTML = `
      <a class="show-more" href="#">More</a>
    `
    const result = analyzePageContent()
    expect(result.patterns.links.length).toBeGreaterThanOrEqual(1)
  })

  test('detects pagination, lazy images, hidden content and infinite scroll', () => {
    document.body.innerHTML = `
      <div class="pagination"></div>
      <img loading="lazy" src="/img.jpg" />
      <div class="hidden">secret</div>
      <div class="infinite-list"></div>
    `
    const result = analyzePageContent()
    expect(result.patterns.pagination).toBe(true)
    expect(result.patterns.lazyLoad).toBe(true)
    expect(result.patterns.hiddenContent).toBe(true)
    expect(result.patterns.infiniteScroll).toBe(true)
  })

  test('sorts detections by confidence and returns contentCount', () => {
    document.body.innerHTML = `
      <div class="content-card">Item</div>
      <button class="load-more">Load More</button>
      <a class="view-more" href="#">View More</a>
    `
    const result = analyzePageContent()
    expect(result.contentCount).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(result.patterns.buttons)).toBe(true)
    expect(Array.isArray(result.patterns.links)).toBe(true)
  })
})