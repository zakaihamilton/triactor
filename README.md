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

[![npm version](https://img.shields.io/npm/v/triactor.svg)](https://www.npmjs.com/package/triactor)
[![CI](https://github.com/zakaihamilton/triactor/actions/workflows/ci.yml/badge.svg)](https://github.com/zakaihamilton/triactor/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/triactor.svg)](https://github.com/zakaihamilton/triactor/blob/main/LICENSE)

triactor gives React components typed, mutable-looking state that is scoped to a hierarchy of nodes. It is a small fit for local state shared across a subtree, with isolated React roots, selector-based subscriptions, and SSR-safe boundaries.

## Installation

```bash
npm install triactor
```

Or use your preferred package manager:

```bash
yarn add triactor
pnpm add triactor
```

React is a peer dependency and must be installed separately. React 18 or newer is supported.

## Quick start

Define a state scope once, then render it inside a `StateRoot` and a named `Node`:

```tsx
import { Node, StateRoot, createState } from 'triactor';

const CounterState = createState<{ count: number }>('CounterState');

function Counter() {
  const state = CounterState.useState(undefined, { count: 0 });

  return (
    <div>
      <p>Count: {state?.count ?? 0}</p>
      <button onClick={() => state && (state.count += 1)}>
        Increment directly
      </button>
      <button
        onClick={() =>
          state?.((draft) => {
            draft.count += 1;
          })
        }
      >
        Increment with a draft
      </button>
    </div>
  );
}

export function App() {
  return (
    <StateRoot>
      <Node id="counter">
        <Counter />
      </Node>
    </StateRoot>
  );
}
```

`StateRoot` is required around every rendered tree. A `Node` establishes a scope in the component hierarchy, and `createState` gives that scope a typed state store and React hooks.

## Core concepts

### State roots

Each `StateRoot` owns an independent state tree. This keeps separate React roots isolated and gives server rendering and hydration a stable boundary:

```tsx
<>
  <StateRoot>
    <App />
  </StateRoot>
  <StateRoot>
    <App />
  </StateRoot>
</>
```

The two trees have separate stores, even when they render the same components.

### Nodes

`Node` creates a named position in the hierarchy:

```tsx
<StateRoot>
  <Node id="workspace">
    <Workspace />
    <Node id="sidebar">
      <Sidebar />
    </Node>
  </Node>
</StateRoot>
```

State can be attached to a node and read by descendants. `Node.useNode()` and the node helper functions are available for lower-level integrations, but most components only need a state scope.

### State scopes

`createState<T>(displayName)` returns a React component with hooks for a typed `StateStore<T>`:

```tsx
const UserState = createState<{
  name: string;
  online: boolean;
  preferences: { theme: string };
}>('UserState');
```

Use plain objects with string-keyed properties for state. Stores do not preserve
class prototypes, array behavior, or symbol-keyed properties.

The returned state scope can be rendered as a component, or its hooks can be used directly. State stores are proxy objects, so their properties can be read and updated directly while React subscriptions handle rerenders.

## Reading and updating state

### `useState`

Use `Scope.useState(selector?, initial?, id?)` when a component owns or consumes state at its current scope:

```tsx
function Profile() {
  const user = UserState.useState(undefined, {
    name: 'Ada',
    online: true,
    preferences: { theme: 'light' },
  });

  return <span>{user?.name}</span>;
}
```

When an `initial` value is supplied, the store is created at the current node if it does not already exist. Without an initial value, the hook looks for the nearest store in the current node and its ancestors. It returns `undefined` when no store is available.

Direct assignment and callable shallow drafts are both supported:

```tsx
if (user) {
  user.online = false;

  user((draft) => {
    draft.name = 'Grace';
    draft.online = true;
  });
}
```

Updates are shallow. TypeScript marks nested values as read-only on both the
store and its draft, so changing a nested object requires replacing the
top-level property:

```tsx
user.preferences = {
  ...user.preferences,
  theme: 'dark',
};
```

Store properties can also be deleted. With TypeScript, use an optional or index-signature property when deleting a key:

```tsx
type Settings = { theme?: string };
const SettingsState = createState<Settings>('SettingsState');
const settings = SettingsState.useState(undefined, { theme: 'dark' });

if (settings) delete settings.theme;
```

### Selectors

Selectors limit rerenders to relevant top-level keys. Pass a selector as the first argument to `useState`:

```tsx
const DashboardState = createState<{
  count: number;
  label: string;
  visibleCount: number;
}>('DashboardState');

function Dashboard() {
  const count = DashboardState.useState('count');
  const summary = DashboardState.useState(['count', 'label']);
  const visible = DashboardState.useState({ count: true, label: true });
  const dynamic = DashboardState.useState((key) => key.startsWith('visible'));

  return <output>{count?.count ?? summary?.label ?? visible?.count ?? dynamic?.visibleCount}</output>;
}
```

Supported selector forms are:

| Selector | Watches |
| --- | --- |
| `undefined` or `null` | Every changed key |
| `'count'` | One key |
| `['count', 'label']` | A list of keys |
| `{ count: true }` | Keys with truthy entries |
| `(key) => boolean` | Keys accepted by the predicate |

Selectors only control notifications. The returned store still exposes the complete state object.

### `useFutureState`

Use `useFutureState(selector?, id?)` when a consumer may render before a provider exists. It searches the current node and its ancestors, then updates when a matching state store is mounted later:

```tsx
function Toolbar() {
  const user = UserState.useFutureState('name');

  return <span>{user?.name ?? 'Loading user…'}</span>;
}
```

This hook does not create a store. It returns `undefined` until a `UserState` store is available.

### `usePassiveState`

Use `usePassiveState()` to read the nearest store without subscribing the component to store value updates:

```tsx
function DebugLabel() {
  const user = UserState.usePassiveState();
  return <small>{user?.name}</small>;
}
```

This is useful for imperative or non-reactive reads. It can rerender once when a
matching store is registered later, but it does not rerender when that store's
values change. Use `useState` or `useFutureState` when the component should
rerender after state changes.

## Standalone stores and subscriptions

For state that is not tied to a React state scope, use `createStore`:

```ts
import { createStore, subscribeStore } from 'triactor';

const settings = createStore({ theme: 'light', compact: false });

const unsubscribe = subscribeStore(settings, (changedKeys) => {
  console.log('Changed:', changedKeys);
});

settings.theme = 'dark';
settings((draft) => {
  draft.compact = true;
});

unsubscribe();
```

Store notifications are batched in a microtask. Multiple synchronous changes notify subscribers once with the changed top-level keys.

The package also exports `useObjectState` and `useObjectHandler` for connecting an existing store to React, plus lower-level store helpers such as `getStoreSnapshot`, `getStoreCounter`, and `matchesSelector`.

## Server-side rendering and hydration

Always wrap both the server render and the client hydration tree in `StateRoot`:

```tsx
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { StateRoot } from 'triactor';

function RootTree() {
  return (
    <StateRoot>
      <App />
    </StateRoot>
  );
}

// Server
const markup = renderToString(<RootTree />);

// Browser
hydrateRoot(document.getElementById('root')!, <RootTree />);
```

`StateRoot` prevents state from leaking between render trees and provides the context needed during SSR. Using the same initial state inputs on the server and client allows React to hydrate the rendered markup without duplicate state or markup.

## When to use triactor

triactor is a good fit when state:

- belongs to a component subtree rather than the entire application;
- should be shared by descendants through a hierarchy;
- benefits from independent copies in separate React roots;
- needs small, typed updates with selector-based subscriptions; or
- must work consistently with SSR and hydration.

It is focused on local and shared UI state. It does not fetch, cache, or synchronize server data, so pair it with a server-state solution when your application needs those capabilities.

## Development

Install dependencies and run the verification commands from the repository root:

```bash
npm ci
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run pack:check
```

For an interactive test run, use `npm run test:watch`.

## Releases

Releases are published from version tags by GitHub Actions using npm trusted publishing. To create a release:

```bash
npm version patch
git push --follow-tags origin main
```

Before the first tagged release, configure `zakaihamilton/triactor` as a trusted publisher for the package in npm's package settings. The workflow uses GitHub's OIDC identity and does not store an npm token in the repository.

## License

MIT © [Zakai Hamilton](https://github.com/zakaihamilton)
