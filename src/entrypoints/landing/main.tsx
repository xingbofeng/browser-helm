import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronDown, Languages } from 'lucide-react';
import './style.css';

import { LOCALE_LABELS, type Locale } from '../../i18n/types';
import { readLocale, writeLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';

const browserHelmDownloadUrl = '/browser-helm-latest.zip';
const GITHUB_URL = 'https://github.com/xingbofeng/browser-helm';

/* ─── SVG icons (inline for style control) ─── */

function BrandMarkIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M8.5 13.4c0-3.6 3.1-6.5 7.5-6.5s7.5 2.9 7.5 6.5v6.1c0 3.4-3 5.8-7.5 5.8s-7.5-2.4-7.5-5.8v-6.1Z"
        fill="#F3FFF9"
        fillOpacity=".93"
      />
      <path d="M11.5 11.2 8.3 8M20.5 11.2 23.7 8" stroke="#9FFFE0" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="13" cy="16" r="1.35" fill="#062018" />
      <circle cx="19" cy="16" r="1.35" fill="#062018" />
      <path d="M13.4 20c1.4.9 3.8.9 5.2 0" stroke="#062018" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.2 17.2H4.7M27.3 17.2h-2.5" stroke="#9FFFE0" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BrandMarkSmall() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M8.5 13.4c0-3.6 3.1-6.5 7.5-6.5s7.5 2.9 7.5 6.5v6.1c0 3.4-3 5.8-7.5 5.8s-7.5-2.4-7.5-5.8v-6.1Z"
        fill="#F3FFF9"
      />
      <circle cx="13" cy="16" r="1.35" fill="#062018" />
      <circle cx="19" cy="16" r="1.35" fill="#062018" />
      <path d="M13.4 20c1.4.9 3.8.9 5.2 0" stroke="#062018" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="18" height="18">
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.1c-3.34.73-4.04-1.41-4.04-1.41-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.08 1.83 2.82 1.3 3.51.99.11-.78.42-1.3.76-1.6-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23A11.5 11.5 0 0 1 12 5.84c1.02 0 2.04.14 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="18" height="18">
      <path d="M12 3v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 1.7 5.2L19 10l-5.3 1.8L12 17l-1.7-5.2L5 10l5.3-1.8L12 3Z" />
      <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function LayoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 6h8v8H8z" />
      <path d="M4 10h4" />
      <path d="M16 10h4" />
      <path d="M12 14v4" />
      <path d="M9 21h6" />
    </svg>
  );
}

/* ─── Main Landing Page ─── */

