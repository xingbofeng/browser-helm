import { describe, expect, it } from 'vitest';
import {
  initialMessages,
  pageSummaryMessage,
  diagnosisMessage,
  agentStatusMessage,
  toolStatusMessage,
  errorMessage,
  upsertMessage,
  completeObserveStatusMessage
} from '../../../../src/background/runtime/run/run-message-presenter';
import type { RuntimeObservationSnapshot } from '../../../../src/runtime/runtime-messages';
import type { DebugReport } from '../../../../src/shared/schemas/diagnosis.schema';
import type { AgentMessage } from '../../../../src/shared/schemas/agent-message.schema';

describe('initialMessages', () => {
  it('creates user task message when includeUserTask is true', () => {
    const messages = initialMessages('run_1', 'test task', { includeUserTask: true });
    
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: 'run_1:task',
      role: 'user',
      kind: 'task',
      status: 'complete',
      content: 'test task'
    });
  });

  it('creates observe status message when includeObserveStatus is true', () => {
    const messages = initialMessages('run_1', 'test task', { includeObserveStatus: true });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: 'run_1:task',
      role: 'user',
      kind: 'task',
      status: 'complete',
      content: 'test task'
    });
    expect(messages[1]).toMatchObject({
      id: 'run_1:observe-status',
      role: 'agent',
      kind: 'agent_status',
      status: 'streaming',
      title: '正在观察当前页面'
    });
  });

  it('creates no messages when both options are false', () => {
    const messages = initialMessages('run_1', 'test task', {
      includeUserTask: false,
      includeObserveStatus: false
    });
    
    expect(messages).toHaveLength(0);
  });

  it('defaults to includeUserTask when no options provided', () => {
    const messages = initialMessages('run_1', 'test task');
    
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe('run_1:task');
  });

  it('sets createdAt and updatedAt timestamps', () => {
    const messages = initialMessages('run_1', 'test task', { includeUserTask: true });
    
    expect(messages[0]?.createdAt).toBeTypeOf('number');
    expect(messages[0]?.updatedAt).toBeTypeOf('number');
    expect(messages[0]?.createdAt).toBe(messages[0]?.updatedAt);
  });
});

describe('pageSummaryMessage', () => {
  it('creates page summary message from observation', () => {
    const observation: RuntimeObservationSnapshot = {
      url: 'https://example.com',
      title: 'Example Page',
      currentDomain: 'example.com',
      origin: 'https://example.com',
      visibleTextSummary: 'Some visible text',
      pageStateSummary: 'Page has 5 elements',
      interactiveCount: 3,
      warnings: []
    };
    
    const message = pageSummaryMessage('run_1', observation);
    
    expect(message).toMatchObject({
      id: 'run_1:page-summary',
      role: 'agent',
      kind: 'page_summary',
      status: 'complete',
      title: '页面摘要'
    });
    expect(message.content).toContain('Example Page');
    expect(message.content).toContain('example.com');
  });

  it('sets createdAt and updatedAt timestamps', () => {
    const observation: RuntimeObservationSnapshot = {
      url: 'https://example.com',
      title: 'Example',
      currentDomain: 'example.com',
      origin: 'https://example.com',
      visibleTextSummary: '',
      pageStateSummary: '',
      interactiveCount: 0,
      warnings: []
    };
    
    const message = pageSummaryMessage('run_1', observation);
    
    expect(message.createdAt).toBeTypeOf('number');
    expect(message.updatedAt).toBeTypeOf('number');
  });
});

describe('diagnosisMessage', () => {
  it('creates diagnosis message from report', () => {
    const report: DebugReport = {
      title: 'Form Doctor 诊断报告',
      findings: [
        {
          title: 'Finding 1',
          explanation: 'explanation 1',
          evidence: [{ source: 'form', summary: 'evidence 1' }],
          confidence: 'high'
        },
        {
          title: 'Finding 2',
          explanation: 'explanation 2',
          evidence: [{ source: 'debug', summary: 'evidence 2' }],
          confidence: 'medium'
        }
      ],
      recommendations: ['Fix the issues']
    };
    
    const message = diagnosisMessage('run_1', report);
    
    expect(message).toMatchObject({
      id: 'run_1:diagnosis',
      role: 'agent',
      kind: 'diagnosis',
      status: 'complete',
      title: 'Form Doctor 诊断报告'
    });
    expect(message.content).toContain('Finding 1');
    expect(message.content).toContain('Finding 2');
  });

  it('only includes first 3 findings', () => {
    const report: DebugReport = {
      title: 'Report',
      findings: [
        {
          title: 'Finding 1',
          explanation: 'explanation 1',
          evidence: [{ source: 'form', summary: 'evidence 1' }],
          confidence: 'high'
        },
        {
          title: 'Finding 2',
          explanation: 'explanation 2',
          evidence: [{ source: 'form', summary: 'evidence 2' }],
          confidence: 'high'
        },
        {
          title: 'Finding 3',
          explanation: 'explanation 3',
          evidence: [{ source: 'form', summary: 'evidence 3' }],
          confidence: 'high'
        },
        {
          title: 'Finding 4',
          explanation: 'explanation 4',
          evidence: [{ source: 'form', summary: 'evidence 4' }],
          confidence: 'high'
        }
      ],
      recommendations: []
    };
    
    const message = diagnosisMessage('run_1', report);
    
    expect(message.content).toContain('Finding 1');
    expect(message.content).toContain('Finding 2');
    expect(message.content).toContain('Finding 3');
    expect(message.content).not.toContain('Finding 4');
  });

  it('shows default text when no findings', () => {
    const report: DebugReport = {
      title: 'Report',
      findings: [],
      recommendations: []
    };
    
    const message = diagnosisMessage('run_1', report);
    
    expect(message.content).toBe('暂未发现高置信度问题。');
  });
});

