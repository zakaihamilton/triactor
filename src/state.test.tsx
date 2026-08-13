import { act, render } from '@testing-library/react';
import { fireEvent, screen } from '@testing-library/dom';
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
});
