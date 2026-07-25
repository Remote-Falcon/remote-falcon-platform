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
