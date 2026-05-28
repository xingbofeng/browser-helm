import type { TaskClassification } from '../../shared/schemas/mode-system.schema';
import type { TaskActionIntent } from '../../shared/schemas/mode-system.schema';
import { t } from '../../i18n/t';
import type { Locale } from '../../i18n/types';

type Rule = {
  mode: TaskClassification['mode'];
  reasonKey: string;
  confidence: TaskClassification['confidence'];
  patterns: RegExp[];
};

const rules: Rule[] = [
  {
    mode: 'form',
    reasonKey: 'taskClassify.reason.form',
    confidence: 'high',
    patterns: [
      /表单|form|字段|field|必填|required|校验|validation|disabled|不能提交|submit reason/iu
    ]
  },
  {
    mode: 'act',
    reasonKey: 'taskClassify.reason.act',
    confidence: 'high',
    patterns: [
      /点击|click|输入|type|填写|填入|选择|select|回复|评论|留言|搜索|提交|submit|发送|send|删除|delete|上传|upload|执行|execute/iu
    ]
  },
  {
    mode: 'debug',
    reasonKey: 'taskClassify.reason.debug',
    confidence: 'high',
    patterns: [
      /报错|错误|异常|error|console|network|请求失败|页面.*坏|页面.*问题|runtime/iu
    ]
  },
  {
    mode: 'ask',
    reasonKey: 'taskClassify.reason.ask',
    confidence: 'medium',
    patterns: [/总结|解释|说明|页面内容|what|why|describe/iu]
  }
];

export function classifyTask(task: string, locale: Locale = 'zh'): TaskClassification {
  const normalized = task.trim();
  const actionIntent = detectActionIntent(normalized);
  for (const rule of rules) {
    const matchedSignals = rule.patterns
      .map((pattern) => normalized.match(pattern)?.[0])
      .filter((signal): signal is string => Boolean(signal));
    if (matchedSignals.length > 0) {
      return {
        taskType: rule.mode,
        mode: rule.mode,
        reason: t(rule.reasonKey, locale),
        confidence: rule.confidence,
        matchedSignals,
        ...(actionIntent ? {
          actionIntent,
          requiresApproval: isApprovalIntent(actionIntent)
        } : {})
      };
    }
  }

  return {
    taskType: 'ask',
    mode: 'ask',
    reason: t('taskClassify.reason.fallback', locale),
    confidence: 'low',
    matchedSignals: []
  };
}

function detectActionIntent(task: string): TaskActionIntent | undefined {
  if (/提交|submit/iu.test(task)) return 'submit';
  if (/发送|send/iu.test(task)) return 'send';
  if (/删除|delete/iu.test(task)) return 'delete';
  if (/上传|upload/iu.test(task)) return 'upload';
  if (/点击|click/iu.test(task)) return 'click';
  if (/输入|type|填写|填入|选择|select|回复|评论|留言|搜索/iu.test(task)) return 'type';
  if (/执行|execute/iu.test(task)) return 'execute';
  return undefined;
}

function isApprovalIntent(intent: TaskActionIntent): boolean {
  return intent === 'submit' || intent === 'send' || intent === 'delete' || intent === 'upload' || intent === 'execute';
}
