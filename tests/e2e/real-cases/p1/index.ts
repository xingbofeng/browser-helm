import { amazonHomepageStateDialogue } from './amazon-homepage-state-dialogue';
import { anthropicToolsForAgentsLongReadDialogue } from './anthropic-tools-for-agents-long-read-dialogue';
import { bbcNewsHomepageDialogue } from './bbc-news-homepage-dialogue';
import { cdpConsoleNetworkDiagnosisScenario } from './cdp-console-network-diagnosis';
import { githubAdapterGuidanceScenario } from './github-adapter-guidance';
import { mdnAccessibilityLongReadDialogue } from './mdn-accessibility-long-read-dialogue';
import { pdfManualReadScenario } from './pdf-manual-read';
import { redditFeedBlockOrContentDialogue } from './reddit-feed-block-or-content-dialogue';
import { shadowDomReadScenario } from './shadow-dom-read';
import { visionOverlayDiagnosisScenario } from './vision-overlay-diagnosis';

export const p1RealModelScenarios = [
  redditFeedBlockOrContentDialogue,
  amazonHomepageStateDialogue,
  mdnAccessibilityLongReadDialogue,
  bbcNewsHomepageDialogue,
  anthropicToolsForAgentsLongReadDialogue,
  cdpConsoleNetworkDiagnosisScenario,
  visionOverlayDiagnosisScenario,
  shadowDomReadScenario,
  pdfManualReadScenario,
  githubAdapterGuidanceScenario
];
