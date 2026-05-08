import MiscPageShell from './MiscPageShell';

const PrivacyPolicy = () => (
  <MiscPageShell title="Privacy Policy">
    <p>
      <em>Effective May 8, 2026.</em>
    </p>

    <p>
      Remote Falcon is a free, open-source service that lets show owners run
      interactive Christmas light shows. This page explains what we collect when
      you use it, what we do with that data, and the choices you have. Plain
      language only — no fine-print lawyering.
    </p>

    <strong>What we collect</strong>
    <p>When you create a Remote Falcon account we collect:</p>
    <ul>
      <li>
        <strong>Account details</strong> — your email address, a password
        (stored hashed, never in plaintext), your show name, and the subdomain
        you pick.
      </li>
      <li>
        <strong>Show metadata</strong> — sequences you upload, viewer-page
        HTML/CSS you write, jukebox/voting preferences, and the hours you set
        for your show.
      </li>
      <li>
        <strong>Optional location</strong> — if you opt in to the public Shows
        Map, we store the latitude and longitude of the address you provide
        (rounded to about 11 m so your exact home isn&rsquo;t pinpointed) plus
        the city and state.
      </li>
      <li>
        <strong>Connection metadata</strong> — your IP address, browser
        user-agent, and a coarse geolocation derived from the IP. Used for rate
        limiting, abuse prevention, and aggregate analytics.
      </li>
      <li>
        <strong>Usage analytics</strong> — pages you visit and actions you take
        in the control panel, captured by PostHog so we can improve the
        product. No keystrokes, no form values, no session recordings.
      </li>
    </ul>
    <p>We don&rsquo;t collect payment information — Remote Falcon is free.</p>

    <strong>How we use it</strong>
    <p>We use the data above to:</p>
    <ul>
      <li>Run your account and let you sign in</li>
      <li>Render your viewer page and serve your show metadata to your viewers</li>
      <li>Show your show on the public Shows Map (only if you opted in)</li>
      <li>
        Send transactional emails — sign-up confirmation, forgot-password
        resets, occasional service notices
      </li>
      <li>Improve the product based on aggregate usage patterns</li>
      <li>Detect and stop abuse</li>
    </ul>
    <p>
      We do not sell your data, share it with advertisers, or use it to
      profile you outside Remote Falcon.
    </p>

    <strong>Third parties we use</strong>
    <p>
      Running Remote Falcon means a few outside services see slices of your
      data. We pick them deliberately and treat them as data processors, not
      partners.
    </p>
    <ul>
      <li>
        <strong>MailerSend</strong> — sends sign-up and password-reset emails.
        Sees your email address and show name.
      </li>
      <li>
        <strong>MapTiler</strong> — renders the Shows Map tiles. Sees your IP
        address (because your browser fetches tiles from them) and, if you
        opted in, the public lat/lng of your show.
      </li>
      <li>
        <strong>PostHog</strong> — receives usage analytics. Sees your IP,
        browser metadata, and the actions you took in the control panel.
      </li>
      <li>
        <strong>DigitalOcean Spaces</strong> — stores any images you upload to
        image-hosting. Behaves like an S3-compatible CDN.
      </li>
      <li>
        <strong>Cloudflare</strong> — sits in front of remotefalcon.com as a
        CDN and DDoS shield. Sees IP-level connection data.
      </li>
    </ul>

    <strong>Cookies &amp; local storage</strong>
    <p>We use a small number of first-party cookies and localStorage entries:</p>
    <ul>
      <li>An auth token that keeps you signed in</li>
      <li>Your theme preference (light/dark)</li>
      <li>Any sidebar/layout preferences you&rsquo;ve set</li>
    </ul>
    <p>
      No third-party advertising cookies. PostHog uses a first-party cookie
      scoped to remotefalcon.com so events from a single visitor stay stitched
      together.
    </p>

    <strong>Public viewer pages</strong>
    <p>
      The HTML/CSS you write for your viewer page is public — that&rsquo;s the
      point of having one. Any content you put there (text, images, embedded
      scripts) is served as-is to anyone who visits your subdomain.
      You&rsquo;re responsible for what you publish.
    </p>

    <strong>The Shows Map</strong>
    <p>
      Listing on the public Shows Map is opt-in. When you opt in, we publish
      your show name, hours, status, and a coarsened latitude/longitude.
      Coordinate precision is capped at four decimal places (~11 m) — enough
      for navigation, not enough to point at a specific door. You can opt out
      from the control panel at any time; the pin disappears within five
      minutes (the cache window).
    </p>

    <strong>Children</strong>
    <p>
      Remote Falcon isn&rsquo;t directed at children under 13, and we
      don&rsquo;t knowingly collect data from them. If you believe we have,
      contact us and we&rsquo;ll delete it.
    </p>

    <strong>Your rights</strong>
    <p>You can:</p>
    <ul>
      <li>See and edit your account details from the control panel</li>
      <li>
        Delete your account (which removes your show data and deactivates your
        subdomain) — this is final
      </li>
      <li>Request an export of your show data</li>
      <li>Opt out of the public Shows Map at any time</li>
    </ul>
    <p>
      If you&rsquo;re in the EU/UK or California, you have additional rights
      under the GDPR or CCPA respectively — access, rectification, erasure,
      portability, restriction. Contact us to exercise them and we&rsquo;ll
      respond within 30 days.
    </p>

    <strong>Security</strong>
    <p>
      Passwords are stored as bcrypt hashes. Authentication uses signed JWT
      tokens over HTTPS. Database backups are encrypted at rest. No system is
      perfectly secure, but we operate Remote Falcon with the same care
      we&rsquo;d want for our own data.
    </p>

    <strong>Changes to this policy</strong>
    <p>
      If we materially change what we collect or how we use it, we&rsquo;ll
      update this page and notify active accounts by email. The
      &ldquo;Effective&rdquo; date at the top tells you when this version was
      published.
    </p>

    <strong>Contact</strong>
    <p>Questions about your data?</p>
    <ul>
      <li>
        Open an issue on{' '}
        <a href="https://github.com/Remote-Falcon" target="_blank" rel="noopener noreferrer">
          our GitHub org
        </a>
        .
      </li>
      <li>
        Post in the{' '}
        <a href="https://www.facebook.com/groups/remotefalcon" target="_blank" rel="noopener noreferrer">
          Remote Falcon Facebook group
        </a>
        .
      </li>
    </ul>
  </MiscPageShell>
);

export default PrivacyPolicy;
