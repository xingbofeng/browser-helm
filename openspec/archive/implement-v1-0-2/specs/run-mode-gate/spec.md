## ADDED Requirements

### Requirement: v1.0.2 Tool Visibility
Run mode gating SHALL expose v1.0.2 read and low-risk viewport tools only in appropriate modes.

#### Scenario: Ask mode reading
- **WHEN** the Agent is in Ask mode
- **THEN** page read, article read, iframe list/read, viewport info, and safe wait tools may be visible

#### Scenario: Scroll risk
- **WHEN** viewport scroll is visible
- **THEN** it is treated as low risk, marks changedPage, and requires subsequent observe/read
