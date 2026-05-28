import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Braces,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Languages,
  LockKeyhole,
  MousePointerClick,
  PanelRight,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow
} from 'lucide-react';
import './style.css';

import { LOCALE_LABELS, type Locale } from '../../i18n/types';
import { readLocale, writeLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';

const browserHelmLogoUrl = new URL('../../ui/assets/browserhelm-logo.png', import.meta.url).href;
const browserHelmTransparentLogoUrl = new URL(
  './browserhelm-logo-transparent.png',
  import.meta.url
).href;
const browserHelmDownloadUrl = '/browser-helm-latest.zip';

const workflowIcons = [Search, FileText, PanelRight, ShieldCheck];

function LandingPage() {
  const [locale, setLocale] = useState<Locale>('zh');
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);

  useEffect(() => {
    void readLocale().then(setLocale);
  }, []);

  const selectLanguage = (nextLocale: Locale) => {
    void writeLocale(nextLocale);
    setLocale(nextLocale);
    setIsLanguageOpen(false);
  };

  const proofItems = [
    t('options.proof.0', locale),
    t('options.proof.1', locale),
    t('options.proof.2', locale)
  ];

  const workflows = [
    { title: t('options.workflow.0.title', locale), body: t('options.workflow.0.body', locale) },
    { title: t('options.workflow.1.title', locale), body: t('options.workflow.1.body', locale) },
    { title: t('options.workflow.2.title', locale), body: t('options.workflow.2.body', locale) },
    { title: t('options.workflow.3.title', locale), body: t('options.workflow.3.body', locale) }
  ];

  const steps = [
    { title: t('options.step.0.title', locale), body: t('options.step.0.body', locale) },
    { title: t('options.step.1.title', locale), body: t('options.step.1.body', locale) },
    { title: t('options.step.2.title', locale), body: t('options.step.2.body', locale) }
  ];

  const trustItems = [
    { title: t('options.trust.0.title', locale), body: t('options.trust.0.body', locale) },
    { title: t('options.trust.1.title', locale), body: t('options.trust.1.body', locale) },
    { title: t('options.trust.2.title', locale), body: t('options.trust.2.body', locale) }
  ];

  const devItems = [
    t('options.devItem.0', locale),
    t('options.devItem.1', locale),
    t('options.devItem.2', locale),
    t('options.devItem.3', locale)
  ];

  const faqs = [
    {
      question: t('options.faq.0.question', locale),
      answer: t('options.faq.0.answer', locale)
    },
    {
      question: t('options.faq.1.question', locale),
      answer: t('options.faq.1.answer', locale)
    },
    {
      question: t('options.faq.2.question', locale),
      answer: t('options.faq.2.answer', locale)
    }
  ];

  return (
    <main className="landing">
      <div className="floatingActions" aria-label={t('options.pageActionsAria', locale)}>
        <a
          className="topActionButton"
          href="https://github.com/xingbofeng/browser-helm"
          target="_blank"
          rel="noreferrer"
        >
          <GitHubMark />
          {t('options.copyGithub', locale)}
        </a>
        <a
          className="topActionButton topActionButtonPrimary"
          href={browserHelmDownloadUrl}
          target="_blank"
          rel="noreferrer"
          download="browser-helm-latest.zip"
        >
          <Download size={18} aria-hidden="true" />
          {t('options.copyDownload', locale)}
        </a>
        <div
          className="languageMenu"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setIsLanguageOpen(false);
            }
          }}
        >
          <button
            type="button"
            className="languageSelect"
            aria-haspopup="listbox"
            aria-label={t('options.languageAria', locale)}
            aria-expanded={isLanguageOpen}
            onClick={() => setIsLanguageOpen((current) => !current)}
          >
            <Languages size={16} aria-hidden="true" />
            <span>{LOCALE_LABELS[locale]}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {isLanguageOpen ? (
            <div className="languageOptions" role="listbox" aria-label={t('options.languageOptionsAria', locale)}>
              {(['zh', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="option"
                  aria-selected={locale === l}
                  onClick={() => selectLanguage(l)}
                >
                  <span>{locale === l ? '✓ ' : ''}</span>
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <section id="top" className="heroSection">
        <div className="heroContent">
          <div className="heroCopy">
            <a className="brand" href="#top" aria-label={t('brand.name', locale)}>
              <img src={browserHelmTransparentLogoUrl} alt="" />
              <span>{t('brand.name', locale)}</span>
            </a>
            <h1>{t('options.heroTitle', locale)}</h1>
            <p>{t('options.heroText', locale)}</p>
            <div className="heroActions">
              <a
                className="primaryButton"
                href={browserHelmDownloadUrl}
                target="_blank"
                rel="noreferrer"
                download="browser-helm-latest.zip"
              >
                <Download size={17} aria-hidden="true" />
                {t('options.copyDownload', locale)}
              </a>
              <a
                className="textButton"
                href="https://github.com/xingbofeng/browser-helm"
                target="_blank"
                rel="noreferrer"
              >
                <GitHubMark />
                {t('options.copyVisitGithub', locale)}
              </a>
            </div>
            <ul className="proofList" aria-label={t('options.productPrinciplesAria', locale)}>
              {proofItems.map((item) => (
                <li key={item}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <ProductMockup locale={locale} />
        </div>
      </section>

      <section id="workflows" className="section sectionSplit">
        <div>
          <h2>{t('options.workflowsTitle', locale)}</h2>
          <p>{t('options.workflowsText', locale)}</p>
        </div>
        <div className="workflowGrid">
          {workflows.map(({ title, body }, index) => {
            const Icon = workflowIcons[index] ?? Search;
            return (
              <article className="featureCard" key={title}>
                <Icon size={22} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="start" className="section stepsSection">
        <h2>{t('options.stepsTitle', locale)}</h2>
        <div className="steps">
          {steps.map(({ title, body }, index) => (
            <article className="stepItem" key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="trust" className="section trustSection">
        <div className="trustCopy">
          <h2>{t('options.trustTitle', locale)}</h2>
          <p>{t('options.trustText', locale)}</p>
        </div>
        <div className="trustList">
          {trustItems.map(({ title, body }) => (
            <article key={title}>
              <LockKeyhole size={20} aria-hidden="true" />
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="dev" className="section devSection">
        <div>
          <h2>{t('options.devTitle', locale)}</h2>
          <p>{t('options.devText', locale)}</p>
        </div>
        <div className="terminalPanel" aria-label={t('options.developerCommandsAria', locale)}>
          <div className="terminalChrome">
            <span />
            <span />
            <span />
          </div>
          <code>npm run build</code>
          <code>npm run typecheck</code>
          <code>npm run lint</code>
          <code>npm run test:e2e</code>
        </div>
        <ul className="devPills">
          {devItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section id="faq" className="section faqSection">
        <h2>{t('options.faqTitle', locale)}</h2>
        <div className="faqList">
          {faqs.map(({ question, answer }) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="footer">
        <span>{t('brand.name', locale)}</span>
        <span>{t('options.footerTagline', locale)}</span>
      </footer>
    </main>
  );
}

function GitHubMark() {
  return (
    <svg
      aria-hidden="true"
      className="githubMark"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.58 2 12.22c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49v-1.9c-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.35 1.11 2.92.85.09-.66.35-1.11.64-1.37-2.22-.26-4.55-1.13-4.55-5.03 0-1.11.39-2.02 1.03-2.73-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.04A9.35 9.35 0 0 1 12 6.99c.85 0 1.7.12 2.5.34 1.91-1.32 2.75-1.04 2.75-1.04.55 1.4.2 2.44.1 2.7.64.71 1.03 1.62 1.03 2.73 0 3.91-2.34 4.77-4.57 5.03.36.32.68.94.68 1.9v2.8c0 .27.18.59.69.49A10.13 10.13 0 0 0 22 12.22C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function ProductMockup({ locale }: { locale: Locale }) {
  return (
    <div className="productMockup" aria-label={t('options.mockupProductAria', locale)}>
      <div className="browserFrame">
        <div className="frameBar">
          <span />
          <span />
          <span />
          <strong>{t('options.browserTitle', locale)}</strong>
        </div>
        <div className="mockPage">
          <div className="mockHeroLine" />
          <div className="mockForm">
            <label>
              <span>{t('options.mockupFormName', locale)}</span>
              <i />
            </label>
            <label>
              <span>{t('options.mockupFormEmail', locale)}</span>
              <i />
            </label>
            <label className="wide">
              <span>{t('options.mockupFormReason', locale)}</span>
              <i />
            </label>
            <button type="button">{t('options.mockupSubmitButton', locale)}</button>
          </div>
          <div className="refOverlay">
            <MousePointerClick size={16} aria-hidden="true" />
            {t('options.mockupRef', locale)}
          </div>
        </div>
      </div>
      <aside className="cockpitPanel">
        <div className="cockpitHeader">
          <div>
            <img src={browserHelmLogoUrl} alt="" />
            <strong>{t('options.panelTitle', locale)}</strong>
          </div>
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <div className="modeSwitch">
          <button type="button">{t('options.askModeLabel', locale)}</button>
          <button type="button" className="active">
            {t('options.actModeLabel', locale)}
          </button>
        </div>
        <article className="panelCard">
          <Workflow size={18} aria-hidden="true" />
          <h3>{t('options.pageSummaryTitle', locale)}</h3>
          <p>{t('options.pageSummaryBody', locale)}</p>
        </article>
        <article className="panelCard panelCardAccent">
          <Braces size={18} aria-hidden="true" />
          <h3>{t('options.traceTitle', locale)}</h3>
          <p>{t('options.traceBody', locale)}</p>
        </article>
      </aside>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<LandingPage />);
