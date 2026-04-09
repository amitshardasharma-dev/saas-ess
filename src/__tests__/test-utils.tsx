/**
 * Custom test utilities for React 19 + Jest.
 *
 * React 19 uses concurrent rendering via the scheduler, which requires
 * MessageChannel (or setTimeout) macrotask processing that Jest's sync
 * test runner doesn't automatically flush. Using `flushSync` from react-dom
 * forces synchronous rendering, making RTL assertions work without async/await.
 */
import React from 'react'
import { render as rtlRender, RenderOptions, RenderResult } from '@testing-library/react'
import { flushSync } from 'react-dom'

export function render(ui: React.ReactElement, options?: RenderOptions): RenderResult {
  let result!: RenderResult
  flushSync(() => {
    result = rtlRender(ui, options)
  })
  return result
}

// Re-export everything from @testing-library/react
export * from '@testing-library/react'
