import type { TaskClassification } from '../../shared/schemas/mode-system.schema';
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
        matchedSignals
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
