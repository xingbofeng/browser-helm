## ADDED Requirements

### Requirement: Form Execution Cards
The side panel SHALL render form execution state in the existing Agent waterfall.

#### Scenario: Form fill run displayed
- **WHEN** BrowserHelm performs assisted form filling
- **THEN** the main panel shows form task, fill progress, verify result, approval, and submit result cards without replacing the current Agent waterfall layout

### Requirement: Submit Approval Card UI
The side panel SHALL render submit approval as an in-flow card that blocks the run.

#### Scenario: Approval card blocks run
- **WHEN** submit approval is pending
- **THEN** the user can approve or deny from the card and the run does not submit until approval

### Requirement: Preserve Current Debug Drawer Behavior
The side panel SHALL keep advanced developer options behind the existing top-right icon.

#### Scenario: Debug drawer not default
- **WHEN** BrowserHelm opens
- **THEN** the advanced developer drawer remains closed by default

### Requirement: v1.1 Visual Continuity
The side panel SHALL preserve the current BrowserHelm visual theme.

#### Scenario: v1.1 UI rendered
- **WHEN** v1.1 form execution UI is visible
- **THEN** it uses the current warm BrowserHelm side panel style and does not introduce a separate workbench or old four-tab main navigation
