export type SimpleStore<T> = {
  getState: () => T;
};

export function createSimpleStore<T extends object>(state: T): SimpleStore<T> {
  return {
    getState: () => state
  };
}
