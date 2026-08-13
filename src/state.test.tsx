import { act, render } from '@testing-library/react';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { Node, StateRoot, createState } from './index';

const CounterState = createState<{ count: number; other: number }>('CounterState');

function Counter({ selector }: { selector?: 'count' }) {
  const state = CounterState.useState(selector, { count: 0, other: 0 });
  return (
    <button onClick={() => state && (state.count += 1)}>
      {state?.count}:{state?.other}
    </button>
  );
}

const FutureState = createState<{ value: string }>('FutureState');

function FutureConsumer() {
  const state = FutureState.useFutureState();
  return <output data-testid="future-value">{state?.value ?? 'missing'}</output>;
}

function FutureProvider() {
  const state = FutureState.useState(undefined, { value: 'ready' });
  return <output data-testid="future-provider">{state?.value}</output>;
}

describe('state scopes', () => {
  it('creates a state store and rerenders after updates', async () => {
    render(
      <StateRoot>
        <Node id="app">
          <Counter />
        </Node>
      </StateRoot>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('0:0');
    fireEvent.click(screen.getByRole('button'));
    await act(async () => Promise.resolve());
    expect(screen.getByRole('button')).toHaveTextContent('1:0');
  });

  it('keeps separate roots independent', () => {
    render(
      <>
        <StateRoot>
          <Counter />
        </StateRoot>
        <StateRoot>
          <Counter />
        </StateRoot>
      </>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['0:0', '0:0']);
  });

  it('finds a state store on an ancestor node with useFutureState', () => {
    render(
      <StateRoot>
        <Node id="root-scope">
          <FutureProvider />
          <Node id="child-scope">
            <FutureConsumer />
          </Node>
        </Node>
      </StateRoot>,
    );

    expect(screen.getByTestId('future-value')).toHaveTextContent('ready');
  });

  it('updates when a future state store is mounted after the consumer', async () => {
    const view = render(
      <StateRoot>
        <Node id="delayed-scope">
          <FutureConsumer />
        </Node>
      </StateRoot>,
    );

    expect(screen.getByTestId('future-value')).toHaveTextContent('missing');
    view.rerender(
      <StateRoot>
        <Node id="delayed-scope">
          <FutureConsumer />
          <FutureProvider />
        </Node>
      </StateRoot>,
    );
    await waitFor(() => expect(screen.getByTestId('future-value')).toHaveTextContent('ready'));
  });

  it('hydrates without duplicate Strict Mode state or markup', async () => {
    const { container } = render(
      <StrictMode>
        <StateRoot>
          <Node id="strict-scope">
            <Counter />
          </Node>
        </StateRoot>
      </StrictMode>,
    );

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')).toHaveTextContent('0:0');
    fireEvent.click(container.querySelector('button') as HTMLButtonElement);
    await act(async () => Promise.resolve());
    expect(container.querySelector('button')).toHaveTextContent('1:0');
  });
});
