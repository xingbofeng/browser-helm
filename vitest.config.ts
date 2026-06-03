import { defineConfig } from 'vitest/config';

const securityCriticalThresholds = {
  statements: 35,
  branches: 20,
  functions: 25,
  lines: 35
};

export default defineConfig({
  assetsInclude: ['**/*.png'],
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', '.output/**', '.wxt/**'],
    server: {
      deps: {
        inline: ['animal-island-ui']
      }
    },
    coverage: {
      provider: 'v8',
      include: [
        'src/background/runtime/run/**',
        'src/tools/core/**',
        'src/shared/**',
        'src/page/dom/**',
        'src/agent/**'
      ],
      thresholds: {
        statements: 30,
        branches: 20,
        functions: 25,
        lines: 30,
        'src/background/runtime/run/security/authorization-service.ts': securityCriticalThresholds,
        'src/background/runtime/run/approval/approval-coordinator.ts': securityCriticalThresholds,
        'src/page/messaging/content-rpc-handler.ts': securityCriticalThresholds,
        'src/tools/core/tool-registry.ts': securityCriticalThresholds,
        'src/background/runtime/run/tools/approval/flows/workflow-replay-approval-flow.ts': securityCriticalThresholds,
        'src/shared/redaction.ts': securityCriticalThresholds
      }
    }
  }
});
