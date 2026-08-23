import posthog from 'posthog-js';

import safeStorage from '../safeStorage';

// One definition of "hosted build": the SaaS deployment with the PostHog
// key baked in at build time, which is also the only deployment with an
// operator email stack. Both consent surfaces (signup checkbox, Account
// Settings toggle) and posthog.init gate on this — a single export so the
// definition can't fork between them.
export const isHostedBuild = !!import.meta.env.VITE_PUBLIC_POSTHOG_KEY;

// Admin impersonation swaps the session to another operator's show; any
// identity-affecting analytics written during it would land on the wrong
// person (or drag the customer's PII into the admin's device profile).
// Every identity-affecting helper below checks this.
export const isImpersonationSession = () => !!safeStorage.getItem('isImpersonating');

// The show subdomain is the ONLY key that joins a browser-side `sign_up` to
// the `email_verified` that follows it. `email_verified` is anonymous:
// `person_profiles: 'identified_only'` gives anonymous events a deterministic
// id derived from the device's distinct_id and never merges them, and the
// verification link is routinely opened on a different device (mail app
// WebView, phone vs desktop). `sign_up` itself is identified as the show
// since identifyShowAtSignup (P0-7), but the funnel still has to cross the
// anonymous verification step, so it aggregates on this property, not on
// the person.
//
// Derivation mirrors the server, which is the authority: showSubdomain is
// `showName.replaceAll("\\s", "").toLowerCase()` at BOTH sites in
// GraphQLMutationService.java (signUp and the show-name change). If that rule
// ever changes, change it here in the same commit or the funnel silently
// stops joining.
export const deriveShowSubdomain = (showName) => (showName ? showName.replace(/\s/g, '').toLowerCase() : '');

// PRD-013 P0-7 — identify the show in PostHog at signup, BEFORE `sign_up`
// fires. The onboarding drip enrols whoever fires that event; until this
// existed that was the anonymous signup browser (random distinct_id, no
// email), and the address only reached that person if the SAME browser
// logged in before the drip's 1-day stage-1 gate expired. Measured
// 2026-08-22: 31 enrolments, 21 failed "No recipient identifier found".
// Identifying here makes the enrolled person the show itself (the same
// distinct_id identifyShow uses on login), carrying an address from
// second 0 — and turns `sign_up` into an identified event for the funnel.
//
// Consent posture is identical to identifyShow: email ONLY while
// marketingOptIn is true; false is stamped without email; null (checkbox
// never rendered / self-host) is omitted. lastLoginDate is deliberately NOT
// stamped — signup is not a login, and that property is the recency anchor
// for dormant-audience targeting.
//
// The subdomain is derived client-side because signUp returns a Boolean,
// not the Show; deriveShowSubdomain mirrors the server's rule.
export const identifyShowAtSignup = (showName, email, marketingOptIn) => {
  const showSubdomain = deriveShowSubdomain(showName);
  if (!showSubdomain) return '';
  if (isImpersonationSession()) return '';
  try {
    const props = { showName };
    if (marketingOptIn === true) {
      props.marketingOptIn = true;
      if (email) props.email = email;
    } else if (marketingOptIn === false) {
      props.marketingOptIn = false;
    }
    posthog.identify?.(showSubdomain, props);
  } catch {
    /* analytics must never break signup */
  }
  return showSubdomain;
};

export const trackPosthogEvent = (name, data = {}) => {
  if (import.meta.env?.MODE !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[PostHog] event', name, data);
  }
  posthog.capture?.(name, data);
};

// PRD-013 — enforce an email-consent decision on the PostHog person, in
// ONE capture (a single $set/$unset payload can't half-apply the way two
// sequential events can). Shared by every consent surface so the scrub
// payload can never drift between call sites. The control-panel server
// independently enforces opt-outs (PostHogUtil), so this client call is
// UX-speed, not the only guarantee.
export const applyEmailConsent = (optIn, email) => {
  if (isImpersonationSession()) return;
  try {
    if (optIn) {
      posthog.capture?.('email_consent_enforced', {
        $set: { marketingOptIn: true, ...(email ? { email } : {}) }
      });
    } else {
      posthog.capture?.('email_consent_enforced', {
        $set: { marketingOptIn: false },
        $unset: ['email']
      });
    }
  } catch {
    /* analytics must never break the consent flow itself */
  }
};

// PRD-013 — fire an activation-milestone event at most once per show per
// device. One owner for the fired-flag naming and check-set-track sequence
// so future milestones (wizard/checklist phases) don't grow bespoke
// variants. Device-scoped by design (localStorage): PostHog Workflows'
// own per-person dedup is the backstop for cross-device refires.
export const fireMilestoneOnce = (eventName, showSubdomain, props = {}) => {
  if (!eventName || !showSubdomain) return false;
  if (isImpersonationSession()) return false;
  const firedKey = `rf_milestone_${eventName}_${showSubdomain}`;
  if (safeStorage.getItem(firedKey)) return false;
  safeStorage.setItem(firedKey, '1');
  trackPosthogEvent(eventName, props);
  return true;
};
