# iframe-reading Specification

## Purpose
TBD - created by archiving change implement-v1-0-2. Update Purpose after archive.
## Requirements
### Requirement: Iframe Listing
The system SHALL list iframe documents with stable iframe identifiers and accessibility summaries.

#### Scenario: Iframes detected
- **WHEN** the page contains iframe elements
- **THEN** `bh_iframe_list` returns iframeId, readable metadata, accessibility summary, and limitation state when applicable

### Requirement: Iframe Content Reading
The system SHALL read accessible iframe content by iframeId.

#### Scenario: Iframe visible text read
- **WHEN** an accessible iframe is read in visible_text mode
- **THEN** the tool returns iframe text, cursor/hasMore when applicable, URL metadata, and viewport/scroll state

### Requirement: Cross-Origin Limitation
The system SHALL return structured limitations for inaccessible iframe documents.

#### Scenario: Iframe inaccessible
- **WHEN** browser security prevents reading an iframe document
- **THEN** the tool returns an unsupported/limited result and MUST NOT claim iframe content was read

