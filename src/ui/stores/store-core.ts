export type SimpleStore<T> = {
  getState: () => T;
  setState: (nextState: Partial<T> | ((state: T) => Partial<T>)) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createSimpleStore<T extends object>(state: T): SimpleStore<T> {
  let currentState = state;
  const listeners = new Set<() => void>();
  return {
    getState: () => currentState,
    setState: (nextState) => {
      currentState = {
        ...currentState,
        ...(typeof nextState === 'function' ? nextState(currentState) : nextState)
      };
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
