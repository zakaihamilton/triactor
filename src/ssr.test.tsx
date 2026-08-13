import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StateRoot, createState } from './index';

const ServerState = createState<{ value: string }>('ServerState');

function ServerView({ value }: { value: string }) {
  const state = ServerState.useState(undefined, { value });
  return <output>{state?.value}</output>;
}

describe('SSR', () => {
  it('isolates separate render trees', () => {
    expect(renderToString(<StateRoot><ServerView value="one" /></StateRoot>)).toContain('one');
    expect(renderToString(<StateRoot><ServerView value="two" /></StateRoot>)).toContain('two');
  });
});
