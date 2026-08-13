import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import Node, { nodeGetProperty, nodeSetProperty, subscribeToNode } from './node';
import { createStore, getStoreSnapshot, matchesSelector, subscribeStore } from './store';
import type { StateMonitorCallback, StateScope, StateSelector, StateStore } from './types';

export function createState<T extends object>(displayName: string): StateScope<T> {
  const scopeKey = Symbol(displayName);

  function State({ children, ...props }: React.ComponentProps<StateScope<T>>) {
    const object = State.useState(null, props as Partial<T>);
    const previousProps = useRef<Record<string, unknown>>({});

    useEffect(() => {
      if (!object) return;
      const currentProps = props as Record<string, unknown>;
      const changedKeys = Object.keys(currentProps).filter(
        (key) => !Object.is(currentProps[key], previousProps.current[key]),
      );
      previousProps.current = currentProps;
      if (changedKeys.length > 0) {
        object((draft) => {
          for (const key of changedKeys) (draft as Record<string, unknown>)[key] = currentProps[key];
        });
      }
    }, [object, props]);

    if (!children) return null;
    if (typeof children === 'function') return children(object);
    return <Node id={displayName}>{children}</Node>;
  }

  State.useState = (selector?: StateSelector<T>, initial?: Partial<T>, id?: string) => {
    let node = Node.useNode(initial ? null : scopeKey);
    const current = Node.useNode();
    if (!node) node = current;

    let object = nodeGetProperty(node, scopeKey) as StateStore<T> | undefined;
    if (!object && node) {
      object = createStore({ ...(initial || {}) } as T, id || displayName);
      nodeSetProperty(node, scopeKey, object);
    }

    if (object && initial && Object.keys(object).length === 0) {
      queueTask(() => {
        if (Object.keys(object as object).length === 0) object?.((draft) => Object.assign(draft, initial));
      });
    }

    useObjectState(object, selector, id);
    return object;
  };

  State.useFutureState = (selector?: StateSelector<T>, id?: string) => {
    const startNode = Node.useNode();
    const subscribe = useCallback(
      (onStoreChange: () => void) => {
        const unsubscribes: Array<() => void> = [];
        let search: ReturnType<typeof Node.useNode> | null = startNode;
        const handleEvent = (_node: unknown, property: unknown) => {
          if (property === scopeKey) onStoreChange();
        };
        while (search) {
          unsubscribes.push(subscribeToNode(search, handleEvent));
          search = search.parent;
        }
        return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
      },
      [startNode],
    );
    const getSnapshot = useCallback(() => {
      let search: ReturnType<typeof Node.useNode> | null = startNode;
      while (search) {
        const object = nodeGetProperty(search, scopeKey) as StateStore<T> | undefined;
        if (object) return object;
        search = search.parent;
      }
      return undefined;
    }, [startNode]);
    const object = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    return useObjectState(object, selector, id);
  };

  State.usePassiveState = () => {
    const node = Node.useNode(scopeKey);
    return nodeGetProperty(node, scopeKey) as StateStore<T> | undefined;
  };

  State.displayName = displayName;
  return State as StateScope<T>;
}

export function useObjectHandler<T extends object>(
  object: StateStore<T> | null | undefined,
  handler: StateMonitorCallback | null | undefined,
  id?: string,
): StateStore<T> | null | undefined {
  useEffect(() => {
    if (!object || !handler) return;
    const unsubscribe = subscribeStore(object, handler, id);
    handler(null);
    return unsubscribe;
  }, [object, handler, id]);
  return object;
}

export function useObjectState<T extends object>(
  object: StateStore<T> | null | undefined,
  selector?: StateSelector<T>,
  id?: string,
): StateStore<T> | null | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!object) return () => {};
      return subscribeStore(object, (keys) => {
        if (keys?.some((key) => matchesSelector(selector, key))) onStoreChange();
      }, id);
    },
    [object, selector, id],
  );
  const getSnapshot = useCallback(() => getStoreSnapshot(object, selector), [object, selector]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return object;
}

function queueTask(callback: () => void): void {
  if (typeof queueMicrotask === 'function') queueMicrotask(callback);
  else void Promise.resolve().then(callback);
}
