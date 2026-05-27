## ADDED Requirements

### Requirement: Form Fill Readiness
The system SHALL determine readiness for field filling before writing values.

#### Scenario: Fill target ready
- **WHEN** a field ref resolves to a visible, enabled, writable, non-sensitive supported field
- **THEN** the system marks it ready for fill

#### Scenario: Fill target not ready
- **WHEN** a field is stale, hidden, disabled, readonly, invisible, sensitive, unsupported, or a honeypot candidate
- **THEN** the system blocks writing that field and returns a structured readiness reason

### Requirement: Submit Readiness
The system SHALL determine readiness for submit button or Enter submit before requesting approval.

#### Scenario: Submit target ready
- **WHEN** a submit button or Enter submit path is available after verify
- **THEN** the system can request submit approval with method and target evidence

#### Scenario: Submit target blocked
- **WHEN** no submit path is available or submit is disabled without override
- **THEN** the system reports submit not ready and provides disabled reason evidence when available
