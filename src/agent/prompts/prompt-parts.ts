export const decisionContractPrompt = [
  'Return JSON only.',
  'Do not wrap the JSON in markdown fences or add explanatory text.',
  'Allowed decisions: tool_call, ask_user, finish, fail.',
  'tool_call shape: { "type": "tool_call", "tool": string, "args": object }.',
  'When tools are available and the task needs page observation or action, return tool_call before finish.',
  'finish shape: { "type": "finish", "message": string }.',
  'fail shape: { "type": "fail", "message": string, "code"?: string }.'
].join(' ');
