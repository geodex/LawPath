import type { HelpTopic } from "./types";
import { CORE_TOPICS } from "./sections-core";
import { COMPLIANCE_TOPICS } from "./sections-compliance";
import { PIPELINE_TOPICS } from "./sections-pipelines";

export type { HelpTopic, HelpSection, HelpStep, HelpParagraph } from "./types";

// Order matters — the sidebar displays topics in this sequence and the
// first topic is the default selection when the modal opens.
export const HELP_TOPICS: HelpTopic[] = [
  ...CORE_TOPICS,
  ...COMPLIANCE_TOPICS,
  ...PIPELINE_TOPICS
];
