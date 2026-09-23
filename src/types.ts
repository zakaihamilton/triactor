import type { FC, ReactNode } from 'react';

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** A shallow mutable draft; nested values are read-only in the type system. */
export type Draft<T> = {
  -readonly [K in keyof T]: DeepReadonly<T[K]>;
};

export type NodeListener = (node: StateNode, property: unknown, value: unknown) => void;

export interface StateNode {
  id: string;
  parent: StateNode | null;
  items: Map<unknown, unknown>;
  listeners: Set<NodeListener>;
}

export type StateMonitorCallback = (keys: string[] | null) => void;

export type StateSelectorKey<T extends object> = keyof T & string;
export type StateSelectorPredicate = (key: string) => boolean;
export type StateSelectorMap<T extends object> = Partial<Record<keyof T, unknown>>;
export type StateSelector<T extends object> =
  | StateSelectorKey<T>
  | StateSelectorKey<T>[]
  | StateSelectorMap<T>
  | StateSelectorPredicate
  | null
  | undefined;

/** Callable proxy store returned by createStore and createState hooks. */
export type StateStore<T extends object> = {
  -readonly [K in keyof T]: DeepReadonly<T[K]>;
} & ((update: (draft: Draft<T>) => void) => void);

export interface StateScopeProps<T extends object> {
  children?: ReactNode | ((state: StateStore<T> | undefined) => ReactNode);
}

export interface StateScope<T extends object> extends FC<StateScopeProps<T> & Partial<T>> {
  useState: (
    selector?: StateSelector<T>,
    initial?: Partial<T>,
    id?: string,
  ) => StateStore<T> | undefined;
  useFutureState: (selector?: StateSelector<T>, id?: string) => StateStore<T> | undefined;
  usePassiveState: () => StateStore<T> | undefined;
  displayName: string;
}
