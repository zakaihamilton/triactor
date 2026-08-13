import { type ReactNode, createContext, useContext, useRef } from 'react';
import type { NodeListener, StateNode } from './types';

const rootContext = createContext<StateNode | null>(null);
const nodeContext = createContext<StateNode | null>(null);

let clientFallbackRoot: StateNode | null = null;

function makeNode(id: string, parent: StateNode | null): StateNode {
  return { id, parent, items: new Map(), listeners: new Set() };
}

function getClientFallbackRoot(): StateNode {
  if (typeof window === 'undefined') {
    throw new Error(
      'triactor: wrap the rendered tree in <StateRoot> before using state during SSR.',
    );
  }
  clientFallbackRoot ??= makeNode('root', null);
  return clientFallbackRoot;
}

function useCurrentNode(): StateNode {
  return useContext(nodeContext) ?? useContext(rootContext) ?? getClientFallbackRoot();
}

export interface NodeComponent {
  (props: { id: string; children?: ReactNode }): ReactNode;
  useNode: (propertyId?: unknown) => StateNode | null;
  resetRoot: () => void;
}

export function StateRoot({ children }: { children?: ReactNode }): ReactNode {
  const rootRef = useRef<StateNode | null>(null);
  rootRef.current ??= makeNode('root', null);
  return (
    <rootContext.Provider value={rootRef.current}>
      <nodeContext.Provider value={rootRef.current}>{children}</nodeContext.Provider>
    </rootContext.Provider>
  );
}

const Node: NodeComponent = function Node({ id, children }) {
  const parent = useCurrentNode();
  const nodeRef = useRef<StateNode | null>(null);

  if (!nodeRef.current) {
    nodeRef.current = makeNode(id, parent);
  } else {
    nodeRef.current.id = id;
    nodeRef.current.parent = parent;
  }

  return <nodeContext.Provider value={nodeRef.current}>{children}</nodeContext.Provider>;
};

Node.resetRoot = () => {
  clientFallbackRoot?.items.clear();
  clientFallbackRoot?.listeners.clear();
};

Node.useNode = (propertyId?: unknown): StateNode | null => {
  let node: StateNode | null = useCurrentNode();
  if (propertyId !== undefined && propertyId !== null) {
    while (node && typeof nodeGetProperty(node, propertyId) === 'undefined') {
      node = node.parent;
    }
  }
  return node;
};

export function nodeGetParent(node: StateNode | null | undefined): StateNode | null | undefined {
  return node?.parent;
}

export function nodeGetProperty(node: StateNode | null | undefined, propertyId: unknown): unknown {
  return node?.items.get(propertyId);
}

export function nodeSetProperty(
  node: StateNode | null | undefined,
  propertyId: unknown,
  value: unknown,
): void {
  if (!node) return;
  node.items.set(propertyId, value);
  queueTask(() => {
    for (const callback of node.listeners) callback(node, propertyId, value);
  });
}

export function subscribeToNode(node: StateNode | null | undefined, callback: NodeListener): () => void {
  if (!node) return () => {};
  node.listeners.add(callback);
  return () => node.listeners.delete(callback);
}

export function nodeGetId(node: StateNode | null | undefined): string | undefined {
  return node?.id;
}

function queueTask(callback: () => void): void {
  if (typeof queueMicrotask === 'function') queueMicrotask(callback);
  else void Promise.resolve().then(callback);
}

export { nodeContext };
export default Node;