describe('agentStatusMessage', () => {
  it('creates agent status message', () => {
    const message = agentStatusMessage('run_1', '工具执行', '工具执行成功');
    
    expect(message).toMatchObject({
      id: 'run_1:tool-status:工具执行',
      role: 'agent',
      kind: 'agent_status',
      status: 'complete',
      title: '工具执行',
      content: '工具执行成功'
    });
  });
});

describe('toolStatusMessage', () => {
  it('uses human-readable titles for common page and form tools', () => {
    expect(toolStatusMessage('run_1', 'bh_page_read_article', 'done')).toMatchObject({
      id: 'run_1:tool-status:正文读取完成',
      title: '正文读取完成',
      content: 'done'
    });
    expect(toolStatusMessage('run_1', 'bh_form_fill_many', 'filled')).toMatchObject({
      id: 'run_1:tool-status:字段填写完成',
      title: '字段填写完成',
      content: 'filled'
    });
  });

  it('falls back to the raw tool name for unknown tools', () => {
    expect(toolStatusMessage('run_1', 'bh_custom_tool', 'done')).toMatchObject({
      title: '工具 bh_custom_tool'
    });
  });
});

describe('errorMessage', () => {
  it('creates error message', () => {
    const message = errorMessage('run_1', '执行失败', '工具执行出错');
    
    expect(message).toMatchObject({
      id: 'run_1:error:执行失败',
      role: 'agent',
      kind: 'error',
      status: 'error',
      title: '执行失败',
      content: '工具执行出错'
    });
  });
});

describe('upsertMessage', () => {
  it('inserts new message', () => {
    const messages: AgentMessage[] = [];
    const message: AgentMessage = {
      id: 'msg_1',
      role: 'agent',
      kind: 'agent_status',
      status: 'complete',
      title: 'Test',
      content: 'Content',
      createdAt: 1000,
      updatedAt: 1000
    };
    
    upsertMessage(messages, message);
    
    expect(messages).toHaveLength(1);
    expect(messages[0]).toBe(message);
  });

  it('updates existing message by id', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg_1',
        role: 'agent',
        kind: 'agent_status',
        status: 'streaming',
        title: 'Original',
        content: 'Original content',
        createdAt: 1000,
        updatedAt: 1000
      }
    ];
    
    const update: AgentMessage = {
      id: 'msg_1',
      role: 'agent',
      kind: 'agent_status',
      status: 'complete',
      title: 'Updated',
      content: 'Updated content',
      createdAt: 2000,
      updatedAt: 2000
    };
    
    upsertMessage(messages, update);
    
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: 'msg_1',
      status: 'complete',
      title: 'Updated',
      content: 'Updated content',
      createdAt: 1000, // Preserved from original
      updatedAt: 2000
    });
  });

  it('preserves original createdAt when updating', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg_1',
        role: 'agent',
        kind: 'agent_status',
        status: 'streaming',
        title: 'Test',
        content: '',
        createdAt: 1000,
        updatedAt: 1000
      }
    ];
    
    const update: AgentMessage = {
      id: 'msg_1',
      role: 'agent',
      kind: 'agent_status',
      status: 'complete',
      title: 'Test',
      content: 'Done',
      createdAt: 5000,
      updatedAt: 5000
    };
    
    upsertMessage(messages, update);
    
    expect(messages[0]?.createdAt).toBe(1000);
    expect(messages[0]?.updatedAt).toBe(5000);
  });
});

describe('completeObserveStatusMessage', () => {
  it('removes streaming observe status message once observation has a page summary', () => {
    const messages: AgentMessage[] = [
      {
        id: 'run_1:observe-status',
        role: 'agent',
        kind: 'agent_status',
        status: 'streaming',
        title: '正在观察当前页面',
        content: 'BrowserHelm 正在读取当前页面摘要和可交互结构。',
        createdAt: 1000,
        updatedAt: 1000
      }
    ];
    
    completeObserveStatusMessage(messages);
    
    expect(messages).toHaveLength(0);
  });

  it('removes already complete observe status if an old snapshot contains it', () => {
    const messages: AgentMessage[] = [
      {
        id: 'run_1:observe-status',
        role: 'agent',
        kind: 'agent_status',
        status: 'complete',
        title: '已完成页面观察',
        content: 'Already complete',
        createdAt: 1000,
        updatedAt: 2000
      }
    ];
    
    completeObserveStatusMessage(messages);
    
    expect(messages).toHaveLength(0);
  });

  it('does nothing when observe status message is not present', () => {
    const messages: AgentMessage[] = [
      {
        id: 'run_1:task',
        role: 'user',
        kind: 'task',
        status: 'complete',
        content: 'Task',
        createdAt: 1000,
        updatedAt: 1000
      }
    ];
    
    completeObserveStatusMessage(messages);
    
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe('run_1:task');
  });
});
