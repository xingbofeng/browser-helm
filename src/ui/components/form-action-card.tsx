import { AlertTriangle, CheckCircle2, ClipboardList, FilePenLine, Shield, XCircle } from 'lucide-react';
import { useT } from '../../i18n/context';
import type { RunSnapshot, RuntimeToolResultSnapshot } from '../../runtime/runtime-messages';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { StreamingMarkdown } from './streaming-markdown';

type FormActionCardProps = {
  toolResult: RuntimeToolResultSnapshot;
  snapshot?: RunSnapshot | undefined;
};

/**
 * 表单执行卡片 — 在 Agent 瀑布流中展示表单填写/验证/审批/提交状态。
 */
export function FormActionCard({ toolResult, snapshot }: FormActionCardProps) {
  const t = useT();
  const tool = toolResult.tool;
  if (tool === 'bh_form_infer_fill_plan') return <FillPlanCard result={toolResult} t={t} />;
  if (tool === 'bh_form_fill_many' || tool === 'bh_form_fill_field') return <FillProgressCard result={toolResult} t={t} />;
  if (tool === 'bh_form_verify') return <VerifyCard result={toolResult} t={t} />;
  if (tool === 'bh_form_submit_with_approval') return <ApprovalCard toolResult={toolResult} snapshot={snapshot} t={t} />;
  return null;
}

function FillPlanCard({ result, t }: { result: RuntimeToolResultSnapshot; t: ReturnType<typeof useT> }) {
  const summary = result.ok ? result.summary : t('form.card.inferPlanNeedsValues');
  return (
    <div className="bh-formCard" role="status">
      <div className="bh-formCardIcon"><ClipboardList size={18} /></div>
      <div className="bh-formCardBody"><strong>{t('form.card.inferPlan')}</strong><StreamingMarkdown content={summary} /></div>
    </div>
  );
}

function FillProgressCard({ result, t }: { result: RuntimeToolResultSnapshot; t: ReturnType<typeof useT> }) {
  return (
    <div className="bh-formCard" role="status">
      <div className="bh-formCardIcon"><FilePenLine size={18} /></div>
      <div className="bh-formCardBody"><strong>{t('form.card.fillFields')}</strong><StreamingMarkdown content={result.summary} /></div>
    </div>
  );
}

function VerifyCard({ result, t }: { result: RuntimeToolResultSnapshot; t: ReturnType<typeof useT> }) {
  const Icon = result.code === 'OK' ? CheckCircle2 : AlertTriangle;
  return (
    <div className="bh-formCard" role="status">
      <div className="bh-formCardIcon"><Icon size={18} /></div>
      <div className="bh-formCardBody"><strong>{t('form.card.verify')}</strong><StreamingMarkdown content={result.summary} /></div>
    </div>
  );
}

function ApprovalCard({ toolResult, snapshot, t }: { toolResult: RuntimeToolResultSnapshot; snapshot?: RunSnapshot | undefined; t: ReturnType<typeof useT> }) {
  if (toolResult.code === ERROR_CODES.APPROVAL_CONTEXT_STALE) {
    return (
      <div className="bh-formCard bh-formCard--error" role="alert">
        <div className="bh-formCardIcon"><XCircle size={18} /></div>
        <div className="bh-formCardBody"><strong>{t('form.card.submitStale')}</strong><p>{t('form.card.submitStaleReason')}</p></div>
      </div>
    );
  }
  if (snapshot?.pendingApproval?.status === 'denied') {
    return (
      <div className="bh-formCard bh-formCard--error" role="status">
        <div className="bh-formCardIcon"><XCircle size={18} /></div>
        <div className="bh-formCardBody"><strong>{t('form.card.submitDenied')}</strong><p>{t('form.card.submitDeniedReason')}</p></div>
      </div>
    );
  }
  if (snapshot?.pendingApproval != null) {
    return (
      <div className="bh-formCard bh-formCard--approval" role="alert">
        <div className="bh-formCardIcon"><Shield size={18} /></div>
        <div className="bh-formCardBody"><strong>{t('form.card.submitApproving')}</strong><p>{t('form.card.submitApprovingWait')}</p></div>
      </div>
    );
  }
  if (toolResult.code === ERROR_CODES.APPROVAL_REQUIRED || toolResult.requiresApproval) {
    return (
      <div className="bh-formCard bh-formCard--approval" role="alert">
        <div className="bh-formCardIcon"><Shield size={18} /></div>
        <div className="bh-formCardBody"><strong>{t('form.card.submitRequired')}</strong><StreamingMarkdown content={toolResult.summary} /></div>
      </div>
    );
  }
  return (
    <div className="bh-formCard bh-formCard--approval" role="status">
      <div className="bh-formCardIcon"><Shield size={18} /></div>
      <div className="bh-formCardBody"><strong>{t('form.card.submitRequest')}</strong><StreamingMarkdown content={toolResult.summary} /></div>
    </div>
  );
}
