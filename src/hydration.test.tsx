import { act } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { Node, StateRoot, createState } from './index';

const HydrationState = createState<{ value: string }>('HydrationState');

function HydrationView() {
  const state = HydrationState.useState(undefined, { value: 'hydrated' });
  return <output data-testid="hydration-value">{state?.value}</output>;
}

function HydrationTree() {
  return (
    <StrictMode>
      <StateRoot>
        <Node id="hydration-scope">
          <HydrationView />
        </Node>
      </StateRoot>
    </StrictMode>
  );
}

describe('hydration', () => {
  it('hydrates server markup with the same state snapshot', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<HydrationTree />);
    document.body.appendChild(container);

    const errors: unknown[] = [];
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const root = hydrateRoot(container, <HydrationTree />);
      await act(async () => Promise.resolve());
      expect(screen.getByTestId('hydration-value')).toHaveTextContent('hydrated');
      expect(container.querySelectorAll('[data-testid="hydration-value"]')).toHaveLength(1);
      expect(errors).toEqual([]);
      root.unmount();
    } finally {
      console.error = originalConsoleError;
      container.remove();
    }
  });
});
