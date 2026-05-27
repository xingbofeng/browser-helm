## ADDED Requirements

### Requirement: Debug Drawer Tab
The system SHALL keep the current advanced developer drawer behavior and add a v1.1 Debug tab inside that drawer.

#### Scenario: Debug drawer remains collapsed by default
- **WHEN** the side panel opens
- **THEN** the Debug drawer is not shown until the user activates the existing top-right debug icon

#### Scenario: Debug tab available
- **WHEN** the user opens advanced developer options
- **THEN** the drawer includes a Debug tab alongside Trace, tools, and elements/forms views

### Requirement: Debug Summary
The Debug tab SHALL provide a user-readable page health and form execution summary before developer detail.

#### Scenario: Page health summary
- **WHEN** console, network, runtime, style, or form signals are available
- **THEN** the Debug tab summarizes the most important current health signals and next steps

### Requirement: Developer Debug Detail
The Debug tab SHALL expose developer-level detail without leaking secrets.

#### Scenario: Developer detail visible
- **WHEN** the user opens the Debug tab
- **THEN** the tab can show console errors, network failures, runtime exceptions, computed style signals, fill plan summary, form execution status, and submit status

#### Scenario: No response body deep inspector
- **WHEN** network failures are displayed
- **THEN** the Debug tab shows shallow request summary and failure classification but MUST NOT provide CDP response body deep inspection

### Requirement: Debug Explain Error
The system SHALL allow shallow debug signals to be explained in user-readable language.

#### Scenario: Explain console error
- **WHEN** the user asks to explain or inspect a console/network/runtime/style issue
- **THEN** the system returns an explanation and suggested next step using available shallow evidence

### Requirement: Copy Redacted Debug Data
The system SHALL allow copying redacted debug and tool details.

#### Scenario: Copy redacted JSON
- **WHEN** the user copies debug detail
- **THEN** copied content excludes secrets and raw sensitive field values
