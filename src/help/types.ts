// Help content data model. Topics live in src/help/sections-*.ts and are
// aggregated in src/help/index.ts; Help.tsx renders them.

export type HelpStep = string;
export type HelpParagraph = string;

export type HelpSection = {
  heading: string;
  body?: HelpParagraph[];
  steps?: HelpStep[];
  tip?: HelpParagraph;
};

export type HelpTopic = {
  id: string;
  title: string;
  icon: string;          // lucide-react icon name (PascalCase)
  summary: string;
  sections: HelpSection[];
};
