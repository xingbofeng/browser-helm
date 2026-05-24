declare function defineBackground(callback: () => void): unknown;

declare function defineContentScript(config: {
  matches: string[];
  main: () => void;
}): unknown;

declare module '*.css';
