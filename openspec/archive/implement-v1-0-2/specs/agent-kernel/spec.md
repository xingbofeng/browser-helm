## ADDED Requirements

### Requirement: AgentLoop User Task Integration
The Agent Kernel SHALL support user task runs that call browser tools iteratively before producing a final response.

#### Scenario: Tool-calling user task
- **WHEN** a user submits a task from the side panel
- **THEN** the run can perform multiple model/tool turns and record tool results before finishing

### Requirement: Context Compaction For Page Reads
The Agent Kernel SHALL compact page read and iframe read results before placing them in model context.

#### Scenario: Long text read
- **WHEN** a page read tool returns long text
- **THEN** complete data is kept in trace/storage and only bounded summaries/chunks are included in model context
