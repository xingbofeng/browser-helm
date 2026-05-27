## 1. Schemas And Contracts

- [x] 1.1 Add shared schemas for fill plan, fill target, field fill result, form verify result, submit approval payload, submit result, debug summary, and v1.1 trace event payloads.
- [x] 1.2 Add v1.1 error codes for skipped sensitive field, unsupported file upload, unsafe hidden field, honeypot candidate, verify failed, submit approval denied, submit result unknown, native dialog unsupported, and fill retry exhausted.
- [x] 1.3 Extend tool name constants for `bh_form_infer_fill_plan`, `bh_form_fill_field`, `bh_form_fill_many`, `bh_form_verify`, and `bh_form_submit_with_approval`.
- [x] 1.4 Add schema tests for fill plan, fill result, verify result, submit approval payload, debug summary, masking, and invalid payload rejection.

## 2. Page DOM Form Capabilities

- [x] 2.1 Extend form field reading to expose visibility, writability, readonly, hidden, file upload, contenteditable, select/radio/checkbox metadata, sensitive classification, and honeypot candidate status.
- [x] 2.2 Implement synthetic form group detection for visible inputs and related submit controls without a native `<form>`.
- [x] 2.3 Extend multi-form summaries with stable form references, visible labels, field names, submit summaries, and target-selection evidence.
- [x] 2.4 Implement form action helpers for setting text, textarea, contenteditable plain text, select option, radio checked state, and checkbox desired state.
- [x] 2.5 Ensure form actions trigger appropriate input/change/blur events and read actual DOM values after page formatting.
- [x] 2.6 Implement bounded stale-ref recovery support for form actions: re-observe once, rematch field once, and return retry metadata.
- [x] 2.7 Implement form verify reader for HTML5 validity, required state, aria-invalid, validationMessage, visible custom error text, submit disabled reason, and actual field values.
- [x] 2.8 Implement submit execution helpers that prefer submit button click, fallback to Enter submit, never call `form.submit()` directly, and report native dialog unsupported.
- [x] 2.9 Add DOM tests for text/email/number/date/time/textarea/contenteditable/select/radio/checkbox fill behavior, event dispatch, actual value readback, and formatting.
- [x] 2.10 Add DOM tests for skipped sensitive/hidden/disabled/readonly/invisible/honeypot/file fields, synthetic forms, multi-form selection metadata, verify signals, and submit helper behavior.

## 3. Form Tools

- [x] 3.1 Implement `bh_form_infer_fill_plan` using user task, page summary, readable page context, form fields, fuzzy label/name/placeholder/aria-label matching, source/confidence/reason metadata, and sensitive-value stripping.
- [x] 3.2 Implement `bh_form_fill_field` for single-field corrections and recovery with guard checks, event dispatch, actual value result, skip reasons, and trace-friendly summary.
- [x] 3.3 Implement `bh_form_fill_many` for one target form with partial success, cross-form rejection, field-level results, internal stale-ref retry, and fallback metadata.
- [x] 3.4 Implement `bh_form_verify` as an independent tool returning verify status, field errors, missing required, disabled submit reason, visible error text, and current values.
- [x] 3.5 Implement `bh_form_submit_with_approval` so it only requests/continues after approval, executes real submit, observes result, and reports success/failure/unknown evidence.
- [x] 3.6 Ensure all form tools set correct modes, risk, changedPage, requiresObserve, approval behavior, context summaries, and full trace detail boundaries.
- [x] 3.7 Add node tool tests for plan inference, field fill, batch fill, partial success, fallback, stale retry, verify, approval request, submit execution, and unknown result.

## 4. Runtime, Agent, Policy, And Trace

- [x] 4.1 Update ToolSelector and mode policy so Form mode can see v1.1 form action tools while high-risk submit remains approval gated.
- [x] 4.2 Update system prompt and Agent orchestration to follow observe -> read fields -> infer fill plan -> fill many -> verify -> approval -> submit -> observe result.
- [x] 4.3 Extend RecoveryPolicy for REF_STALE form retry, partial fill recovery, verify failure, submit disabled, native dialog unsupported, and submit result unknown.
- [x] 4.4 Extend ApprovalManager and runtime events for submit approval card payload, deny/approve decisions, verify-failed still-submit override, and audit trace.
- [x] 4.5 Extend RunSnapshot messages for form task, fill progress, verify result, submit approval, submit result, failure explanation, and debug summary.
- [x] 4.6 Add form lifecycle trace events: `fill_plan_created`, `field_fill_started`, `field_fill_result`, `form_verify_result`, `submit_approval_requested`, and `form_submit_result`.
- [x] 4.7 Ensure field values are masked by default in messages, trace previews, tool detail, copied JSON, and screenshots; non-sensitive reveal stays UI-local.
- [x] 4.8 Add runtime/agent tests for tool selection, approval pause/resume, still-submit override, trace lifecycle, masking, recovery, and post-submit observation.

