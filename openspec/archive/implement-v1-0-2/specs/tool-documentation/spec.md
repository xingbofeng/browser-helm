## ADDED Requirements

### Requirement: v1.0.2 Tool Documentation
Every v1.0.2 tool SHALL be documented in `src/tools/README.md` with ToolSpec metadata.

#### Scenario: New read tool documented
- **WHEN** page, iframe, viewport, element, nav, debug, or policy tools are added
- **THEN** the tool README lists name, title, directory, modes, risk, parameters, and meaning

### Requirement: v1.0.2 Tool Header Comments
Every v1.0.2 tool module SHALL include the required TSDoc/JSDoc maintenance block.

#### Scenario: Tool reviewed
- **WHEN** a maintainer opens a v1.0.2 tool module
- **THEN** the header explains purpose, modes, read/write behavior, risk, approval possibility, parameters, result semantics, and usage timing
