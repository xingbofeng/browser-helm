import { ErrorStatePanel } from '../components/side-panel/error-state-panel';
import { E2EFlowContext } from './e2e-flow-context';

export class ErrorStateFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<ErrorStateFlow> {
    return new ErrorStateFlow(await E2EFlowContext.create());
  }

  async expectContentUnavailableError(): Promise<void> {
    const sidePanelPage = await this.flowContext.sidePanel().open(999999);
    await new ErrorStatePanel(sidePanelPage).expectStructuredError(
      'CONTENT_SCRIPT_UNAVAILABLE'
    );
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }
}
