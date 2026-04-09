// This file runs before jest-environment and the test framework are loaded.
// Polyfills here are available when modules like React's scheduler are first imported.

// React 19's concurrent scheduler requires MessageChannel to schedule work.
// jsdom does not provide MessageChannel, so we polyfill it here using Node's worker_threads.
if (typeof MessageChannel === 'undefined') {
  const { MessageChannel: NodeMessageChannel } = require('worker_threads')
  // @ts-ignore
  globalThis.MessageChannel = NodeMessageChannel
}
