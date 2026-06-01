import { amazonScenario } from './amazon';
import { anthropicScenario } from './anthropic';
import { appleScenario } from './apple';
import { bbcScenario } from './bbc';
import { githubScenario } from './github';
import { googleScenario } from './google';
import { mdnScenario } from './mdn';
import { redditScenario } from './reddit';
import { stackOverflowScenario } from './stackoverflow';
import { usaGovScenario } from './usa-gov';
import { wikipediaScenario } from './wikipedia';
import { youtubeScenario } from './youtube';

export const realModelScenarios = [
  googleScenario,
  wikipediaScenario,
  youtubeScenario,
  redditScenario,
  amazonScenario,
  githubScenario,
  stackOverflowScenario,
  mdnScenario,
  bbcScenario,
  usaGovScenario,
  appleScenario,
  anthropicScenario
];
