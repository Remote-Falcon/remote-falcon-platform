import { HtmlValidate } from 'html-validate';

// html-validate runs in the browser; messages whose `message` includes
// any of these substrings are filtered out. They're either rules we
// intentionally bend (inline styles, no end-tag for <br>) or noise from
// owner-authored HTML that the platform doesn't enforce.
export const validationExceptions = [
  'instructional-text',
  'Trailing whitespace',
  'Inline style is not allowed',
  'End tag for <br> must be omitted',
  'Anchor link must have a text describing its purpose',
  'Expected omitted end tag <link> instead of self-closing element <link/>',
  '<img> is missing required "alt" attribute',
  'Expected omitted end tag <br> instead of self-closing element <br/>'
];

// doctype-style is off: the backend sanitizer (ViewerPageService.sanitize)
// round-trips saved HTML through jsoup, which always serializes the doctype
// lowercase — enforcing uppercase here trapped owners in an unfixable error
// loop (issue tracker #172). Doctype case is insignificant per spec, and
// doctype-html still rejects genuinely wrong doctypes.
export const htmlValidator = new HtmlValidate({
  extends: ['html-validate:recommended'],
  rules: { 'doctype-style': 'off' }
});

export const isException = (message) => validationExceptions.some((ex) => message.includes(ex));
