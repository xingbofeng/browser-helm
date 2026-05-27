## ADDED Requirements

### Requirement: Form Lifecycle Trace
The system SHALL record form execution lifecycle events for fill plan, field filling, verification, approval, submit, and result observation.

#### Scenario: Fill lifecycle recorded
- **WHEN** BrowserHelm executes an assisted form fill
- **THEN** trace includes `fill_plan_created`, `field_fill_started`, `field_fill_result`, and `form_verify_result` events with stable references where available

#### Scenario: Submit lifecycle recorded
- **WHEN** BrowserHelm requests approval and submits a form
- **THEN** trace includes `submit_approval_requested`, approval decision, `form_submit_result`, and post-submit observation evidence

### Requirement: Field Result Detail
The system SHALL record field-level requested value, actual value preview, masked actual value, status, skip reason, and validation result.

#### Scenario: Field skipped
- **WHEN** a field is skipped during fill
- **THEN** trace records the skip reason without treating the whole form run as failed unless no required progress is possible

### Requirement: Masking And Reveal Boundary
The system SHALL mask field values in default trace previews and UI summaries while preserving enough audit detail for debugging.

#### Scenario: Default masked trace
- **WHEN** a trace or tool detail preview is displayed
- **THEN** field values are masked by default and sensitive values are never revealed

#### Scenario: Non-sensitive reveal in approval
- **WHEN** the user reveals a non-sensitive field value in submit approval
- **THEN** the reveal affects only the UI view and does not write raw sensitive values into trace

### Requirement: Retry And Recovery Trace
The system SHALL record automatic re-observe retry and fallback attempts.

#### Scenario: Stale ref retry trace
- **WHEN** `fill_many` re-observes and retries after stale refs
- **THEN** trace records the original failure, re-observe, retry, and final field result
