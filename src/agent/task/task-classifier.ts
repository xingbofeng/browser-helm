import type { TaskClassification } from '../../shared/schemas/mode-system.schema';

type Rule = {
  mode: TaskClassification['mode'];
  reason: string;
  confidence: TaskClassification['confidence'];
  patterns: RegExp[];
};

const rules: Rule[] = [
  {
    mode: 'form',
    reason: '任务关注表单字段、校验或提交不可用原因，适合表单 / Form 诊断。',
    confidence: 'high',
    patterns: [
      /表单|form|字段|field|必填|required|校验|validation|disabled|不能提交|submit reason/iu
    ]
  },
  {
    mode: 'act',
    reason: '任务要求页面动作；v1.0 将其作为动作准备 / Act 处理，不自动执行填写或提交。',
    confidence: 'high',
    patterns: [
      /点击|click|输入|type|提交|submit|发送|send|删除|delete|上传|upload|执行|execute/iu
    ]
  },
  {
    mode: 'debug',
    reason: '任务关注页面错误、console、network 或页面健康状态，适合调试 / Debug 诊断。',
    confidence: 'high',
    patterns: [
      /报错|错误|异常|error|console|network|请求失败|页面.*坏|页面.*问题|runtime/iu
    ]
  },
  {
    mode: 'ask',
    reason: '任务是页面理解或普通问答，适合询问 / Ask。',
    confidence: 'medium',
    patterns: [/总结|解释|说明|页面内容|what|why|describe/iu]
  }
];

export function classifyTask(task: string): TaskClassification {
  const normalized = task.trim();
  for (const rule of rules) {
    const matchedSignals = rule.patterns
      .map((pattern) => normalized.match(pattern)?.[0])
      .filter((signal): signal is string => Boolean(signal));
    if (matchedSignals.length > 0) {
      return {
        taskType: rule.mode,
        mode: rule.mode,
        reason: rule.reason,
        confidence: rule.confidence,
        matchedSignals
      };
    }
  }

  return {
    taskType: 'ask',
    mode: 'ask',
    reason: '任务意图不明确，安全降级为询问 / Ask，不扩大工具可见范围。',
    confidence: 'low',
    matchedSignals: []
  };
}
