# triactor

Hierarchical proxy state for React 18 and newer. Triactor lets state follow the
React tree that owns it, so related components can share typed state without
turning every value into app-wide global state or wiring a provider for every
scope.

## Why Triactor?

Triactor is a good fit when state belongs to a feature, screen, or subtree of
your UI. Declare a state scope once, place it in the tree, and descendants can
read and update the nearest instance directly:

- **State follows the component tree.** `Node` creates hierarchical scopes, so
  a feature can own its state and nested features can override or inherit it.
- **Updates stay close to the data.** Stores are typed proxies: assign a field
  directly (`state.count += 1`) or use a shallow draft when several fields
  change together.
- **Components can subscribe narrowly.** Selectors limit which changed keys
  cause a component to render.
- **Updates are batched.** Multiple changes made in the same turn notify
  subscribers together in a microtask.
- **React roots stay isolated.** `StateRoot` keeps separate roots independent
  and provides the explicit root boundary needed for SSR and hydration.

### How it compares

The right state library depends on where state belongs and which surrounding
tools your team needs. This is an architectural comparison, not a performance
benchmark.

| Approach | Mental model | State placement | Update style | Best fit |
| --- | --- | --- | --- | --- |
| React Context | A value provided to a subtree | Provider-defined subtree | Replace or update the provided value | Small shared dependencies, configuration, and simple state |
| Redux | A centralized store with explicit actions and reducers | Usually app-wide | Dispatch actions through reducers | Large app-wide state, predictable event flows, and Redux tooling |
| Zustand | One or more independent stores with hook-based subscriptions | Usually module/global scope | Store actions or direct updates | Lightweight global or cross-feature state |
| Jotai | A graph of composable atoms | Atom-defined scope, often shared globally | Update individual atoms or derived atoms | Fine-grained atom dependencies and derived state |
| **Triactor** | State scopes nested in the React tree | The nearest `Node`/`StateRoot` scope | Direct proxy assignment or shallow drafts | Feature and subtree state that should be local, inheritable, and easy to update |

Choose Triactor when the ownership of state maps naturally to the UI hierarchy
and you want descendants to share the nearest scoped instance. Choose Redux,
Zustand, or Jotai when their global-store, tooling, or atom-graph model better
matches your application.

### When not to choose Triactor

Triactor is not intended to replace every state-management approach. If most
of your state is shared by unrelated parts of the application, you need a deep
Redux ecosystem and action history, or your domain is naturally modeled as an
atom dependency graph, another library may be a better fit.

## Quick start

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
