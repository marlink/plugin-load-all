import { jest } from '@jest/globals'
import { throttle, queryElements } from '../modules/utils.js'

jest.useFakeTimers()

describe('throttle', () => {
  test('invokes immediately and throttles subsequent calls within delay', () => {
    const fn = jest.fn()
    const throttled = throttle(fn, 100)

    throttled('a')
    throttled('b')
    throttled('c')

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')

    // Fast-forward time by 100ms to allow trailing call
    jest.advanceTimersByTime(100)

    // trailing should execute once with the latest args
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('c')
  })

  test('spaced calls execute separately', () => {
    const fn = jest.fn()
    const throttled = throttle(fn, 50)

    throttled(1)
    jest.advanceTimersByTime(60)
    throttled(2)
    jest.advanceTimersByTime(60)
    throttled(3)
    jest.advanceTimersByTime(60)

    expect(fn).toHaveBeenCalledTimes(3)
    expect(fn.mock.calls.map(args => args[0])).toEqual([1, 2, 3])
  })
})

describe('queryElements', () => {
  test('returns empty array and warns on invalid selector', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const result = queryElements(':::')
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(0)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  test('finds elements correctly', () => {
    document.body.innerHTML = `
      <div>
        <button class="load-more">Load More</button>
        <a class="show-more" href="#">Show More</a>
      </div>
    `
    const buttons = queryElements('button.load-more')
    const links = queryElements('a.show-more')
    expect(buttons.length).toBe(1)
    expect(links.length).toBe(1)
  })
})