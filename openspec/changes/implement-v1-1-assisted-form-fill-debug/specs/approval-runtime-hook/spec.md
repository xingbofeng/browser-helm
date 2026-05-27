## ADDED Requirements

### Requirement: Submit Approval Runtime Guard
The runtime SHALL block BrowserHelm-driven form submission until a submit approval request is approved.

#### Scenario: Submit requires approval
- **WHEN** a tool attempts to submit a form
- **THEN** the runtime creates an approval request, pauses the run, and does not execute submit until approval is granted

### Requirement: Submit Approval Payload
Submit approval requests SHALL include form summary, submit method, field summary, skipped fields, verify result, risk explanation, and masked field values.

#### Scenario: Approval payload rendered
- **WHEN** the UI receives a submit approval request
- **THEN** it can render a complete submit approval card without re-reading raw tool state

### Requirement: Approval Override Audit
The runtime SHALL audit verify-failed still-submit overrides.

#### Scenario: Verify failed override approved
- **WHEN** the user approves still-submit after verify failure
- **THEN** the runtime records the override path and risk state before executing submit
