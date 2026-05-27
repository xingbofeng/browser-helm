import { AlertTriangle, CheckCircle2, ClipboardList, FilePenLine, Shield, XCircle } from 'lucide-react';
import type { RunSnapshot, RuntimeToolResultSnapshot } from '../../runtime/runtime-messages';
import { StreamingMarkdown } from './streaming-markdown';

type FormActionCardProps = {
  toolResult: RuntimeToolResultSnapshot;
  snapshot?: RunSnapshot | undefined;
};

/**
 * 表单执行卡片 — 在 Agent 瀑布流中展示表单填写/验证/审批/提交状态。
 */
export function FormActionCard({ toolResult, snapshot }: FormActionCardProps) {
  const tool = toolResult.tool;
  if (tool === 'bh_form_infer_fill_plan') return <FillPlanCard result={toolResult} />;
  if (tool === 'bh_form_fill_many' || tool === 'bh_form_fill_field') return <FillProgressCard result={toolResult} />;
  if (tool === 'bh_form_verify') return <VerifyCard result={toolResult} />;
  if (tool === 'bh_form_submit_with_approval') return <ApprovalCard toolResult={toolResult} snapshot={snapshot} />;
  return null;
}

function FillPlanCard({ result }: { result: RuntimeToolResultSnapshot }) {
  return (
    <div className="bh-formCard" role="status">
      <div className="bh-formCardIcon"><ClipboardList size={18} /></div>
      <div className="bh-formCardBody"><strong>推断填写方案</strong><StreamingMarkdown content={result.summary} /></div>
    </div>
  );
}

function FillProgressCard({ result }: { result: RuntimeToolResultSnapshot }) {
  return (
    <div className="bh-formCard" role="status">
      <div className="bh-formCardIcon"><FilePenLine size={18} /></div>
      <div className="bh-formCardBody"><strong>字段填写</strong><StreamingMarkdown content={result.summary} /></div>
    </div>
  );
}

function VerifyCard({ result }: { result: RuntimeToolResultSnapshot }) {
  const Icon = result.code === 'OK' ? CheckCircle2 : AlertTriangle;
  return (
    <div className="bh-formCard" role="status">
      <div className="bh-formCardIcon"><Icon size={18} /></div>
      <div className="bh-formCardBody"><strong>表单验证</strong><StreamingMarkdown content={result.summary} /></div>
    </div>
  );
}

function ApprovalCard({ toolResult, snapshot }: { toolResult: RuntimeToolResultSnapshot; snapshot?: RunSnapshot | undefined }) {
  if (snapshot?.pendingApproval?.status === 'denied') {
    return (
      <div className="bh-formCard bh-formCard--error" role="status">
        <div className="bh-formCardIcon"><XCircle size={18} /></div>
        <div className="bh-formCardBody"><strong>提交已拒绝</strong><p>用户拒绝了本次提交</p></div>
      </div>
    );
  }
  if (snapshot?.pendingApproval != null) {
    return (
      <div className="bh-formCard bh-formCard--approval" role="alert">
        <div className="bh-formCardIcon"><Shield size={18} /></div>
        <div className="bh-formCardBody"><strong>提交审批中...</strong><p>等待用户确认提交表单</p></div>
      </div>
    );
  }
  return (
    <div className="bh-formCard bh-formCard--approval" role="status">
      <div className="bh-formCardIcon"><Shield size={18} /></div>
      <div className="bh-formCardBody"><strong>提交请求</strong><StreamingMarkdown content={toolResult.summary} /></div>
    </div>
  );
}
