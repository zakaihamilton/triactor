import type {
  Draft,
  StateMonitorCallback,
  StateSelector,
  StateStore,
} from './types';

interface MonitorEntry {
  callback: StateMonitorCallback;
  id?: string;
}

interface StoreMeta<T extends object> {
  state: T;
  id?: string;
  unique: string;
  monitors: Map<StateMonitorCallback, MonitorEntry>;
  counter: number;
  pendingKeys: Set<string>;
  queued: boolean;
}

const metadata = new WeakMap<object, StoreMeta<object>>();

function getMeta<T extends object>(store: StateStore<T>): StoreMeta<T> | undefined {
  return metadata.get(store as object) as StoreMeta<T> | undefined;
}

function queueTask(callback: () => void): void {
  if (typeof queueMicrotask === 'function') queueMicrotask(callback);
  else void Promise.resolve().then(callback);
}

function makeUniqueId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `store-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function createStore<T extends object>(initial: T, _id?: string): StateStore<T> {
  assertPlainState(initial);
  const state = { ...initial } as T;
  const meta: StoreMeta<T> = {
    state,
    id: _id,
    unique: makeUniqueId(),
    monitors: new Map(),
    counter: 0,
    pendingKeys: new Set(),
    queued: false,
  };

  const target = (() => {}) as (...args: [(draft: Draft<T>) => void]) => void;
  const proxy = new Proxy(target, {
    get: (_target, property, receiver) => {
      if (typeof property === 'string' && Object.hasOwn(state, property)) {
        return (state as Record<string, unknown>)[property];
      }
      return Reflect.get(target, property, receiver);
    },
    set: (_target, property, value) => {
      if (typeof property !== 'string') return Reflect.set(target, property, value);
      const current = (state as Record<string, unknown>)[property];
      if (Object.is(current, value) && Object.hasOwn(state, property)) return true;
      (state as Record<string, unknown>)[property] = value;
      notify(meta, [property]);
      return true;
    },
    deleteProperty: (_target, property) => {
      if (typeof property !== 'string' || !Object.hasOwn(state, property)) return false;
      delete (state as Record<string, unknown>)[property];
      notify(meta, [property]);
      return true;
    },
    apply(_target, thisArg, argumentsList) {
      const callback = argumentsList[0];
      if (typeof callback !== 'function') return;
      const draft = { ...state } as Draft<T>;
      callback.call(thisArg, draft);

      const changedKeys = new Set<string>();
      const allKeys = new Set([
        ...Object.keys(state),
        ...Object.keys(draft as Record<string, unknown>),
      ]);
      for (const key of allKeys) {
        const before = (state as Record<string, unknown>)[key];
        const after = (draft as Record<string, unknown>)[key];
        if (Object.hasOwn(draft as object, key) !== Object.hasOwn(state, key) || !Object.is(before, after)) {
          changedKeys.add(key);
          if (Object.hasOwn(draft as object, key)) {
            (state as Record<string, unknown>)[key] = after;
          } else {
            delete (state as Record<string, unknown>)[key];
          }
        }
      }
      notify(meta, [...changedKeys]);
    },
    ownKeys: (targetObject) => [...new Set([...Reflect.ownKeys(state), ...Reflect.ownKeys(targetObject)])],
    has: (targetObject, property) =>
      (typeof property === 'string' && property in state) || Reflect.has(targetObject, property),
    getOwnPropertyDescriptor: (targetObject, property) => {
      if (typeof property === 'string' && Object.hasOwn(state, property)) {
        return { value: (state as Record<string, unknown>)[property], writable: true, enumerable: true, configurable: true };
      }
      return Reflect.getOwnPropertyDescriptor(targetObject, property);
    },
  }) as StateStore<T>;

  metadata.set(proxy as object, meta as StoreMeta<object>);
  return proxy;
}

function assertPlainState(initial: object): void {
  const prototype = Object.getPrototypeOf(initial);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    Object.getOwnPropertySymbols(initial).length > 0
  ) {
    throw new TypeError(
      'triactor: state stores require plain objects with string-keyed properties.',
    );
  }
}

function notify<T extends object>(meta: StoreMeta<T>, keys: string[]): void {
  if (keys.length === 0) return;
  for (const key of keys) meta.pendingKeys.add(key);
  if (meta.queued) return;
  meta.queued = true;
  queueTask(() => {
    meta.counter += 1;
    const flushKeys = [...meta.pendingKeys];
    meta.pendingKeys.clear();
    meta.queued = false;
    for (const { callback } of meta.monitors.values()) callback(flushKeys);
  });
}

export function subscribeStore<T extends object>(
  store: StateStore<T> | null | undefined,
  callback: StateMonitorCallback,
  id?: string,
): () => void {
  const meta = store ? getMeta(store) : undefined;
  if (!meta) return () => {};
  meta.monitors.set(callback, { callback, id });
  return () => meta.monitors.delete(callback);
}

export function getStoreCounter<T extends object>(store: StateStore<T>): number {
  return getMeta(store)?.counter ?? 0;
}

export function getStoreSnapshot<T extends object>(
  store: StateStore<T> | null | undefined,
  selector?: StateSelector<T>,
): unknown {
  if (!store) return null;
  if (typeof selector === 'string') return store[selector as keyof T];
  return getStoreCounter(store);
}

export function matchesSelector<T extends object>(selector: StateSelector<T>, key: string): boolean {
  if (selector === undefined || selector === null) return true;
  if (typeof selector === 'string') return selector === key;
  if (typeof selector === 'function') return selector(key);
  if (Array.isArray(selector)) return selector.includes(key as keyof T & string);
  return Boolean(selector[key as keyof T]);
}
