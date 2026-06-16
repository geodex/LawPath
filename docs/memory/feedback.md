---
name: feedback-large-components
description: Write large components in chunks to avoid hitting the 8000 output token limit
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7bd26372-d399-43d4-9d13-5c4d8d5415db
---

Write large React components (>200 lines) in multiple chunks using Write + Edit to avoid hitting the 8000 output token limit.

**Why:** Single large Write calls fail mid-output, leaving an incomplete file.

**How to apply:** Write a skeleton (imports, state, handlers) first, then Edit to append sub-components and modal sections. Keep each chunk under ~200 lines.
