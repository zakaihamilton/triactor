import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { NodeListener, StateNode } from './types';

const rootContext = createContext<StateNode | null>(null);
const nodeContext = createContext<StateNode | null>(null);

let clientFallbackRoot: StateNode | null = null;
const committedNodes = new WeakSet<StateNode>();
const useCommitEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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
  committedNodes.add(clientFallbackRoot);
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
  useCommitEffect(() => {
    if (rootRef.current) committedNodes.add(rootRef.current);
  }, []);
  return (
    <rootContext.Provider value={rootRef.current}>
      <nodeContext.Provider value={rootRef.current}>{children}</nodeContext.Provider>
    </rootContext.Provider>
  );
}

const Node: NodeComponent = function Node({ id, children }) {
  const parent = useCurrentNode();
  const [node, setNode] = useState(() => makeNode(id, parent));
  let valueNode = node;

  if (node.id !== id || node.parent !== parent) {
    valueNode = makeNode(id, parent);
    valueNode.items = new Map(node.items);
    setNode(valueNode);
  }

  useCommitEffect(() => {
    committedNodes.add(valueNode);
  }, [valueNode]);

  return <nodeContext.Provider value={valueNode}>{children}</nodeContext.Provider>;
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

export function nodeIsCommitted(node: StateNode | null | undefined): boolean {
  return node ? committedNodes.has(node) : false;
}

function queueTask(callback: () => void): void {
  if (typeof queueMicrotask === 'function') queueMicrotask(callback);
  else void Promise.resolve().then(callback);
}

export { nodeContext };
export default Node;
