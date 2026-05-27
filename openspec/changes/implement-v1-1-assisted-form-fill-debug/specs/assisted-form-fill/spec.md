## ADDED Requirements

### Requirement: Infer Fill Plan
The system SHALL infer a form fill plan from the user task, current page summary, readable page context, and current form field snapshots before executing assisted form filling.

#### Scenario: Fill plan includes field reasoning
- **WHEN** the Agent prepares to fill a form
- **THEN** the system records target form, target fields, requested values, value source, confidence, reason, and skipped field reasons in trace or tool detail

#### Scenario: Sensitive value removed from plan
- **WHEN** the inferred fill plan contains a password, token, payment, identity, or other sensitive field
- **THEN** the system marks the field as skipped and MUST NOT pass the sensitive value to a fill action

### Requirement: Batch Fill Fields
The system SHALL provide a batch form filling tool that accepts structured field targets and values for a single target form.

#### Scenario: Batch fill succeeds
- **WHEN** `bh_form_fill_many` receives writable text, email, number, date, time, textarea, select, radio, checkbox, or contenteditable targets
- **THEN** it fills each supported target, triggers input/change/blur validation events where applicable, and returns field-level results

#### Scenario: Partial batch fill
- **WHEN** one or more fields fail or are skipped during batch filling
- **THEN** the tool returns partial success with per-field status and continues filling remaining eligible fields

#### Scenario: Cross-form fill is rejected
- **WHEN** a batch fill request includes fields from multiple forms
- **THEN** the system rejects or splits the request and MUST NOT silently write across multiple forms in one `bh_form_fill_many` execution

### Requirement: Single Field Fill
The system SHALL provide a single-field fill tool for user corrections, recovery, and focused tests.

#### Scenario: User updates one field
- **WHEN** the user edits a field value from a form execution card
- **THEN** the system can apply that value through `bh_form_fill_field` and re-run verify without restarting the whole task

### Requirement: Field Write Guards
The system SHALL skip fields that are unsafe or unsupported to write.

#### Scenario: Unsafe fields skipped
- **WHEN** a field is sensitive, hidden, disabled, readonly, invisible, a honeypot candidate, or `input[type=file]`
- **THEN** the fill tool skips the field, records a structured skip reason, and does not count the skip as a tool failure

#### Scenario: Explicit clear
- **WHEN** a field value is missing from the fill plan
- **THEN** the system skips the field unless the plan explicitly requests `clear` or an empty string value

### Requirement: Fill Recovery
The system SHALL support bounded recovery for stale refs and partial fill failures.

#### Scenario: Stale ref retry
- **WHEN** a fill operation encounters stale refs
- **THEN** the system may re-observe once, retry matching fields once, and record the retry in trace

#### Scenario: Batch fallback
- **WHEN** batch filling cannot complete all eligible fields
- **THEN** the Agent may fallback to single-field filling for remaining fields and preserve field-level trace

### Requirement: Actual DOM Values
The system SHALL treat the current DOM value after page formatting as the source of truth.

#### Scenario: Page formats value
- **WHEN** the page reformats a requested value after input events
- **THEN** the fill result records requested value, actual value preview, and masked actual value where applicable
