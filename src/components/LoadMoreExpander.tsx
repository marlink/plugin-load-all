import React, { useState, useEffect } from 'react'

interface ContentStats {
  detectedButtons: number
  detectedLinks: number
  loadingMethod: string
  contentElements: number
  estimatedTotal: number
  estimatedPerBatch: number
  pageUrl: string
  hasInfiniteScroll: boolean
  hasPagination: boolean
  detectionConfidence: number
}

interface LoadingProgress {
  isLoading: boolean
  progress: number
  currentAction: string
  itemsLoaded: number
  clickCount: number
  estimatedRemaining: number
}

const LoadMoreExpander: React.FC = () => {
  const [stats, setStats] = useState<ContentStats>({
    detectedButtons: 0,
    detectedLinks: 0,
    loadingMethod: 'Unknown',
    contentElements: 0,
    estimatedTotal: 0,
    estimatedPerBatch: 0,
    pageUrl: '',
    hasInfiniteScroll: false,
    hasPagination: false,
    detectionConfidence: 0
  })

  const [progress, setProgress] = useState<LoadingProgress>({
    isLoading: false,
    progress: 0,
    currentAction: '',
    itemsLoaded: 0,
    clickCount: 0,
    estimatedRemaining: 0
  })

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [showEscapeNotification, setShowEscapeNotification] = useState(false)

  useEffect(() => {
    analyzePage()
  }, [])

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && progress.isLoading) {
        handleStop()
        setShowEscapeNotification(true)
        setTimeout(() => setShowEscapeNotification(false), 3000)
      }
    }

    document.addEventListener('keydown', handleKeyPress)
    return () => document.removeEventListener('keydown', handleKeyPress)
  }, [progress.isLoading])

  // Enhanced smooth scrolling function with proper positioning
  const smoothScrollToLoadMore = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
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
              for (const selector of loadMoreSelectors) {
                try {
                  const elements = document.querySelectorAll(selector)
                  if (elements.length > 0) {
                    // Find the first visible element
                    for (const element of elements) {
                      const rect = element.getBoundingClientRect()
                      const isVisible = rect.width > 0 && rect.height > 0 && 
                                      rect.top >= 0 && rect.left >= 0 &&
                                      rect.bottom <= window.innerHeight && 
                                      rect.right <= window.innerWidth
                      if (isVisible || rect.top > 0) {
                        targetElement = element as HTMLElement
                        break
                      }
                    }
                    if (targetElement) break
                  }
                } catch (e) {
                  // Skip invalid selectors
                  continue
                }
              }
              
              if (targetElement) {
                // Calculate position to place button at top of viewport with some margin
                const rect = targetElement.getBoundingClientRect()
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop
                const targetY = scrollTop + rect.top - 80 // 80px margin from top
                
                // Smooth scroll to position
                window.scrollTo({
                  top: Math.max(0, targetY),
                  behavior: 'smooth'
                })
                
                // Add visual highlight for 500ms
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
                
                return true // Success
              }
              return false // No element found
            }
          }).then((results) => {
            // Scroll operation completed
          }).catch((error) => {
            // Error during scroll operation
          })
        }
      })
    }
  }

  const analyzePage = async () => {
    setIsAnalyzing(true)
    setError('')
    
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        
        if (!tab.id) {
          throw new Error('No active tab found')
        }

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const buttonSelectors = [
              'button[class*="load"], button[class*="more"], button[class*="show"]',
              'a[class*="load"], a[class*="more"], a[class*="show"]',
              '[class*="load-more"], [class*="show-more"], [class*="view-more"]',
              '.pagination a, .pager a',
              '[data-testid*="load"], [data-testid*="more"]'
            ]

            const linkSelectors = [
              'a[href*="page="], a[href*="p="], a[href*="offset="]',
              'a[class*="next"], a[class*="continue"]',
              '.pagination a:not(.current):not(.active)'
            ]

            let detectedButtons = 0
            let detectedLinks = 0
            let confidence = 0

            buttonSelectors.forEach((selector, index) => {
              try {
                const elements = document.querySelectorAll(selector)
                const weight = 1 - (index * 0.1)
                detectedButtons += elements.length
                confidence += elements.length * weight
              } catch (e) {
                // Ignore selector errors
              }
            })

            linkSelectors.forEach((selector, index) => {
              try {
                const elements = document.querySelectorAll(selector)
                const weight = 1 - (index * 0.1)
                detectedLinks += elements.length
                confidence += elements.length * weight
              } catch (e) {
                // Ignore selector errors
              }
            })

            const contentSelectors = [
              'article', '.post', '.item', '.card', '.product',
              '[class*="item"]', '[class*="post"]', '[class*="card"]',
              'li:not(nav li):not(.menu li)', '.entry', '.listing'
            ]

            let contentElements = 0
            contentSelectors.forEach(selector => {
              try {
                const elements = document.querySelectorAll(selector)
                contentElements = Math.max(contentElements, elements.length)
              } catch (e) {
                // Ignore selector errors
              }
            })

            const hasInfiniteScroll = !!(
              document.querySelector('[class*="infinite"]') ||
              document.querySelector('[data-infinite]') ||
              window.IntersectionObserver
            )

            const hasPagination = !!(
              document.querySelector('.pagination') ||
              document.querySelector('.pager') ||
              document.querySelector('[class*="page-nav"]')
            )

            const estimatedPerBatch = Math.max(5, Math.floor(contentElements * 0.3))
            const estimatedTotal = contentElements + (estimatedPerBatch * Math.max(1, detectedButtons + detectedLinks))
            const normalizedConfidence = Math.min(100, Math.max(0, confidence * 20))

            return {
              detectedButtons,
              detectedLinks,
              loadingMethod: hasInfiniteScroll ? 'Infinite Scroll' : 
                           hasPagination ? 'Pagination' : 
                           detectedButtons > 0 ? 'Load More Buttons' : 'Unknown',
              contentElements,
              estimatedTotal,
              estimatedPerBatch,
              pageUrl: window.location.href,
              hasInfiniteScroll,
              hasPagination,
              detectionConfidence: normalizedConfidence
            }
          }
        })

        if (results && results[0] && results[0].result) {
          const result = results[0].result
          setStats(result)
        }
      } else {
        setStats({
          detectedButtons: 2,
          detectedLinks: 1,
          loadingMethod: 'Demo Mode',
          contentElements: 25,
          estimatedTotal: 100,
          estimatedPerBatch: 12,
          pageUrl: 'demo://localhost',
          hasInfiniteScroll: true,
          hasPagination: false,
          detectionConfidence: 85
        })
      }
    } catch (error) {
      setError('Failed to analyze page. Make sure you\'re on a web page.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleLoadNext = async () => {
    smoothScrollToLoadMore()
    
    const estimatedItems = stats.estimatedPerBatch
    setProgress({ 
      isLoading: true, 
      progress: 0, 
      currentAction: `Loading next ${estimatedItems} items...`, 
      itemsLoaded: 0,
      clickCount: 0,
      estimatedRemaining: estimatedItems
    })
    setError('')
    
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        
        if (!tab.id) {
          throw new Error('No active tab found')
        }

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        })

        await chrome.tabs.sendMessage(tab.id, {
          type: 'START_EXPANSION',
          options: { maxClicks: 1, delay: 1500, method: 'single' }
        })
      } else {
        simulateProgress('single')
      }
    } catch (error) {
      setError('Failed to load next batch')
      setProgress(prev => ({ ...prev, isLoading: false }))
    }
  }

  const handleLoadAll = async () => {
    smoothScrollToLoadMore()
    
    const estimatedItems = stats.estimatedTotal - stats.contentElements
    setProgress({ 
      isLoading: true, 
      progress: 0, 
      currentAction: `Loading all remaining content (~${estimatedItems} items)...`, 
      itemsLoaded: 0,
      clickCount: 0,
      estimatedRemaining: estimatedItems
    })
    setError('')
    
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        
        if (!tab.id) {
          throw new Error('No active tab found')
        }

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        })

        await chrome.tabs.sendMessage(tab.id, {
          type: 'START_EXPANSION',
          options: { maxClicks: 20, delay: 2000, method: 'all' }
        })
      } else {
        simulateProgress('all')
      }
    } catch (error) {
      setError('Failed to load all content')
      setProgress(prev => ({ ...prev, isLoading: false }))
    }
  }

  const handleStop = async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        
        if (tab.id) {
          await chrome.tabs.sendMessage(tab.id, { type: 'STOP_EXPANSION' })
        }
      }
      
      setProgress(prev => ({ ...prev, isLoading: false, currentAction: 'Stopped by user' }))
    } catch (error) {
      setError('Failed to stop loading. Please try again.')
    }
  }

  const simulateProgress = (mode: 'single' | 'all') => {
    let currentProgress = 0
    const maxProgress = mode === 'single' ? 100 : 100
    const increment = mode === 'single' ? 25 : 10
    const itemsPerStep = mode === 'single' ? stats.estimatedPerBatch / 4 : stats.estimatedPerBatch / 10
    
    const interval = setInterval(() => {
      currentProgress += increment
      setProgress(prev => ({
        ...prev,
        progress: Math.min(currentProgress, 100),
        currentAction: mode === 'single' 
          ? `Demo: Loading next batch... ${Math.min(currentProgress, 100)}%`
          : `Demo: Loading all content... ${Math.min(currentProgress, 100)}%`,
        itemsLoaded: prev.itemsLoaded + Math.floor(itemsPerStep),
        clickCount: Math.floor(currentProgress / (mode === 'single' ? 100 : 20)),
        estimatedRemaining: Math.max(0, prev.estimatedRemaining - Math.floor(itemsPerStep))
      }))
      
      if (currentProgress >= 100) {
        clearInterval(interval)
        setProgress(prev => ({ 
          ...prev, 
          isLoading: false, 
          currentAction: mode === 'single' ? 'Next batch loaded!' : 'All content loaded!',
          estimatedRemaining: 0
        }))
      }
    }, mode === 'single' ? 400 : 800)
  }

  const totalDetected = stats.detectedButtons + stats.detectedLinks
  const canExpand = totalDetected > 0 || stats.hasInfiniteScroll

  return (
    <>
      {showEscapeNotification && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900/95 backdrop-blur-sm text-white px-4 py-3 rounded-lg shadow-xl border border-gray-700">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span>⌨️</span>
            <span>Press <kbd className="bg-white/20 px-2 py-1 rounded text-xs font-mono">ESC</kbd> to stop</span>
          </div>
        </div>
      )}

      <div className="w-full max-w-sm mx-auto p-4 space-y-4">
        {/* Top Buttons - Load Next and Load All */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={handleLoadNext}
            disabled={!canExpand}
            className="flex-1 px-3 py-2 bg-gray-900 text-white rounded-lg font-semibold text-xs hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md"
          >
            Load Next
          </button>
          <span className="text-xs text-gray-400 font-medium">or</span>
          <button
            onClick={handleLoadAll}
            disabled={!canExpand}
            className="flex-1 px-3 py-2 bg-blue-500 text-white rounded-lg font-semibold text-xs hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md"
          >
            Load All
          </button>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-xl">
          <div className="p-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-3">
                <span className="text-lg">⚠️</span>
                <span className="font-medium">{error}</span>
              </div>
            )}





            {/* Page Analysis Section (without heading) */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-center">
                  <div className="text-xl font-bold text-gray-900">{stats.detectedButtons}</div>
                  <div className="text-xs text-gray-600 font-medium">Load Buttons</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-center">
                  <div className="text-xl font-bold text-gray-900">{stats.detectedLinks}</div>
                  <div className="text-xs text-gray-600 font-medium">Page Links</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-center">
                  <div className="text-xl font-bold text-gray-900">{stats.contentElements}</div>
                  <div className="text-xs text-gray-600 font-medium">Current Items</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-center">
                  <div className="text-xl font-bold text-gray-900">{stats.estimatedTotal}</div>
                  <div className="text-xs text-gray-600 font-medium">Est. Total</div>
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700">Detection Method</span>
                  <span className="text-xs font-semibold text-gray-900">{stats.loadingMethod}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">Confidence</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          stats.detectionConfidence >= 70 ? 'bg-blue-500' :
                          stats.detectionConfidence >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${stats.detectionConfidence}%` }}
                      ></div>
                    </div>
                    <span className="text-xs font-semibold text-gray-900 min-w-[2.5rem]">{Math.round(stats.detectionConfidence)}%</span>
                  </div>
                </div>
              </div>

              {(stats.hasInfiniteScroll || stats.hasPagination) && (
                <div className="flex gap-2">
                  {stats.hasInfiniteScroll && (
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">∞ Infinite Scroll</span>
                  )}
                  {stats.hasPagination && (
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">📄 Pagination</span>
                  )}
                </div>
              )}
            </div>

            {/* Progress */}
            {progress.isLoading && (
              <div className="space-y-3">
                <h4 className="text-base font-semibold text-gray-900">Progress</h4>
                <div className="space-y-2">
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300 ease-out"
                      style={{ width: `${progress.progress}%` }}
                    ></div>
                  </div>
                  <div className="text-xs font-medium text-gray-700 text-center">{progress.currentAction}</div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-lg font-bold text-gray-900">{progress.clickCount}</div>
                      <div className="text-xs text-gray-600">Clicks</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-gray-900">{progress.itemsLoaded}</div>
                      <div className="text-xs text-gray-600">Loaded</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-gray-900">{progress.estimatedRemaining}</div>
                      <div className="text-xs text-gray-600">Remaining</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Section - Single Row with SHOW BN and Re-analyze buttons */}
            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between gap-2">
                {/* Left - Logo with enhanced styling */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
                    <img src="./icons/icon48.svg" alt="Blind nudist" className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Blind nudist</h3>
                    <p className="text-xs text-gray-600 flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      {stats.pageUrl ? new URL(stats.pageUrl).hostname : 'Analyzing...'}
                      {isAnalyzing && (
                        <div className="w-3 h-3 border border-gray-300 border-t-blue-500 rounded-full animate-spin ml-1"></div>
                      )}
                    </p>
                  </div>
                </div>

                {/* Right - Buttons */}
                <div className="flex items-center gap-2">
                  {/* Re-analyze Page button with minimal width */}
                  <button
                    onClick={analyzePage}
                    disabled={isAnalyzing}
                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 font-medium transition-colors duration-200 border border-gray-200 rounded"
                    style={{width: 'auto', minWidth: '0'}}
                  >
                    {isAnalyzing ? '...' : '🔄'}
                  </button>
                  
                  {/* SHOW BN button */}
                  {!progress.isLoading && (
                    <button
                      onClick={handleLoadNext}
                      disabled={!stats.detectedButtons && !stats.detectedLinks}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold text-xs hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 shadow-md"
                    >
                      SHOW BN
                    </button>
                  )}
                  
                  {/* Stop button when loading */}
                  {progress.isLoading && (
                    <button
                      onClick={handleStop}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg font-semibold text-xs hover:bg-red-600 transition-colors duration-200 shadow-md"
                    >
                      🛑 Stop
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default LoadMoreExpander