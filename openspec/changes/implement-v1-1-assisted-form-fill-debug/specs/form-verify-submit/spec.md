## ADDED Requirements

### Requirement: Verify Form Before Submit
The system SHALL run form verification before allowing a BrowserHelm-driven submit.

#### Scenario: Verify passes
- **WHEN** required fields are satisfied, validation signals pass, and submit readiness is acceptable
- **THEN** the system may present a submit approval card

#### Scenario: Verify fails
- **WHEN** verification finds missing required fields, invalid fields, disabled submit, visible error text, or unsupported required inputs
- **THEN** the system blocks normal submission and presents the failure reason with next-step guidance

### Requirement: Verify Signals
The system SHALL verify HTML5 validity, required state, aria-invalid, validationMessage, shallow visible error text, submit disabled reason, and actual DOM values.

#### Scenario: Custom visible error text
- **WHEN** the page shows visible error text such as role alert, aria-live, or common error containers
- **THEN** verify includes that text as evidence without requiring CDP response body inspection

### Requirement: Submit Approval Card
The system SHALL use a main-screen approval card to block the run before any real submit action.

#### Scenario: Approval card content
- **WHEN** submit approval is requested
- **THEN** the card shows form name or summary, field summary, skipped fields, validation status, submit method, risk explanation, and masked field values

#### Scenario: Reveal values
- **WHEN** the user activates the eye icon for a field or the whole card
- **THEN** non-sensitive field values may be revealed and sensitive values remain masked or unavailable according to policy

### Requirement: Submit With Approval
The system SHALL execute real submit only after explicit user approval.

#### Scenario: Confirmed submit
- **WHEN** the user confirms the submit approval card
- **THEN** the system executes submit through the page's user path and records the action in trace

#### Scenario: Denied submit
- **WHEN** the user denies the submit approval card
- **THEN** the system does not submit and records the denial in trace

### Requirement: Verify Failed Still Submit
The system SHALL allow a high-risk “still submit” path when verify fails and the user explicitly confirms it.

#### Scenario: User still submits after verify failure
- **WHEN** verify fails and the user chooses to submit anyway
- **THEN** the approval card uses high-risk styling, records the override reason in trace, and only submits after explicit confirmation

### Requirement: Submit Method
The system SHALL submit through user-observable browser behavior and MUST NOT call `form.submit()` directly.

#### Scenario: Submit button available
- **WHEN** a submit button is available and actionable
- **THEN** the system clicks the submit button

#### Scenario: Enter submit fallback
- **WHEN** no submit button is available but the form supports Enter submission
- **THEN** the system may submit using Enter after approval

### Requirement: Observe Submit Result
The system SHALL observe the page after submit and classify the result as success, failure, or unknown.

#### Scenario: Success signal detected
- **WHEN** submit causes a URL change, success text, success toast, form reset, or validation errors disappear
- **THEN** the system reports submit success with evidence

#### Scenario: Failure signal detected
- **WHEN** submit leaves the page on the form with visible errors or blocked state
- **THEN** the system reports submit failure and explains the current form errors

#### Scenario: Unknown result
- **WHEN** the system cannot determine whether submit succeeded
- **THEN** it reports the result as unknown and MUST NOT claim success
