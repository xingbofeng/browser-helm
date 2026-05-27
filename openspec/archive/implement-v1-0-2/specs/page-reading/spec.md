## ADDED Requirements

### Requirement: Visible Text Pagination
The system SHALL provide cursor-based visible text reading for long pages.

#### Scenario: Page has more visible text
- **WHEN** visible text exceeds the requested limit
- **THEN** the result includes text, cursor, nextCursor, hasMore, totalTextLength, and warnings

### Requirement: Article Reading
The system SHALL provide article-like content reading that prioritizes main content over navigation and footer noise.

#### Scenario: Article content found
- **WHEN** the page contains article, main, role main, or common content containers
- **THEN** the tool returns prioritized article text with optional headings and links

### Requirement: Observation Next Hints
Page observation SHALL provide next hints when bounded observation is insufficient.

#### Scenario: Visible text truncated
- **WHEN** `bh_page_observe` truncates visible text
- **THEN** the observation includes warnings and hints to call page read or article read tools
