# agent-loop-tooling Specification

## Purpose
TBD - created by archiving change implement-v1-0-2. Update Purpose after archive.
## Requirements
### Requirement: User Task Tool Calling Path
User-submitted tasks SHALL enter the AgentLoop tool-calling path rather than being answered only from one snapshot summary.

#### Scenario: Long page task
- **WHEN** a user task depends on content beyond the bounded observation
- **THEN** the Agent can call page read, viewport, wait, or iframe tools before producing the final answer

### Requirement: Tool Calling And Answer Phases
The system SHALL separate structured tool-calling decisions from final user-facing streaming answers.

#### Scenario: Final answer streaming
- **WHEN** tool-calling has gathered enough context and streaming is enabled
- **THEN** the final user-facing answer may stream while tool decisions remain structured

### Requirement: Internal Diagnostic Fallback Boundary
Internal diagnostic model fallback SHALL NOT replace the user task AgentLoop path.

#### Scenario: User task run
- **WHEN** the user submits a task
- **THEN** RuntimeDiagnosticModelClient is not used as the main product answer path

