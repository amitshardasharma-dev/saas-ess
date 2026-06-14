import '@testing-library/jest-dom'

// Required for React 19 concurrent mode to work correctly with act() in tests
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Suppress React 19 act() warnings that arise when using flushSync for
// synchronous rendering in tests. These are cosmetic warnings — all assertions
// still work correctly. Remove this block once RTL fully supports React 19.
const originalError = console.error.bind(console)
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    const msg = typeof args[0] === 'string' ? args[0] : ''
    if (msg.includes('not wrapped in act(') || msg.includes('inside a test was not wrapped')) return
    originalError(...args)
  })
})
afterAll(() => {
  jest.restoreAllMocks()
})