function LandingPage() {
  const [locale, setLocale] = useState<Locale>('zh');
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const revealRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    void readLocale().then(setLocale);
  }, []);

  const selectLang = (next: Locale) => {
    void writeLocale(next);
    setLocale(next);
    setIsLangOpen(false);
  };

  const L = useCallback((key: string) => t(key, locale), [locale]);

  /* ── Cursor glow ── */
  useEffect(() => {
    const root = document.documentElement;
    const onMove = (e: PointerEvent) => {
      root.style.setProperty('--cursor-x', `${e.clientX}px`);
      root.style.setProperty('--cursor-y', `${e.clientY}px`);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  /* ── Scroll state for header ── */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── Scroll reveal ── */
  useEffect(() => {
    if (revealRef.current) revealRef.current.disconnect();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            obs.unobserve(e.target);
          }
        }
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' }
    );
    revealRef.current = obs;
    document.querySelectorAll('.reveal').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  });

  /* ── Markup ── */
  const toolItems = useMemo(
    () => [
      { name: 'bh_page_observe', desc: L('landing.tools.1') },
      { name: 'bh_form_infer_fill_plan', desc: L('landing.tools.2') },
      { name: 'bh_form_submit_with_approval', desc: L('landing.tools.3') },
      { name: 'bh_a11y_snapshot', desc: L('landing.tools.4') },
      { name: 'bh_debug_collect_page_health', desc: L('landing.tools.5') },
    ],
    [L]
  );

  const flowSteps = useMemo(
    () => [
      { title: L('landing.flow.s1.title'), body: L('landing.flow.s1.body') },
      { title: L('landing.flow.s2.title'), body: L('landing.flow.s2.body') },
      { title: L('landing.flow.s3.title'), body: L('landing.flow.s3.body') },
      { title: L('landing.flow.s4.title'), body: L('landing.flow.s4.body') },
      { title: L('landing.flow.s5.title'), body: L('landing.flow.s5.body') },
    ],
    [L]
  );

  const whyCards = useMemo(
    () => [
      { title: L('landing.why.card1.title'), body: L('landing.why.card1.body'), icon: <ShieldCheckIcon />, cls: 'large', delay: '1' },
      { title: L('landing.why.card2.title'), body: L('landing.why.card2.body'), icon: <LayoutIcon />, cls: 'tall', delay: '2' },
      { title: L('landing.why.card3.title'), body: L('landing.why.card3.body'), icon: <span style={{ fontFamily: 'monospace', fontSize: 18 }}>{'{ }'}</span>, cls: '', delay: '1' },
      { title: L('landing.why.card4.title'), body: L('landing.why.card4.body'), icon: <span style={{ fontSize: 18 }}>🩺</span>, cls: '', delay: '2' },
      { title: L('landing.why.card5.title'), body: L('landing.why.card5.body'), icon: <span style={{ fontSize: 18 }}>🛡️</span>, cls: '', delay: '3' },
    ],
    [L]
  );

  const canvasNodes = useMemo(
    () => [
      { cls: 'n1', label: 'observe', text: L('landing.canvas.n1') },
      { cls: 'n2', label: 'diagnose', text: L('landing.canvas.n2') },
      { cls: 'n3', label: 'approve', text: L('landing.canvas.n3') },
      { cls: 'n4', label: 'trace', text: L('landing.canvas.n4') },
    ],
    [L]
  );

  const compareGood = useMemo(
    () => [L('landing.compare.good1'), L('landing.compare.good2'), L('landing.compare.good3'), L('landing.compare.good4')],
    [L]
  );
  const compareBad = useMemo(
    () => [L('landing.compare.bad1'), L('landing.compare.bad2'), L('landing.compare.bad3'), L('landing.compare.bad4')],
    [L]
  );

  return (
    <>
      {/* ── Fixed background layers ── */}
      <div className="noise" aria-hidden="true" />
      <div className="page-glow" aria-hidden="true" />

      {/* ── Header ── */}
      <header className={`site-header${scrolled ? ' is-scrolled' : ''}`} id="top">
        <nav className="nav-shell" aria-label="Primary navigation">
          <a className="brand" href="#top" aria-label="BrowserHelm home">
            <span className="brand-mark" aria-hidden="true">
              <BrandMarkIcon />
            </span>
            <span>BrowserHelm</span>
          </a>

          <div className="nav-links">
            <a href="#why">{L('landing.nav.why')}</a>
            <a href="#flow">{L('landing.nav.flow')}</a>
            <a href="#tools">{L('landing.nav.tools')}</a>
            <a href="#install">{L('landing.nav.install')}</a>
          </div>

          <div className="nav-actions">
            <a className="btn btn-ghost btn-small magnetic" href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub">
              <GitHubIcon />
              <span>{L('landing.button.githubShort')}</span>
            </a>
            <a className="btn btn-primary btn-small magnetic" href={browserHelmDownloadUrl} download>
              <DownloadIcon />
              <span>{L('landing.button.download')}</span>
            </a>
            <div
              className="lang-dropdown"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setIsLangOpen(false);
              }}
            >
              <button
                type="button"
                className="lang-toggle"
                aria-expanded={isLangOpen}
                aria-label="Language"
                onClick={() => setIsLangOpen((v) => !v)}
              >
                <Languages size={15} aria-hidden="true" />
                <span>{LOCALE_LABELS[locale]}</span>
                <ChevronDown aria-hidden="true" />
              </button>
              {isLangOpen && (
                <div className="lang-menu" role="listbox">
                  {(['zh', 'en'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      className={`lang-option${locale === l ? ' is-active' : ''}`}
                      role="option"
                      aria-selected={locale === l}
                      onClick={() => selectLang(l)}
                    >
                      {LOCALE_LABELS[l]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </nav>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="hero" aria-labelledby="hero-title">
          <div className="wrap hero-grid">
            <div className="hero-copy reveal is-visible">
              <div className="eyebrow">
                <span className="dot" aria-hidden="true" />
                <span>{L('landing.hero.eyebrow')}</span>
              </div>
              <h1 id="hero-title">
                <span className="title-line">{L('landing.hero.title1')}</span>
                <span className="title-line gradient-word">{L('landing.hero.title2')}</span>
              </h1>
              <p className="hero-lead">{L('landing.hero.lead')}</p>
              <div className="hero-actions">
                <a className="btn btn-primary btn-large magnetic" href={browserHelmDownloadUrl} download>
                  <DownloadIcon />
                  <span>{L('landing.button.download')}</span>
                </a>
                <a className="btn btn-ghost btn-large magnetic" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  <GitHubIcon />
                  <span>{L('landing.button.github')}</span>
                </a>
              </div>
              <div className="hero-proof" aria-label="Product highlights">
                <span className="proof-chip"><b>0</b><span>{L('landing.proof.0')}</span></span>
                <span className="proof-chip"><b>30+</b><span>{L('landing.proof.1')}</span></span>
                <span className="proof-chip"><b>BYOK</b><span>{L('landing.proof.2')}</span></span>
              </div>
            </div>

            {/* ── Hero 3D visual stage ── */}
            <div className="hero-visual reveal is-visible" data-delay="2" aria-hidden="true">
              <div className="orb one" />
              <div className="orb two" />
              <div className="product-stage tilt-card">
                <div className="browser-window">
                  <div className="browser-top">
                    <div className="traffic"><i /><i /><i /></div>
                    <div className="window-title">{L('landing.mock.pageTitle')}</div>
                  </div>
                  <div className="form-demo">
                    <div className="scan-bar" />
                    <div className="fields">
                      <div className="field-card"><label>Name</label><div className="fake-input" /></div>
                      <div className="field-card"><label>Email</label><div className="fake-input" /></div>
                      <div className="field-card wide"><label>Reason</label><div className="fake-input" /></div>
                    </div>
                    <div className="fake-submit">Submit</div>
                    <div className="ref-badge">
                      <StarIcon />
                      ref: submit-button
                    </div>
                  </div>
                </div>

                <div className="cockpit-card">
                  <div className="cockpit-inner">
                    <div className="cockpit-head">
                      <div className="mini-brand">
                        <span className="brand-mark"><BrandMarkSmall /></span>
                        <span>BrowserHelm Cockpit</span>
                      </div>
                      <SparklesIcon />
                    </div>
                    <div className="mode-row">
                      <div className="mode-pill">{L('landing.mock.ask')}</div>
                      <div className="mode-pill active">{L('landing.mock.act')}</div>
                    </div>
                    <div className="insight-card">
                      <div className="insight-icon"><LayoutIcon /></div>
                      <h4>{L('landing.mock.summaryTitle')}</h4>
                      <p>{L('landing.mock.summaryBody')}</p>
                    </div>
                    <div className="insight-card trace-card">
                      <div className="insight-icon">{'{ }'}</div>
                      <h4>Trace</h4>
                      <p>{L('landing.mock.traceBody')}</p>
                    </div>
                  </div>
                </div>

                <div className="approval-pop">
                  <div className="risk"><span>⚠</span><span>{L('landing.mock.approvalTitle')}</span></div>
                  <div className="body">{L('landing.mock.approvalBody')}</div>
                  <div className="approval-actions">
                    <div className="tiny-action">{L('landing.mock.deny')}</div>
                    <div className="tiny-action ok">{L('landing.mock.approve')}</div>
                  </div>
                </div>

                <svg className="flow-lines" viewBox="0 0 760 620" preserveAspectRatio="none">
                  <path d="M230 400 C 360 370, 420 250, 550 270" />
                  <path d="M430 510 C 530 500, 560 450, 640 420" />
                  <path d="M180 135 C 340 125, 430 130, 565 180" />
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* ── Marquee ── */}
        <div className="marquee-wrap" aria-hidden="true">
          <div className="marquee">
            <span>Page Observe</span><span>Form Doctor</span><span>Approval Panel</span><span>Trace Replay</span>
            <span>OpenAI-compatible</span><span>IndexedDB Local State</span><span>Iframe Read</span><span>A11y Snapshot</span>
            <span>Page Observe</span><span>Form Doctor</span><span>Approval Panel</span><span>Trace Replay</span>
            <span>OpenAI-compatible</span><span>IndexedDB Local State</span><span>Iframe Read</span><span>A11y Snapshot</span>
          </div>
        </div>

        {/* ── Why section ── */}
        <section className="section" id="why">
          <div className="wrap">
            <div className="section-header reveal">
              <div className="section-kicker">{L('landing.why.kicker')}</div>
              <h2>{L('landing.why.title')}</h2>
              <p>{L('landing.why.lead')}</p>
            </div>

            <div className="bento-grid">
              {whyCards.map((card, i) => (
                <article key={i} className={`bento-card ${card.cls} reveal`} data-delay={card.delay}>
                  <div className="card-icon">{card.icon}</div>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                  {i === 0 && (
                    <div className="stats-row">
                      <div className="stat-card"><strong>0</strong><span>{L('landing.stat.backend')}</span></div>
                      <div className="stat-card"><strong>BYOK</strong><span>{L('landing.stat.byok')}</span></div>
                    </div>
                  )}
                  {i === 2 && (
                    <div className="mini-console">
                      <div className="console-top"><i /><i /><i /></div>
                      <div className="console-body">
                        <span className="code-line"><em>bh_page_observe</em> → summary</span>
                        <span className="code-line"><em>bh_form_list</em> → 1 form</span>
                        <span className="code-line"><b>approval required</b></span>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Flow section ── */}
        <section className="section" id="flow">
          <div className="wrap">
            <div className="section-header reveal">
              <div className="section-kicker">{L('landing.flow.kicker')}</div>
              <h2>{L('landing.flow.title')}</h2>
              <p>{L('landing.flow.lead')}</p>
            </div>
            <div className="workflow">
              {flowSteps.map((step, i) => (
                <article key={i} className="step-card reveal" data-delay={String(i)}>
                  <div className="step-no">{String(i + 1).padStart(2, '0')}</div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Tools section ── */}
        <section className="section" id="tools">
          <div className="wrap">
            <div className="section-header reveal">
              <div className="section-kicker">{L('landing.tools.kicker')}</div>
              <h2>{L('landing.tools.title')}</h2>
              <p>{L('landing.tools.lead')}</p>
            </div>
            <div className="split">
              <div className="glass-panel panel-pad reveal">
                <div className="tool-list">
                  {toolItems.map((t) => (
                    <div className="tool-item" key={t.name}>
                      <strong>{t.name}</strong>
                      <span>{t.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="glass-panel canvas-demo reveal" data-delay="2" aria-hidden="true">
                <svg viewBox="0 0 700 560" preserveAspectRatio="none">
                  <path d="M176 134 C 300 88, 408 144, 514 228" />
                  <path d="M520 276 C 438 360, 354 358, 216 444" />
                  <path d="M236 472 C 330 508, 432 496, 528 420" />
                </svg>
                {canvasNodes.map((n) => (
                  <div className={`node ${n.cls}`} key={n.cls}>
                    <small>{n.label}</small>
                    <p>{n.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Compare section ── */}
        <section className="section">
          <div className="wrap">
            <div className="section-header reveal">
              <div className="section-kicker">{L('landing.compare.kicker')}</div>
              <h2>{L('landing.compare.title')}</h2>
            </div>
            <div className="comparison">
              <div className="compare-card highlight reveal" data-delay="1">
                <h3>BrowserHelm</h3>
                <ul className="check-list">
                  {compareGood.map((item, i) => (
                    <li key={i}><CheckIcon /><span>{item}</span></li>
                  ))}
                </ul>
              </div>
              <div className="compare-card reveal" data-delay="2">
                <h3>{L('landing.compare.otherTitle')}</h3>
                <ul className="check-list">
                  {compareBad.map((item, i) => (
                    <li key={i}><CrossIcon /><span>{item}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── Install section ── */}
        <section className="section" id="install">
          <div className="wrap">
            <div className="install-card reveal">
              <div>
                <div className="section-kicker">{L('landing.install.kicker')}</div>
                <h2>{L('landing.install.title')}</h2>
                <p>{L('landing.install.lead')}</p>
                <div className="hero-actions">
                  <a className="btn btn-primary btn-large magnetic" href={browserHelmDownloadUrl} download>
                    <DownloadIcon />
                    <span>{L('landing.button.download')}</span>
                  </a>
                  <a className="btn btn-ghost btn-large magnetic" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                    <GitHubIcon />
                    <span>{L('landing.button.github')}</span>
                  </a>
                </div>
              </div>
              <div className="terminal" aria-label="Quick start commands">
                <div className="console-top"><i /><i /><i /></div>
                <pre>
                  <span className="dim"># BrowserHelm quick start</span>
                  {'\n'}<span className="accent">git clone</span> https://github.com/xingbofeng/browser-helm.git
                  {'\n'}<span className="accent">cd</span> browser-helm
                  {'\n'}<span className="accent">npm install</span>
                  {'\n'}<span className="accent">npm run build</span>
                  {'\n'}
                  {'\n'}<span className="dim"># Chrome</span>
                  {'\n'}chrome://extensions → Developer mode
                  {'\n'}Load unpacked → .output/chrome-mv3
                </pre>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="wrap">
          <div className="footer-grid">
            <div>
              <a className="brand" href="#top">
                <span className="brand-mark" aria-hidden="true"><BrandMarkSmall /></span>
                <span>BrowserHelm</span>
              </a>
              <p>{L('landing.footer.body')}</p>
            </div>
            <div className="footer-links">
              <a className="btn btn-ghost btn-small magnetic" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
              <a className="btn btn-primary btn-small magnetic" href={browserHelmDownloadUrl} download>{L('landing.button.download')}</a>
            </div>
          </div>
          <div className="footer-bottom">© {new Date().getFullYear()} BrowserHelm. MIT License.</div>
        </div>
      </footer>
    </>
  );
}

/* ── Mount ── */

function bootstrapInteractions() {
  /* magnetic buttons */
  document.querySelectorAll('.magnetic').forEach((btn) => {
    btn.addEventListener('pointermove', ((e: PointerEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      (e.currentTarget as HTMLElement).style.setProperty('--mx', `${x}px`);
      (e.currentTarget as HTMLElement).style.setProperty('--my', `${y}px`);
      const dx = (x - rect.width / 2) / rect.width;
      const dy = (y - rect.height / 2) / rect.height;
      (e.currentTarget as HTMLElement).style.transform = `translate3d(${dx * 8}px, ${dy * 8 - 2}px, 0)`;
    }) as EventListener);
    btn.addEventListener('pointerleave', ((e: PointerEvent) => {
      (e.currentTarget as HTMLElement).style.transform = '';
    }) as EventListener);
  });

  /* bento card hover glow */
  document.querySelectorAll('.bento-card').forEach((card) => {
    card.addEventListener('pointermove', ((e: PointerEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      (e.currentTarget as HTMLElement).style.setProperty('--card-x', `${e.clientX - rect.left}px`);
      (e.currentTarget as HTMLElement).style.setProperty('--card-y', `${e.clientY - rect.top}px`);
    }) as EventListener);
  });

  /* tilt card */
  const tilt = document.querySelector('.tilt-card');
  if (tilt) {
    tilt.addEventListener('pointermove', ((e: PointerEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      (e.currentTarget as HTMLElement).style.transform = `rotateX(${py * -3}deg) rotateY(${px * 4}deg)`;
    }) as EventListener);
    tilt.addEventListener('pointerleave', ((e: PointerEvent) => {
      (e.currentTarget as HTMLElement).style.transform = '';
    }) as EventListener);
  }
}

const rootEl = document.getElementById('root')!;
createRoot(rootEl).render(<LandingPage />);

/* Bootstrap DOM-level interactions after React renders */
requestAnimationFrame(() => {
  requestAnimationFrame(bootstrapInteractions);
});
