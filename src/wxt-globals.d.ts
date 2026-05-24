declare function defineBackground(callback: () => void): unknown;

declare function defineContentScript(config: {
  matches: string[];
  allFrames?: boolean;
  main: () => void;
}): unknown;

declare module '*.css';

interface ImportMeta {
  glob<T = unknown>(
    pattern: string,
    options: { eager: true }
  ): Record<string, T>;
}
