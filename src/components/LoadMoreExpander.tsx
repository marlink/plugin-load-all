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
  isProblematic: boolean
}

interface LoadingProgress {
  isLoading: boolean
  progress: number
  currentAction: string
  itemsLoaded: number
  clickCount: number
  estimatedRemaining: number
}

interface SecurityContext {
  isVpnDetected: boolean
  isCorporateNetwork: boolean
  isSafeToSendFeedback: boolean
}

interface FeedbackState {
  showFeedbackPrompt: boolean
  feedbackSent: boolean
  isSubmitting: boolean
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
    detectionConfidence: 0,
    isProblematic: false
  })

  const [progress, setProgress] = useState<LoadingProgress>({
    isLoading: false,
    progress: 0,
    currentAction: '',
    itemsLoaded: 0,
    clickCount: 0,
    estimatedRemaining: 0
  })

  const [security, setSecurity] = useState<SecurityContext>({
    isVpnDetected: false,
    isCorporateNetwork: false,
    isSafeToSendFeedback: true
  })

  const [feedback, setFeedback] = useState<FeedbackState>({
    showFeedbackPrompt: false,
    feedbackSent: false,
    isSubmitting: false
  })

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [showEscapeNotification, setShowEscapeNotification] = useState(false)

  useEffect(() => {
    analyzePage()
    checkSecurityContext()
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

  const checkSecurityContext = async () => {
    try {
      const vpnIndicators = ['vpn', 'proxy', 'tunnel', 'private']
      const corporateIndicators = ['.corp', '.internal', '.local', 'intranet']

      let isVpnDetected = false
      let isCorporateNetwork = false

      if (typeof window !== 'undefined' && window.location) {
        const hostname = window.location.hostname.toLowerCase()
        isVpnDetected = vpnIndicators.some(indicator => hostname.includes(indicator))
        isCorporateNetwork = corporateIndicators.some(indicator => hostname.includes(indicator))
      }

      const isSafeToSendFeedback = !isVpnDetected && !isCorporateNetwork

      setSecurity({
        isVpnDetected,
        isCorporateNetwork,
        isSafeToSendFeedback
      })
    } catch (error) {
      console.error('Security context check failed:', error)
      setSecurity({
        isVpnDetected: false,
        isCorporateNetwork: false,
        isSafeToSendFeedback: true
      })
    }
  }

  const sendAnonymousFeedback = async (pageUrl: string) => {
    if (!security.isSafeToSendFeedback) {
      console.log('Feedback not sent due to security context')
      return
    }

    setFeedback(prev => ({ ...prev, isSubmitting: true }))

    try {
      const feedbackData = {
        url: pageUrl,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        detectionStats: {
          buttons: stats.detectedButtons,
          links: stats.detectedLinks,
          confidence: stats.detectionConfidence
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
      console.log('Anonymous feedback sent:', feedbackData)
      
      setFeedback(prev => ({ 
        ...prev, 
        feedbackSent: true, 
        showFeedbackPrompt: false,
        isSubmitting: false 
      }))
    } catch (error) {
      console.error('Failed to send feedback:', error)
      setFeedback(prev => ({ ...prev, isSubmitting: false }))
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
            const isProblematic = normalizedConfidence < 30 || (detectedButtons === 0 && detectedLinks === 0 && !hasInfiniteScroll)

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
              detectionConfidence: normalizedConfidence,
              isProblematic
            }
          }
        })

        if (results && results[0] && results[0].result) {
          const result = results[0].result
          setStats(result)
          
          if (result.isProblematic && security.isSafeToSendFeedback) {
            setFeedback(prev => ({ ...prev, showFeedbackPrompt: true }))
          }
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
          detectionConfidence: 85,
          isProblematic: false
        })
      }
    } catch (error) {
      console.error('Failed to analyze page:', error)
      setError('Failed to analyze page. Make sure you\'re on a web page.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleTestFeedback = () => {
    setStats(prev => ({ ...prev, isProblematic: true }))
    setFeedback(prev => ({ ...prev, showFeedbackPrompt: true, feedbackSent: false }))
  }

  const handleLoadNext = async () => {
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
      console.error('Failed to load next batch:', error)
      setError('Failed to load next batch')
      setProgress(prev => ({ ...prev, isLoading: false }))
    }
  }

  const handleLoadAll = async () => {
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
      console.error('Failed to load all content:', error)
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
      console.error('Failed to stop expansion:', error)
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
        <div className="fixed top-4 right-4 z-50 bg-black/80 backdrop-blur-sm text-white px-4 py-2 rounded-lg shadow-lg border border-white/20 animate-pulse">
          <div className="flex items-center gap-2 text-sm">
            <span>⌨️</span>
            <span>Press <kbd className="bg-white/20 px-1.5 py-0.5 rounded text-xs">ESC</kbd> to stop</span>
          </div>
        </div>
      )}

      <div className="w-full max-w-sm mx-auto p-4 space-y-4">
        <div className="rounded-xl border border-gray-200/50 bg-white/80 backdrop-blur-sm shadow-lg">
          <div className="flex flex-col space-y-1.5 p-6 pb-4">
            <h3 className="text-xl font-bold leading-none tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <span className="text-white text-lg">⚡</span>
              </div>
              Load More Expander
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">v3.0</span>
            </h3>
            <p className="text-sm text-gray-600 flex items-center gap-2 ml-11">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              {stats.pageUrl ? new URL(stats.pageUrl).hostname : 'Analyzing page...'}
            </p>
          </div>
        
          <div className="p-6 pt-0 space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                <span>⚠️</span>
                {error}
              </div>
            )}

            {feedback.showFeedbackPrompt && !feedback.feedbackSent && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 mt-0.5">🤔</span>
                  <div className="flex-1">
                    <p className="text-sm text-amber-800 font-medium">Pattern detection seems tricky on this page</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Help improve the extension by sharing this page anonymously with the developer?
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => sendAnonymousFeedback(stats.pageUrl)}
                    disabled={feedback.isSubmitting}
                    className="px-3 py-1.5 bg-amber-600 text-white text-xs rounded-md hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {feedback.isSubmitting ? 'Sending...' : 'Send Anonymously'}
                  </button>
                  <button
                    onClick={() => setFeedback(prev => ({ ...prev, showFeedbackPrompt: false }))}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded-md hover:bg-gray-300"
                  >
                    No Thanks
                  </button>
                </div>
              </div>
            )}

            {feedback.feedbackSent && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                <span>✅</span>
                Thank you! Your feedback helps improve the extension.
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">Smart Analysis</span>
                  <div className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    Auto-detects load patterns
                  </div>
                </div>
                {isAnalyzing && (
                  <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <div className="text-blue-600 font-medium">{stats.detectedButtons}</div>
                  <div className="text-blue-700 text-xs">Load Buttons</div>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                  <div className="text-purple-600 font-medium">{stats.detectedLinks}</div>
                  <div className="text-purple-700 text-xs">Page Links</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                  <div className="text-green-600 font-medium">{stats.contentElements}</div>
                  <div className="text-green-700 text-xs">Current Items</div>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                  <div className="text-orange-600 font-medium">{stats.estimatedTotal}</div>
                  <div className="text-orange-700 text-xs">Est. Total</div>
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Detection Method:</span>
                  <span className="font-medium text-gray-800">{stats.loadingMethod}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-gray-600">Confidence:</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${
                          stats.detectionConfidence >= 70 ? 'bg-green-500' :
                          stats.detectionConfidence >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${stats.detectionConfidence}%` }}
                      ></div>
                    </div>
                    <span className="text-xs font-medium text-gray-700">{Math.round(stats.detectionConfidence)}%</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                {stats.hasInfiniteScroll && (
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full">∞ Infinite Scroll</span>
                )}
                {stats.hasPagination && (
                  <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">📄 Pagination</span>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-800">Load Estimation</div>
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-3 rounded-lg border border-blue-100">
                <div className="text-sm text-gray-700">
                  <div className="flex justify-between">
                    <span>Next batch:</span>
                    <span className="font-medium">~{stats.estimatedPerBatch} items</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Remaining:</span>
                    <span className="font-medium">~{Math.max(0, stats.estimatedTotal - stats.contentElements)} items</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-800">Controls</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleLoadNext}
                  disabled={!canExpand || progress.isLoading}
                  className="px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-medium text-sm hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>🔄</span>
                    <span>Load Next</span>
                    <span className="text-xs opacity-80">({stats.estimatedPerBatch} items)</span>
                  </div>
                </button>
                <button
                  onClick={handleLoadAll}
                  disabled={!canExpand || progress.isLoading}
                  className="px-4 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg font-medium text-sm hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>⚡</span>
                    <span>Load All</span>
                    <span className="text-xs opacity-80">(~{Math.max(0, stats.estimatedTotal - stats.contentElements)} items)</span>
                  </div>
                </button>
              </div>
              
              {progress.isLoading && (
                <button
                  onClick={handleStop}
                  className="w-full px-4 py-2 bg-red-500 text-white rounded-lg font-medium text-sm hover:bg-red-600 transition-colors duration-200"
                >
                  🛑 Stop Loading
                </button>
              )}
            </div>

            {progress.isLoading && (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-800">Progress</div>
                <div className="space-y-2">
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300 ease-out"
                      style={{ width: `${progress.progress}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-600">{progress.currentAction}</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center">
                      <div className="font-medium text-gray-800">{progress.clickCount}</div>
                      <div className="text-gray-600">Clicks</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium text-gray-800">{progress.itemsLoaded}</div>
                      <div className="text-gray-600">Loaded</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium text-gray-800">{progress.estimatedRemaining}</div>
                      <div className="text-gray-600">Remaining</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <button
                onClick={analyzePage}
                disabled={isAnalyzing}
                className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                {isAnalyzing ? 'Analyzing...' : '🔄 Re-analyze'}
              </button>
              
              <button
                onClick={handleTestFeedback}
                className="w-2 h-2 bg-gray-300 hover:bg-gray-400 rounded-full opacity-20 hover:opacity-60 transition-opacity"
                title="Test feedback (dev only)"
              >
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default LoadMoreExpander