// The page's language, Japanese or English. It is settled once, before anything is drawn: the viewer's own choice
// (the JA / EN buttons, remembered), else ?lang= in the address, else the first of the browser's languages that the
// page has (any other language gets English). Every module picks its words with tr(ja, en) as it builds them;
// switching the language stores the choice and loads the page again.
import { recall, remember } from './storage.js';

const KEY = 'nuclide3d.lang';
export const LANGS = ['ja', 'en'];

function chosen() {
  const own = (v) => (LANGS.includes(v) ? v : null);
  const stored = own(recall(KEY, { lang: null }).lang);
  if (stored) return stored;
  const asked = own(new URLSearchParams(location.search).get('lang'));
  if (asked) return asked;
  const wanted = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  for (const tag of wanted) {
    const lang = own(String(tag).toLowerCase().split('-')[0]);
    if (lang) return lang;
  }
  return 'en';
}

/** 'ja' or 'en' */
export const LANG = chosen();
export const EN = LANG === 'en';
/** the Japanese or the English text, whichever the page is in */
export const tr = (ja, en) => (EN ? en : ja);

/** stores the viewer's language and loads the page again in it (the selected nucleus stays in the address) */
export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === LANG) return;
  remember(KEY, { lang });
  location.reload();
}

/**
 * Puts index.html into English. Its Japanese stays in the markup; the English rides along in data-en attributes:
 * data-en (the element's own text: its first text node, so a check box or a link inside stays), data-en-html (the
 * whole content), and data-en-title, -aria-label, -placeholder, -label (optgroup) and -content (meta) for those
 * attributes.
 */
export function translatePage(root = document) {
  document.documentElement.lang = LANG;
  if (!EN) return;
  for (const el of root.querySelectorAll('[data-en]')) {
    const text = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (!text) {
      el.prepend(el.dataset.en);
      continue;
    }
    // keep the spaces around it (a check box's label starts with one)
    const [, before, , after] = text.textContent.match(/^(\s*)([\s\S]*?)(\s*)$/);
    text.textContent = before + el.dataset.en + after;
  }
  for (const el of root.querySelectorAll('[data-en-html]')) el.innerHTML = el.dataset.enHtml;
  const attrs = { enTitle: 'title', enAriaLabel: 'aria-label', enPlaceholder: 'placeholder', enLabel: 'label', enContent: 'content' };
  for (const [key, attr] of Object.entries(attrs)) {
    const sel = `[data-${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}]`;
    for (const el of root.querySelectorAll(sel)) el.setAttribute(attr, el.dataset[key]);
  }
}
