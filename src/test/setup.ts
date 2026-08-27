import "@testing-library/jest-dom";

// jsdom does not implement matchMedia, used for media-query CSS hooks.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom lacks crypto.randomUUID used by downloadStore.generateId().
if (!window.crypto?.randomUUID) {
  (window.crypto as Crypto).randomUUID = () =>
    ("test-" + Math.random().toString(36).slice(2) + Date.now().toString(36)) as `${string}-${string}-${string}-${string}-${string}`;
}

// Provide a minimal fetch so transport-level calls fail fast instead of hanging
// against the real localhost server during unit tests.
if (!window.fetch) {
  window.fetch = (() => {
    return async () => {
      throw new Error("fetch not available in jsdom tests; mock the transport");
    };
  }) as unknown as typeof fetch;
}