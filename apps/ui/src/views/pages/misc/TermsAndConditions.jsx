import MiscPageShell from './MiscPageShell';

const TermsAndConditions = () => (
  <MiscPageShell title="Terms of Service">
    <p>
      <em>Effective May 8, 2026.</em>
    </p>

    <p>
      These terms govern your use of Remote Falcon. Plain language —
      fewer &ldquo;hereinafters&rdquo;, more sentences a normal person can
      parse. By creating an account or using the service, you agree to them.
    </p>

    <strong>The service</strong>
    <p>
      Remote Falcon is a free, open-source platform that lets show owners
      run interactive Christmas light shows — viewers can request songs, vote
      on what plays next, and discover shows nearby on a public map. The full
      source code is at{' '}
      <a href="https://github.com/Remote-Falcon" target="_blank" rel="noopener noreferrer">
        github.com/Remote-Falcon
      </a>{' '}
      under an open-source license.
    </p>
    <p>
      The hosted service at remotefalcon.com is provided as-is, free of charge,
      by the maintainers. You can also self-host the project from the public
      source.
    </p>

    <strong>Your account</strong>
    <p>To run a show you create an account with an email and password. You&rsquo;re responsible for:</p>
    <ul>
      <li>Keeping your password private and your account secure</li>
      <li>
        Anything that happens under your account, including content you
        publish on your viewer page
      </li>
      <li>Notifying us if you suspect unauthorized access</li>
    </ul>
    <p>One person, one account. Don&rsquo;t share credentials.</p>

    <strong>Acceptable use</strong>
    <p>Don&rsquo;t use Remote Falcon to:</p>
    <ul>
      <li>
        Host content that&rsquo;s illegal, hateful, harassing, or sexually
        explicit (this is a holiday-light-show service for the whole
        neighborhood — keep it that way)
      </li>
      <li>Infringe someone else&rsquo;s copyright or trademark</li>
      <li>
        Distribute malware, phishing pages, or anything malicious via your
        viewer page or the HTML editor
      </li>
      <li>
        Scrape, overload, or otherwise abuse the API or the public Shows Map
      </li>
      <li>Impersonate someone else or misrepresent your show&rsquo;s location</li>
    </ul>
    <p>
      We can suspend or terminate accounts that violate these rules, with or
      without notice depending on severity.
    </p>

    <strong>Your content</strong>
    <p>
      You own everything you put into Remote Falcon — sequences, viewer-page
      HTML/CSS, images, show metadata. By using the service, you grant us the
      limited license needed to host and serve that content to your viewers.
      We don&rsquo;t claim ownership and we don&rsquo;t use your content for
      anything else.
    </p>

    <strong>The public Shows Map</strong>
    <p>
      Listing on the public Shows Map is opt-in. By opting in, you agree to
      publish your show name, hours, status, and a coarsened location. You can
      opt out anytime from the control panel.
    </p>

    <strong>Subdomains</strong>
    <p>
      Each show gets a subdomain on remotefalcon.com (e.g.
      yourshow.remotefalcon.com). The subdomain is yours to use while your
      account is active. We retain the right to reclaim subdomains that are
      abandoned, abusive, or trademark-infringing.
    </p>

    <strong>No warranty</strong>
    <p>
      Remote Falcon is provided &ldquo;as is&rdquo;, without warranty of any
      kind, express or implied — including warranties of merchantability,
      fitness for a particular purpose, or non-infringement. We don&rsquo;t
      promise the service will be uninterrupted, error-free, or available at
      any specific time. Peak season is December and we try hard, but we make
      no service-level commitment.
    </p>

    <strong>Limitation of liability</strong>
    <p>
      To the fullest extent allowed by law, the maintainers and contributors
      of Remote Falcon are not liable for any indirect, incidental, special,
      consequential, or punitive damages arising from your use of the service —
      including lost profits, lost data, or business interruption. Our total
      liability for any claim arising under these terms is limited to what
      you paid us in the 12 months before the claim — which, for a free
      service, is $0.
    </p>

    <strong>Indemnification</strong>
    <p>
      You agree to defend and hold us harmless from any claims arising out of
      (a) content you publish on your viewer page, (b) your violation of these
      terms, or (c) your violation of someone else&rsquo;s rights.
    </p>

    <strong>Termination</strong>
    <p>
      You can delete your account anytime from the control panel. We can
      terminate or suspend access if you violate these terms. On termination,
      your show data and subdomain become inactive; we may keep aggregated
      usage statistics indefinitely (no personally identifiable data).
    </p>

    <strong>Changes to these terms</strong>
    <p>
      We may update these terms when the service changes materially. The
      &ldquo;Effective&rdquo; date at the top tells you which version is in
      force. If a change is significant, we&rsquo;ll notify active accounts by
      email. Continued use after a change means you accept the new terms.
    </p>

    <strong>Governing law</strong>
    <p>
      These terms are governed by the laws of the United States and the state
      in which the lead maintainer resides, without regard to conflict-of-law
      principles. Disputes are resolved in the courts of that jurisdiction.
    </p>

    <strong>Contact</strong>
    <p>Questions or concerns?</p>
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

export default TermsAndConditions;
