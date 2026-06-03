import { z } from 'zod';

export const adapterFailureReportInputSchema = z.object({
  url: z.string().url(),
  adapterId: z.string().min(1),
  adapterVersion: z.string().min(1).optional(),
  urlPattern: z.string().min(1).optional(),
  workflowId: z.string().min(1).optional(),
  locatorId: z.string().min(1).optional(),
  errorCode: z.string().min(1),
  message: z.string().min(1)
}).strict();

export type AdapterFailureReportInput = z.infer<typeof adapterFailureReportInputSchema>;

export type AdapterFailureReport = AdapterFailureReportInput & {
  id: string;
  createdAt: number;
  fallback: 'generic_browser_tools';
};

export class AdapterFailureReporter {
  private readonly reports: AdapterFailureReport[] = [];

  report(input: AdapterFailureReportInput): AdapterFailureReport {
    const report: AdapterFailureReport = {
      ...input,
      id: `adapter_failure_${Date.now().toString(36)}_${this.reports.length + 1}`,
      createdAt: Date.now(),
      fallback: 'generic_browser_tools'
    };
    this.reports.push(report);
    return report;
  }

  list(): AdapterFailureReport[] {
    return [...this.reports];
  }

  clear(): void {
    this.reports.length = 0;
  }
}

export const defaultAdapterFailureReporter = new AdapterFailureReporter();
