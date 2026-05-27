## ADDED Requirements

### Requirement: Truncation Warnings And Read Hints
Page observation SHALL signal when bounded observation is insufficient and provide Agent-facing continuation hints.

#### Scenario: Observation truncated
- **WHEN** visible text is truncated or page content likely continues below the viewport
- **THEN** observation includes warnings and nextHints for page read, article read, viewport info, scroll, or iframe read as appropriate
