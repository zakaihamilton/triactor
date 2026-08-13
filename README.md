# triactor

Hierarchical proxy state for React 18 and newer.

```bash
yarn add triactor
```

Wrap each rendered tree in `StateRoot`. This is required for SSR and keeps separate React roots isolated:

```tsx
import { Node, StateRoot, createState } from 'triactor';

const CounterState = createState<{ count: number }>('CounterState');

export function App() {
  const state = CounterState.useState(undefined, { count: 0 });
  return (
    <Node id="counter">
      <button onClick={() => state && (state.count += 1)}>{state?.count}</button>
    </Node>
  );
}

export function Root() {
  return (
    <StateRoot>
      <App />
    </StateRoot>
  );
}
```

Updates can also use a shallow draft:

```ts
state((draft) => {
  draft.count += 1;
});
```

Nested objects must be replaced at their top-level key. Notifications are batched in a microtask, and selectors limit which changes cause a component to render.

## Releases

Releases are published from version tags by GitHub Actions. Update the version with `npm version`, push the commit and tag, and the publish workflow will verify and publish the package using npm trusted publishing:

```bash
npm version patch
git push --follow-tags origin main
```

Before the first tagged release, configure `zakaihamilton/triactor` as a trusted publisher for this package in npm’s package settings. The workflow uses GitHub’s OIDC identity and does not store an npm token in the repository.
