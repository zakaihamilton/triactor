import { act, render, renderHook } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import { renderToString } from 'react-dom/server';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Node, {
  StateRoot,
  nodeGetId,
  nodeGetParent,
  nodeGetProperty,
  nodeSetProperty,
  subscribeToNode,
} from './node';
import type { StateNode } from './types';

describe('hierarchical nodes', () => {
  beforeEach(() => Node.resetRoot());

  it('provides nested context and property notifications', async () => {
    let childNode: StateNode | null = null;
    let parentNode: StateNode | null | undefined = null;

    function Child() {
      childNode = Node.useNode();
      parentNode = nodeGetParent(childNode);
      return <div data-testid="child">{nodeGetId(childNode)}</div>;
    }

    render(
      <StateRoot>
        <Node id="parent">
          <Node id="child">
            <Child />
          </Node>
        </Node>
      </StateRoot>,
    );

    expect(screen.getByTestId('child')).toHaveTextContent('child');
    expect(nodeGetId(parentNode)).toBe('parent');

    const listener = vi.fn();
    const unsubscribe = subscribeToNode(childNode, listener);
    nodeSetProperty(childNode, 'value', 42);
    await act(async () => Promise.resolve());
    expect(nodeGetProperty(childNode, 'value')).toBe(42);
    expect(listener).toHaveBeenCalledWith(childNode, 'value', 42);

    unsubscribe();
    nodeSetProperty(childNode, 'value', 43);
    await act(async () => Promise.resolve());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('walks ancestors when looking up a property', () => {
    const token = {};
    let found: StateNode | null = null;

    function Reader() {
      found = Node.useNode(token);
      return null;
    }

    function Writer({ children }: { children: React.ReactNode }) {
      nodeSetProperty(Node.useNode(), token, 'from-parent');
      return children;
    }

    render(
      <StateRoot>
        <Node id="parent">
          <Writer>
            <Node id="child">
              <Reader />
            </Node>
          </Writer>
        </Node>
      </StateRoot>,
    );

    expect(nodeGetId(found)).toBe('parent');
    expect(nodeGetProperty(found, token)).toBe('from-parent');
  });

  it('isolates separate roots', () => {
    const token = {};
    let first: StateNode | null = null;
    let second: StateNode | null = null;

    function Capture({ target }: { target: 'first' | 'second' }) {
      if (target === 'first') first = Node.useNode();
      else second = Node.useNode();
      return null;
    }

    render(
      <>
        <StateRoot>
          <Capture target="first" />
        </StateRoot>
        <StateRoot>
          <Capture target="second" />
        </StateRoot>
      </>,
    );

    const firstNode = first as unknown as StateNode;
    const secondNode = second as unknown as StateNode;
    expect(firstNode).not.toBe(secondNode);
    expect(firstNode.items).not.toBe(secondNode.items);
  });

  it('returns a no-op unsubscribe for an invalid node', () => {
    const unsubscribe = subscribeToNode(null, vi.fn());
    expect(() => unsubscribe()).not.toThrow();
  });

  it('rejects server usage without StateRoot', () => {
    function NoRoot() {
      Node.useNode();
      return null;
    }
    const originalWindow = globalThis.window;
    Reflect.deleteProperty(globalThis, 'window');
    try {
      expect(() => renderToString(<NoRoot />)).toThrow(/StateRoot/);
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
  });
});
