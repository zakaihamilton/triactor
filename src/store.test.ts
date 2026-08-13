import { describe, expect, it, vi } from 'vitest';
import { createStore, matchesSelector, subscribeStore } from './store';

describe('proxy stores', () => {
  it('supports direct assignment and callable shallow drafts', async () => {
    const store = createStore({ count: 1, nested: { value: 1 } });
    store.count = 2;
    store((draft) => {
      draft.count = 3;
      draft.nested = { value: 2 };
    });
    await Promise.resolve();
    expect(store.count).toBe(3);
    expect(store.nested).toEqual({ value: 2 });
  });

  it('batches changed keys once per microtask', async () => {
    const store = createStore<Record<string, number>>({ a: 1 });
    const callback = vi.fn();
    const unsubscribe = subscribeStore(store, callback);
    store.a = 2;
    store.b = 3;
    await Promise.resolve();
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(expect.arrayContaining(['a', 'b']));
    unsubscribe();
  });

  it('supports deletion and enumeration', () => {
    const store = createStore({ a: 1, b: 2 });
    Reflect.deleteProperty(store, 'a');
    expect('a' in store).toBe(false);
    expect(Object.keys(store)).toEqual(['b']);
  });

  it('matches every supported selector form consistently', () => {
    expect(matchesSelector(undefined, 'value')).toBe(true);
    expect(matchesSelector(null, 'value')).toBe(true);
    expect(matchesSelector('value', 'value')).toBe(true);
    expect(matchesSelector(['value'], 'value')).toBe(true);
    expect(matchesSelector({ value: true }, 'value')).toBe(true);
    expect(matchesSelector((key) => key === 'value', 'value')).toBe(true);
    expect(matchesSelector('other', 'value')).toBe(false);
  });
});
