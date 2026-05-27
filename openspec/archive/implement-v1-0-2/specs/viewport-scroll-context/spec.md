## ADDED Requirements

### Requirement: Viewport Info
The system SHALL read viewport and scroll state for the top page and accessible iframe contexts.

#### Scenario: Page viewport info
- **WHEN** viewport info is requested for the top page
- **THEN** the result includes scroll position, viewport size, scroll size, and canScroll flags

#### Scenario: Iframe viewport info
- **WHEN** viewport info is requested for an iframe
- **THEN** the result includes iframe scroll state or a structured limitation

### Requirement: Viewport Scroll
The system SHALL scroll the top page or a target iframe through a single viewport scroll tool.

#### Scenario: Scroll page
- **WHEN** `bh_viewport_scroll` scrolls the top page
- **THEN** the result includes before/after scroll state, `changedPage: true`, and `requiresObserve: true`

#### Scenario: Scroll iframe
- **WHEN** `bh_viewport_scroll` scrolls an iframe target
- **THEN** the result includes iframe before/after scroll state and requires subsequent observe/read

### Requirement: No Iframe Scroll Tool
The system SHALL NOT expose a separate `bh_iframe_scroll` tool.

#### Scenario: Agent needs iframe scroll
- **WHEN** the Agent needs to scroll iframe content
- **THEN** it uses `bh_viewport_scroll` with iframe target parameters
