// Email verification links carry a token in the path
// (/verifyEmail/<token>/<subdomain>). Tokens have no business in analytics, so
// strip it from every URL property PostHog sends: $pageview URLs, referrers,
// and the person's initial URL.
const VERIFY_EMAIL_TOKEN = /(\/verifyEmail\/)[^/?#]+/gi;

const URL_PROPERTIES = [
  '$current_url',
  '$pathname',
  '$referrer',
  '$initial_current_url',
  '$initial_pathname',
  '$initial_referrer',
  '$prev_pageview_pathname',
  '$prev_pageview_url'
];

export const redactVerifyEmailToken = (value) =>
  typeof value === 'string' ? value.replace(VERIFY_EMAIL_TOKEN, '$1[redacted]') : value;

const redactBag = (bag) => {
  if (!bag) return;
  URL_PROPERTIES.forEach((key) => {
    if (key in bag) bag[key] = redactVerifyEmailToken(bag[key]);
  });
};

// posthog-js `before_send` hook. Returning null would drop the event, so pass
// nulls (dropped upstream) straight through.
export const redactEventUrls = (event) => {
  if (!event) return event;
  redactBag(event.properties);
  redactBag(event.$set);
  redactBag(event.$set_once);
  return event;
};
