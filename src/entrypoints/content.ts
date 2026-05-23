export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // BrowserHelm content runtime will host DOM, a11y, form, and page observation tools.
  }
});
