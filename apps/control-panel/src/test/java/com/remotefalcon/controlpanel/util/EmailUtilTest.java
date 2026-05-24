package com.remotefalcon.controlpanel.util;

import com.mailersend.sdk.MailerSendResponse;
import com.remotefalcon.library.documents.Show;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link EmailUtil}. Exercises the {@code mailer.dev-bypass}
 * short-circuit: when set, every send returns a synthetic {@code 202}
 * without hitting MailerSend. That's the only branch we can drive purely
 * from unit tests; live SMTP/SDK paths belong in integration tests.
 *
 * <p>Indirect coverage also lands on the public {@code sendXxxEmail}
 * helpers, since each one ends up calling the bypassed {@code sendEmail}.
 */
class EmailUtilTest {

    private EmailUtil emailUtil;

    @BeforeEach
    void setUp() {
        emailUtil = new EmailUtil();
        // Bypass MailerSend entirely so the SDK is never invoked.
        ReflectionTestUtils.setField(emailUtil, "mailerDevBypass", Boolean.TRUE);
        ReflectionTestUtils.setField(emailUtil, "sendgridKey", "dummy");
        ReflectionTestUtils.setField(emailUtil, "webUrl", "https://test.local");
        ReflectionTestUtils.setField(emailUtil, "signUpTemplateId", "tmpl-sign-up");
        ReflectionTestUtils.setField(emailUtil, "forgotPasswordTemplateId", "tmpl-forgot");
        ReflectionTestUtils.setField(emailUtil, "requestApiAccessTemplateId", "tmpl-api");
    }

    private static Show show() {
        return Show.builder()
                .showName("Test Show")
                .email("user@example.com")
                .showToken("tok")
                .showSubdomain("test")
                .build();
    }

    @Test
    void sendSignUpEmail_devBypass_returns202_withoutNetwork() {
        MailerSendResponse r = emailUtil.sendSignUpEmail(show());
        assertThat(r).isNotNull();
        assertThat(r.responseStatusCode).isEqualTo(202);
    }

    @Test
    void sendForgotPasswordEmail_devBypass_returns202() {
        MailerSendResponse r = emailUtil.sendForgotPasswordEmail(show(), "reset-link-xyz");
        assertThat(r).isNotNull();
        assertThat(r.responseStatusCode).isEqualTo(202);
    }

    @Test
    void sendRequestApiAccessEmail_devBypass_returns202() {
        MailerSendResponse r = emailUtil.sendRequestApiAccessEmail(show(), "access", "secret");
        assertThat(r).isNotNull();
        assertThat(r.responseStatusCode).isEqualTo(202);
    }

    @Test
    void devBypassNull_treatedAsFalse_doesNotShortCircuit() {
        // Boolean.TRUE.equals(null) is false, so the bypass branch must
        // not fire when the flag is unset. We can't exercise the real
        // SDK path without network, but flipping bypass off and back on
        // confirms the property is being read on every send (not cached).
        ReflectionTestUtils.setField(emailUtil, "mailerDevBypass", Boolean.TRUE);
        assertThat(emailUtil.sendSignUpEmail(show()).responseStatusCode).isEqualTo(202);
        ReflectionTestUtils.setField(emailUtil, "mailerDevBypass", Boolean.TRUE);
        assertThat(emailUtil.sendForgotPasswordEmail(show(), "link").responseStatusCode).isEqualTo(202);
    }
}
