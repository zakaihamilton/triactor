import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Node, { nodeGetProperty, nodeIsCommitted, nodeSetProperty, subscribeToNode } from './node';
import { createStore, getStoreSnapshot, matchesSelector, subscribeStore } from './store';
import type { StateMonitorCallback, StateNode, StateScope, StateSelector, StateStore } from './types';

const useCommitEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function useNodeState<T extends object>(
  startNode: StateNode | null,
  scopeKey: symbol,
  enabled = true,
): StateStore<T> | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!enabled) return () => {};
      const unsubscribes: Array<() => void> = [];
      let search = startNode;
      const handleEvent = (_node: unknown, property: unknown) => {
        if (property === scopeKey) onStoreChange();
      };
      while (search) {
        unsubscribes.push(subscribeToNode(search, handleEvent));
        search = search.parent;
      }
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    [enabled, scopeKey, startNode],
  );
  const getSnapshot = useCallback(() => {
    if (!enabled) return undefined;
    let search = startNode;
    while (search) {
      const object = nodeGetProperty(search, scopeKey) as StateStore<T> | undefined;
      if (object) return object;
      search = search.parent;
    }
    return undefined;
  }, [enabled, scopeKey, startNode]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function createState<T extends object>(displayName: string): StateScope<T> {
  const scopeKey = Symbol(displayName);

  function State({ children, ...props }: React.ComponentProps<StateScope<T>>) {
    const object = State.useState(null, props as Partial<T>);
    const previousProps = useRef<Record<string, unknown>>({});

    useEffect(() => {
      if (!object) return;
      const currentProps = props as Record<string, unknown>;
      const previous = previousProps.current;
      const changedKeys = [...new Set([...Object.keys(previous), ...Object.keys(currentProps)])].filter(
        (key) =>
          Object.hasOwn(previous, key) !== Object.hasOwn(currentProps, key) ||
          !Object.is(currentProps[key], previous[key]),
      );
      previousProps.current = { ...currentProps };
      if (changedKeys.length > 0) {
        object((draft) => {
          const state = draft as Record<string, unknown>;
          for (const key of changedKeys) {
            if (Object.hasOwn(currentProps, key)) state[key] = currentProps[key];
            else delete state[key];
          }
        });
      }
    }, [object, props]);

    if (children == null || typeof children === 'boolean') return null;
    if (typeof children === 'function') return children(object);
    return <Node id={displayName}>{children}</Node>;
  }

  State.useState = (selector?: StateSelector<T>, initial?: Partial<T>, id?: string) => {
    const currentNode = Node.useNode();
    const currentObject = nodeGetProperty(currentNode, scopeKey) as StateStore<T> | undefined;
    const observedObject = useNodeState<T>(
      currentNode,
      scopeKey,
      initial === undefined || !currentObject,
    );
    const existingObject = initial === undefined ? observedObject : currentObject;
    const [pending, setPending] = useState<{ node: StateNode; object: StateStore<T> }>();
    let object = existingObject;

    if (!object && initial !== undefined && currentNode) {
      let pendingObject = pending?.node === currentNode ? pending.object : undefined;
      if (!pendingObject) {
        pendingObject = createStore(initial as T, id || displayName);
        if (nodeIsCommitted(currentNode)) {
          setPending({ node: currentNode, object: pendingObject });
        } else {
          nodeSetProperty(currentNode, scopeKey, pendingObject);
        }
      }
      object = pendingObject;
    }

    useCommitEffect(() => {
      if (!pending) return;
      if (initial === undefined || pending.node !== currentNode) {
        setPending(undefined);
        return;
      }
      if (nodeGetProperty(currentNode, scopeKey) === undefined) {
        nodeSetProperty(currentNode, scopeKey, pending.object);
      }
      setPending(undefined);
    }, [currentNode, initial, pending]);

    if (object && initial !== undefined && Object.keys(object).length === 0) {
      queueTask(() => {
        if (Object.keys(object as object).length === 0) object?.((draft) => Object.assign(draft, initial));
      });
    }

    useObjectState(object, selector, id);
    return object;
  };

  State.useFutureState = (selector?: StateSelector<T>, id?: string) => {
    const startNode = Node.useNode();
    const object = useNodeState<T>(startNode, scopeKey);

    return useObjectState(object, selector, id);
  };

  State.usePassiveState = () => {
    const startNode = Node.useNode();
    return useNodeState<T>(startNode, scopeKey);
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
