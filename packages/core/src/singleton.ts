const store = globalThis as typeof globalThis & { __cpgSingletons?: Map<unknown, unknown> };

/**
 * Process-wide lazy singleton kept on `globalThis`, so dev-server hot reloads reuse it instead of
 * opening yet another database connection. `key` may be a string or an object (compared by
 * identity). A rejected promise is dropped, so the next call retries.
 */
export function globalSingleton<T>(key: unknown, create: () => T): T {
  const singletons = (store.__cpgSingletons ??= new Map());
  if (!singletons.has(key)) {
    const value = create();
    singletons.set(key, value);
    if (value instanceof Promise) value.catch(() => singletons.delete(key));
  }
  return singletons.get(key) as T;
}
