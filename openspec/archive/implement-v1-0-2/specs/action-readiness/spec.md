## ADDED Requirements

### Requirement: Iframe-Aware Element Actions
Action readiness SHALL support stable refs that resolve to elements inside accessible iframe contexts.

#### Scenario: Iframe element action
- **WHEN** a stable ref points to an element inside an iframe
- **THEN** readiness resolves the iframe context and blocks stale or inaccessible targets

### Requirement: Viewport Mutation Readiness
Action readiness SHALL classify viewport scroll as a low-risk viewport mutation.

#### Scenario: Scroll readiness
- **WHEN** a viewport scroll action is prepared
- **THEN** readiness returns low risk and requires observe/read after execution
