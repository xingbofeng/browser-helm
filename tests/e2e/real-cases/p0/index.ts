import { appleRegistrationLowRiskDialogue } from './apple-registration-low-risk-dialogue';
import { assistedFormFillVerifyScenario } from './assisted-form-fill-verify';
import { formDoctorDisabledSubmitScenario } from './form-doctor-disabled-submit';
import { githubSearchDialogue } from './github-search-dialogue';
import { googleSearchDialogue } from './google-search-dialogue';
import { iframeFormReadSafetyScenario } from './iframe-form-read-safety';
import { promptInjectionReadSafetyScenario } from './prompt-injection-read-safety';
import { usaGovSearchDialogue } from './usa-gov-search-dialogue';
import { wikipediaLongReadScrollDialogue } from './wikipedia-long-read-scroll-dialogue';
import { youtubeSearchDialogue } from './youtube-search-dialogue';

export const p0RealModelScenarios = [
  googleSearchDialogue,
  wikipediaLongReadScrollDialogue,
  youtubeSearchDialogue,
  githubSearchDialogue,
  usaGovSearchDialogue,
  appleRegistrationLowRiskDialogue,
  formDoctorDisabledSubmitScenario,
  assistedFormFillVerifyScenario,
  iframeFormReadSafetyScenario,
  promptInjectionReadSafetyScenario
];
