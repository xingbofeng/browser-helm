## ADDED Requirements

### Requirement: v1.1 Form Tool Documentation
Every v1.1 form action tool SHALL be documented in the tool README and include complete ToolSpec metadata.

#### Scenario: Form tool added
- **WHEN** `bh_form_infer_fill_plan`, `bh_form_fill_field`, `bh_form_fill_many`, `bh_form_verify`, or `bh_form_submit_with_approval` is added
- **THEN** `src/tools/README.md` lists tool name, title, directory, modes, risk, parameters, and meaning

### Requirement: v1.1 Tool Header Comments
Every v1.1 tool module SHALL include a TSDoc/JSDoc block comment before the exported ToolSpec or ToolSpec factory.

#### Scenario: Tool module reviewed
- **WHEN** a maintainer opens a v1.1 form or debug tool module
- **THEN** the header explains Agent purpose, run modes, read/write behavior, risk, approval possibility, parameters, result semantics, and typical use

### Requirement: Risk And Approval Documentation
v1.1 tool documentation SHALL identify mutating behavior and approval boundaries.

#### Scenario: Submit tool documented
- **WHEN** `bh_form_submit_with_approval` is documented
- **THEN** documentation states that it is high risk, requires approval, changes page or business state, and must observe result after execution
