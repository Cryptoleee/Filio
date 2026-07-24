'use client';

// Tiny client-side store shared between the dashboard and the review page.
// Module state survives client navigations; the real app swaps this for API calls.

import { useSyncExternalStore } from 'react';
import { AppState, seedState } from './data';

let state: AppState = seedState();
const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(update: (prev: AppState) => AppState) {
  state = update(state);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverSnapshot = seedState();

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, () => state, () => serverSnapshot);
}
