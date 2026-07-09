import { cleanup } from "@testing-library/react";
import { afterEach } from "vite-plus/test";

if (
  typeof window !== "undefined" &&
  Object.getOwnPropertyDescriptor(window, "localStorage")?.writable !== true
) {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
    },
  });
}

if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: ResizeObserver,
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserver,
  });
}

afterEach(() => {
  cleanup();
});
