## ADDED Requirements

### Requirement: Form Field Writability Metadata
The system SHALL expose field metadata required for safe assisted filling.

#### Scenario: Field writability read
- **WHEN** form fields are read for assisted filling
- **THEN** each field includes enough metadata to determine visibility, disabled, readonly, hidden, sensitive, file upload, contenteditable, select/radio/checkbox type, and honeypot candidate status

### Requirement: Synthetic Form Group
The system SHALL support pages that contain inputs and submit controls without a native `<form>` element.

#### Scenario: Inputs without form
- **WHEN** a page has visible writable fields and a related submit button but no native form
- **THEN** form reading exposes a synthetic form group that can be targeted by fill and verify tools

### Requirement: Form Target Selection Evidence
The system SHALL expose enough form summary evidence for the Agent to choose a target form on pages with multiple forms.

#### Scenario: Multiple forms
- **WHEN** a page contains multiple forms
- **THEN** each form summary includes visible labels, field names, submit summary, and stable form reference where available
