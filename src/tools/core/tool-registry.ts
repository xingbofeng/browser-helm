import type { ToolSpec } from './tool-spec';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolSpec<unknown, unknown>>();

  register<TArgs, TResult>(tool: ToolSpec<TArgs, TResult>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool registration: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolSpec<unknown, unknown> | undefined {
    return this.tools.get(name);
  }

  list(): ToolSpec<unknown, unknown>[] {
    return [...this.tools.values()];
  }
}