## 5. Debug Tools And Debug Drawer

- [x] 5.1 Extend shallow debug readers and summaries for console errors, network failures, runtime exceptions, computed style signals, form execution status, and page health.
- [x] 5.2 Implement or update Debug tab data shaping so user-readable summary and developer detail are separate from raw tool results.
- [x] 5.3 Add redacted JSON copy support for debug/tool detail without secrets or raw sensitive field values.
- [x] 5.4 Add tests for debug summary generation, explain-error consumption, computed style signal display, and redacted copy output.

## 6. Side Panel UI

- [x] 6.1 Add Agent waterfall cards for form task, field fill progress, verify result, submit approval, submit result, and failure/unknown result.
- [x] 6.2 Implement submit approval card with form summary, field summary, skipped fields, verify status, risk explanation, cancel/confirm, still-submit high-risk state, and per-field/global eye reveal controls.
- [x] 6.3 Add user field modification flow that calls single-field fill and re-runs verify without restarting the whole task.
- [x] 6.4 Preserve current header, bottom input, visual theme, and Debug drawer default-collapsed behavior.
- [x] 6.5 Add `Debug` tab to the current advanced developer drawer with page health, form execution summary, developer detail, fill plan summary, style/debug signals, and redacted copy controls.
- [x] 6.6 Update elements/forms table detail to include v1.1 field status, fill state, validation, skipped reason, and current selection for checkbox/radio/select.
- [x] 6.7 Add UI tests for form cards, approval card, reveal controls, still-submit path, field modification, Debug tab, drawer behavior, and responsive narrow side panel layout.

## 7. Fixtures And E2E Coverage

- [x] 7.1 Add or extend local fixtures for valid form, invalid form, disabled submit, multi-form, synthetic no-form group, checkbox/radio/select, textarea/contenteditable, honeypot, skipped sensitive fields, and submit result variants.
- [x] 7.2 Add E2E flow/POM coverage for successful fill -> verify -> approval -> submit -> observe result.
- [x] 7.3 Add E2E coverage for partial fill, skipped fields, verify failure, still-submit override, disabled submit explanation, multi-form target selection, and unknown submit result.
- [x] 7.4 Add E2E coverage for Debug drawer `Debug` tab, form execution trace, approval card screenshot, and redacted value rendering.
- [x] 7.5 Ensure E2E follows the existing specs/flows/pages/components layering and uses only local fixtures.

## 8. Documentation And Roadmap

- [x] 8.1 Update `src/tools/README.md` with all v1.1 form/debug tools, modes, risk, parameters, and semantics.
- [x] 8.2 Add required TSDoc/JSDoc block comments to every new v1.1 tool module.
- [x] 8.3 Update `docs/roadmap/v1.1-assisted-form-fill-and-debug.md` to reflect confirmed UI, scope, non-goals, tools, Debug drawer behavior, and design image path.
- [x] 8.4 Update `CONTEXT.md` with v1.1 domain language for Assisted Form Fill, Fill Plan, Form Verify, Submit Approval Card, and Debug Panel if needed.
- [x] 8.5 Append `implementation-notes.md` with v1.1 design decisions after implementation.

## 9. Verification

- [x] 9.1 Run focused schema, DOM, tool, runtime, and UI unit tests while implementing each layer.
- [x] 9.2 Run `npm run typecheck`.
- [x] 9.3 Run `npm run lint`.
- [x] 9.4 Run `npm test`.
- [x] 9.5 Run `npm run build`.
- [x] 9.6 Run `npm run test:e2e`.
- [x] 9.7 Use Chrome for Testing debug SOP to capture screenshots for main form execution, submit approval card, Debug tab, and submit result states.
- [x] 9.8 Run `npx openspec validate implement-v1-1-assisted-form-fill-debug --strict`.
