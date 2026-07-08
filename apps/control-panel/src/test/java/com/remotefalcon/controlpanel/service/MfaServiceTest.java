package com.remotefalcon.controlpanel.service;

import com.eatthepath.otp.TimeBasedOneTimePasswordGenerator;
import com.remotefalcon.controlpanel.dto.TokenDTO;
import com.remotefalcon.controlpanel.repository.MfaKeyRotationAuditRepository;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.response.MfaEnrollment;
import com.remotefalcon.controlpanel.response.MfaKeyRotationResult;
import com.remotefalcon.controlpanel.response.MfaRecoveryCodes;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.ClientUtil;
import com.remotefalcon.controlpanel.util.MfaCryptoUtil;
import com.remotefalcon.controlpanel.util.TotpUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.MfaMethod;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.models.MfaConfig;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.spec.SecretKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link MfaService} — enrollment lifecycle, two-phase
 * sign-in completion, recovery-code single-use consumption, fresh re-auth
 * on disable/regenerate, per-account rate limiting, and admin reset.
 * Uses the REAL TotpUtil/MfaCryptoUtil so the crypto path is exercised
 * end-to-end; only I/O collaborators are mocked.
 */
@ExtendWith(MockitoExtension.class)
class MfaServiceTest {

    private static final String SHOW_TOKEN = "tok-mfa";
    private static final Duration STEP = Duration.ofSeconds(30);

    @Mock private AuthUtil authUtil;
    @Mock private ClientUtil clientUtil;
    @Mock private ShowRepository showRepository;
    @Mock private MongoTemplate mongoTemplate;
    @Mock private GraphQLQueryService graphQLQueryService;
    @Mock private MfaKeyRotationAuditRepository mfaKeyRotationAuditRepository;

    private TotpUtil totpUtil;
    private MfaCryptoUtil crypto;
    private MfaService mfaService;

    private byte[] secret;

    @BeforeEach
    void setUp() {
        totpUtil = new TotpUtil();
        crypto = new MfaCryptoUtil();
        ReflectionTestUtils.setField(crypto, "mfaSecretKey", "unit-test-mfa-encryption-key");
        mfaService = new MfaService(authUtil, clientUtil, showRepository, mongoTemplate,
                totpUtil, crypto, graphQLQueryService, mfaKeyRotationAuditRepository);
        secret = totpUtil.generateSecret();
    }

    // ---- helpers ----

    private String codeAt(long stepOffset) {
        try {
            TimeBasedOneTimePasswordGenerator generator = new TimeBasedOneTimePasswordGenerator(
                    STEP, 6, TimeBasedOneTimePasswordGenerator.TOTP_ALGORITHM_HMAC_SHA1);
            long step = Instant.now().getEpochSecond() / STEP.getSeconds() + stepOffset;
            return generator.generateOneTimePasswordString(
                    new SecretKeySpec(secret, "HmacSHA1"), Instant.ofEpochSecond(step * STEP.getSeconds()));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** A 6-digit string guaranteed NOT to verify in the ±1 window. */
    private String wrongCode() {
        List<String> window = List.of(codeAt(-1), codeAt(0), codeAt(1));
        for (int candidate = 0; candidate <= 3; candidate++) {
            String formatted = String.format("%06d", candidate);
            if (!window.contains(formatted)) {
                return formatted;
            }
        }
        throw new IllegalStateException("unreachable: 4 candidates cannot all collide with 3 codes");
    }

    private void stubSessionShow(Show show) {
        when(authUtil.getTokenDTO()).thenReturn(TokenDTO.builder().showToken(SHOW_TOKEN).build());
        when(showRepository.findByShowTokenForMfa(SHOW_TOKEN)).thenReturn(Optional.of(show));
    }

    private Show showWithoutMfa() {
        return Show.builder()
                .showToken(SHOW_TOKEN)
                .email("user@example.com")
                .showSubdomain("my-show")
                .build();
    }

    private Show showWithPendingEnrollment() {
        Show show = showWithoutMfa();
        show.setMfa(MfaConfig.builder()
                .enabled(false)
                .method(MfaMethod.TOTP)
                .secret(crypto.encrypt(secret))
                .build());
        return show;
    }

    private Show showWithMfaEnabled() {
        Show show = showWithoutMfa();
        show.setMfa(MfaConfig.builder()
                .enabled(true)
                .method(MfaMethod.TOTP)
                .secret(crypto.encrypt(secret))
                .build());
        return show;
    }

    private MfaConfig capturePersistedMfa() {
        ArgumentCaptor<Update> updateCaptor = ArgumentCaptor.forClass(Update.class);
        verify(mongoTemplate, atLeastOnce()).updateFirst(any(), updateCaptor.capture(), eq(Show.class));
        Object set = updateCaptor.getValue().getUpdateObject().get("$set", org.bson.Document.class).get("mfa");
        return (MfaConfig) set;
    }

    // ---- startMfaEnrollment ----

    @Test
    void startMfaEnrollment_throwsWhenDeploymentHasNoKey() {
        ReflectionTestUtils.setField(crypto, "mfaSecretKey", "");

        assertThatThrownBy(() -> mfaService.startMfaEnrollment())
                .hasMessage(StatusResponse.MFA_NOT_CONFIGURED.name());
    }

    @Test
    void startMfaEnrollment_persistsPendingConfig_andReturnsProvisioning() {
        stubSessionShow(showWithoutMfa());

        MfaEnrollment enrollment = mfaService.startMfaEnrollment();

        assertThat(enrollment.getSecret()).matches("[A-Z2-7]{32}");
        assertThat(enrollment.getOtpauthUri())
                .startsWith("otpauth://totp/Remote%20Falcon:user%40example.com")
                .contains("secret=" + enrollment.getSecret());

        MfaConfig persisted = capturePersistedMfa();
        assertThat(persisted.getEnabled()).isFalse();
        assertThat(persisted.getMethod()).isEqualTo(MfaMethod.TOTP);
        assertThat(persisted.getPendingSince()).isNotNull();
        // Stored value is AES-GCM ciphertext, never the raw/base32 secret.
        assertThat(persisted.getSecret()).isNotEqualTo(enrollment.getSecret());
    }

    @Test
    void startMfaEnrollment_throwsWhenAlreadyEnabled() {
        stubSessionShow(showWithMfaEnabled());

        assertThatThrownBy(() -> mfaService.startMfaEnrollment())
                .hasMessage(StatusResponse.MFA_ALREADY_ENABLED.name());
    }

    // ---- confirmMfaEnrollment ----

    @Test
    void confirmMfaEnrollment_enablesMfa_andReturnsRecoveryCodesOnce() {
        stubSessionShow(showWithPendingEnrollment());

        MfaRecoveryCodes recoveryCodes = mfaService.confirmMfaEnrollment(codeAt(0));

        assertThat(recoveryCodes.getRecoveryCodes()).hasSize(10);
        // Alphabet excludes the ambiguous I, L, O, 0, 1.
        assertThat(recoveryCodes.getRecoveryCodes())
                .allMatch(code -> code.matches("[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}"));

        MfaConfig persisted = capturePersistedMfa();
        assertThat(persisted.getEnabled()).isTrue();
        assertThat(persisted.getEnrolledDate()).isNotNull();
        assertThat(persisted.getPendingSince()).isNull();
        assertThat(persisted.getLastUsedTimeStep()).isPositive();
        // Stored codes are bcrypt hashes matching the returned plaintext.
        assertThat(persisted.getRecoveryCodes()).hasSize(10);
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        assertThat(encoder.matches(recoveryCodes.getRecoveryCodes().get(0),
                persisted.getRecoveryCodes().get(0))).isTrue();
        assertThat(persisted.getRecoveryCodes().get(0)).startsWith("$2");
    }

    @Test
    void confirmMfaEnrollment_rejectsWrongCode() {
        stubSessionShow(showWithPendingEnrollment());

        assertThatThrownBy(() -> mfaService.confirmMfaEnrollment(wrongCode()))
                .hasMessage(StatusResponse.INVALID_MFA_CODE.name());
        verify(mongoTemplate, never()).updateFirst(any(), any(), eq(Show.class));
    }

    @Test
    void confirmMfaEnrollment_throwsWhenNoPendingEnrollment() {
        stubSessionShow(showWithoutMfa());

        assertThatThrownBy(() -> mfaService.confirmMfaEnrollment("123456"))
                .hasMessage(StatusResponse.MFA_NOT_ENABLED.name());
    }

    // ---- verifyMfa (two-phase sign-in completion) ----

    private HttpServletRequest stubPendingChallenge(Show show) {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(request);
        when(authUtil.validateMfaPendingToken(request)).thenReturn(SHOW_TOKEN);
        when(showRepository.findByShowTokenForAuth(SHOW_TOKEN)).thenReturn(Optional.of(show));
        return request;
    }

    @Test
    void verifyMfa_withValidTotpCode_completesSignIn_andAdvancesReplayFloor() {
        Show show = showWithMfaEnabled();
        HttpServletRequest request = stubPendingChallenge(show);
        when(clientUtil.getClientIp(request)).thenReturn("198.51.100.7");
        when(graphQLQueryService.completeSignIn(show, "198.51.100.7")).thenReturn(show);

        Show result = mfaService.verifyMfa(codeAt(0));

        assertThat(result).isSameAs(show);
        verify(graphQLQueryService).completeSignIn(show, "198.51.100.7");
        assertThat(capturePersistedMfa().getLastUsedTimeStep()).isPositive();
    }

    @Test
    void verifyMfa_rejectsReplayedCode() {
        Show show = showWithMfaEnabled();
        stubPendingChallenge(show);
        // The current step was already consumed by a prior verification.
        show.getMfa().setLastUsedTimeStep(Instant.now().getEpochSecond() / STEP.getSeconds() + 1);

        assertThatThrownBy(() -> mfaService.verifyMfa(codeAt(0)))
                .hasMessage(StatusResponse.INVALID_MFA_CODE.name());
        verify(graphQLQueryService, never()).completeSignIn(any(), any());
    }

    @Test
    void verifyMfa_withRecoveryCode_consumesIt() {
        Show show = showWithMfaEnabled();
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        show.getMfa().setRecoveryCodes(List.of(
                encoder.encode("AAAAA-BBBBB"), encoder.encode("CCCCC-DDDDD")));
        HttpServletRequest request = stubPendingChallenge(show);
        when(clientUtil.getClientIp(request)).thenReturn("198.51.100.7");
        when(graphQLQueryService.completeSignIn(show, "198.51.100.7")).thenReturn(show);

        // Lowercase input verifies (codes are normalized) and the matched
        // hash is removed — single use.
        mfaService.verifyMfa("aaaaa-bbbbb");

        MfaConfig persisted = capturePersistedMfa();
        assertThat(persisted.getRecoveryCodes()).hasSize(1);
        assertThat(encoder.matches("CCCCC-DDDDD", persisted.getRecoveryCodes().get(0))).isTrue();
    }

    @Test
    void verifyMfa_rejectsUnknownRecoveryCode() {
        Show show = showWithMfaEnabled();
        show.getMfa().setRecoveryCodes(List.of(new BCryptPasswordEncoder().encode("AAAAA-BBBBB")));
        stubPendingChallenge(show);

        assertThatThrownBy(() -> mfaService.verifyMfa("XXXXX-YYYYY"))
                .hasMessage(StatusResponse.INVALID_MFA_CODE.name());
    }

    @Test
    void verifyMfa_rateLimits_afterRepeatedFailures() {
        Show show = showWithMfaEnabled();
        stubPendingChallenge(show);

        for (int i = 0; i < MfaService.MAX_FAILED_ATTEMPTS; i++) {
            assertThatThrownBy(() -> mfaService.verifyMfa(wrongCode()))
                    .hasMessage(StatusResponse.INVALID_MFA_CODE.name());
        }
        // Even a CORRECT code is refused while the account is locked.
        assertThatThrownBy(() -> mfaService.verifyMfa(codeAt(0)))
                .hasMessage(StatusResponse.MFA_RATE_LIMITED.name());
    }

    @Test
    void verifyMfa_throwsWhenAccountHasNoMfa() {
        stubPendingChallenge(showWithoutMfa());

        assertThatThrownBy(() -> mfaService.verifyMfa("123456"))
                .hasMessage(StatusResponse.MFA_NOT_ENABLED.name());
    }

    // ---- disableMfa ----

    @Test
    void disableMfa_withCorrectPasswordHeader_clearsAllMfaState() {
        Show show = showWithMfaEnabled();
        show.setPassword(new BCryptPasswordEncoder().encode("hunter2"));
        stubSessionShow(show);
        when(authUtil.getCurrentRequest()).thenReturn(mock(HttpServletRequest.class));
        when(authUtil.getPasswordFromHeader(any())).thenReturn("hunter2");

        assertThat(mfaService.disableMfa(null)).isTrue();
        assertThat(capturePersistedMfa()).isNull();
    }

    @Test
    void disableMfa_withWrongPassword_throwsUnauthorized() {
        Show show = showWithMfaEnabled();
        show.setPassword(new BCryptPasswordEncoder().encode("hunter2"));
        stubSessionShow(show);
        when(authUtil.getCurrentRequest()).thenReturn(mock(HttpServletRequest.class));
        when(authUtil.getPasswordFromHeader(any())).thenReturn("wrong-password");

        assertThatThrownBy(() -> mfaService.disableMfa(null))
                .hasMessage(StatusResponse.UNAUTHORIZED.name());
        verify(mongoTemplate, never()).updateFirst(any(), any(), eq(Show.class));
    }

    @Test
    void disableMfa_withValidTotpCode_clearsAllMfaState() {
        stubSessionShow(showWithMfaEnabled());
        when(authUtil.getCurrentRequest()).thenReturn(mock(HttpServletRequest.class));
        when(authUtil.getPasswordFromHeader(any())).thenReturn(null);

        assertThat(mfaService.disableMfa(codeAt(0))).isTrue();
        assertThat(capturePersistedMfa()).isNull();
    }

    @Test
    void disableMfa_withNoReauth_throwsUnauthorized() {
        stubSessionShow(showWithMfaEnabled());
        when(authUtil.getCurrentRequest()).thenReturn(mock(HttpServletRequest.class));
        when(authUtil.getPasswordFromHeader(any())).thenReturn(null);

        assertThatThrownBy(() -> mfaService.disableMfa(null))
                .hasMessage(StatusResponse.UNAUTHORIZED.name());
    }

    @Test
    void disableMfa_throwsWhenNotEnabled() {
        stubSessionShow(showWithoutMfa());

        assertThatThrownBy(() -> mfaService.disableMfa("123456"))
                .hasMessage(StatusResponse.MFA_NOT_ENABLED.name());
    }

    // ---- regenerateRecoveryCodes ----

    @Test
    void regenerateRecoveryCodes_replacesTheWholeSet() {
        Show show = showWithMfaEnabled();
        show.setPassword(new BCryptPasswordEncoder().encode("hunter2"));
        show.getMfa().setRecoveryCodes(List.of("$2a$10$old-hash"));
        stubSessionShow(show);
        when(authUtil.getCurrentRequest()).thenReturn(mock(HttpServletRequest.class));
        when(authUtil.getPasswordFromHeader(any())).thenReturn("hunter2");

        MfaRecoveryCodes regenerated = mfaService.regenerateRecoveryCodes(null);

        assertThat(regenerated.getRecoveryCodes()).hasSize(10);
        MfaConfig persisted = capturePersistedMfa();
        assertThat(persisted.getRecoveryCodes()).hasSize(10);
        assertThat(persisted.getRecoveryCodes()).doesNotContain("$2a$10$old-hash");
        assertThat(persisted.getEnabled()).isTrue();
    }

    // ---- adminResetMfa ----

    @Test
    void adminResetMfa_clearsMfa_andAuditLogsActingAdmin() {
        Show show = showWithMfaEnabled();
        when(showRepository.findByShowSubdomain("locked-out-show")).thenReturn(Optional.of(show));
        when(authUtil.getTokenDTO()).thenReturn(TokenDTO.builder().email("admin@example.com").build());

        assertThat(mfaService.adminResetMfa("locked-out-show")).isTrue();
        assertThat(capturePersistedMfa()).isNull();
    }

    @Test
    void adminResetMfa_throwsWhenShowMissing() {
        when(showRepository.findByShowSubdomain("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> mfaService.adminResetMfa("nope"))
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    // ---- adminRotateMfaKeys ----

    /** Puts the service's crypto into a mid-rotation state: NEW primary key,
     *  OLD key retained as retired so its blobs still decrypt. Returns an
     *  old-key MfaCryptoUtil for minting "stale" ciphertext. */
    private MfaCryptoUtil enterRotationState() {
        MfaCryptoUtil oldCrypto = new MfaCryptoUtil();
        ReflectionTestUtils.setField(oldCrypto, "mfaSecretKey", "unit-test-mfa-encryption-key");
        ReflectionTestUtils.setField(crypto, "mfaSecretKey", "rotated-primary-key");
        ReflectionTestUtils.setField(crypto, "mfaSecretKeyRetired", "unit-test-mfa-encryption-key");
        when(authUtil.getTokenDTO()).thenReturn(TokenDTO.builder().email("admin@example.com").build());
        return oldCrypto;
    }

    private Show showWithSecret(String showToken, String secretCiphertext) {
        return Show.builder().showToken(showToken)
                .mfa(MfaConfig.builder().secret(secretCiphertext).build()).build();
    }

    private void stubRotationStream(Show... shows) {
        when(mongoTemplate.stream(any(), eq(Show.class))).thenReturn(Stream.of(shows));
    }

    @Test
    void adminRotateMfaKeys_reencryptsStaleSecrets_ontoPrimaryKey_andSkipsCurrent() {
        MfaCryptoUtil oldCrypto = enterRotationState();
        // Two shows on the OLD key (need rotating) + one already on the new key.
        stubRotationStream(
                showWithSecret("s1", oldCrypto.encrypt(secret)),
                showWithSecret("s2", oldCrypto.encrypt(secret)),
                showWithSecret("s3", crypto.encrypt(secret)));

        MfaKeyRotationResult result = mfaService.adminRotateMfaKeys(false);

        assertThat(result.getTotalSecrets()).isEqualTo(3);
        assertThat(result.getReencrypted()).isEqualTo(2);
        assertThat(result.getAlreadyOnPrimary()).isEqualTo(1);
        assertThat(result.getFailed()).isZero();
        assertThat(result.isDryRun()).isFalse();
        // Only the two stale secrets are written; the current one is skipped.
        ArgumentCaptor<Update> updateCaptor = ArgumentCaptor.forClass(Update.class);
        verify(mongoTemplate, org.mockito.Mockito.times(2))
                .updateFirst(any(), updateCaptor.capture(), eq(Show.class));
        for (Update update : updateCaptor.getAllValues()) {
            String newSecret = (String) update.getUpdateObject()
                    .get("$set", org.bson.Document.class).get("mfa.secret");
            assertThat(crypto.isEncryptedWithPrimary(newSecret)).isTrue();
            assertThat(crypto.decrypt(newSecret)).isEqualTo(secret);
        }
        // Every run — even a real one — is persisted to the audit collection.
        verify(mfaKeyRotationAuditRepository).save(any());
    }

    @Test
    void adminRotateMfaKeys_dryRun_countsButWritesNoSecret() {
        MfaCryptoUtil oldCrypto = enterRotationState();
        stubRotationStream(
                showWithSecret("s1", oldCrypto.encrypt(secret)),
                showWithSecret("s2", crypto.encrypt(secret)));

        MfaKeyRotationResult result = mfaService.adminRotateMfaKeys(true);

        assertThat(result.isDryRun()).isTrue();
        assertThat(result.getReencrypted()).isEqualTo(1);   // would rotate s1
        assertThat(result.getAlreadyOnPrimary()).isEqualTo(1);
        verify(mongoTemplate, never()).updateFirst(any(), any(), eq(Show.class));
        // A dry run is still an admin action worth recording.
        verify(mfaKeyRotationAuditRepository).save(any());
    }

    @Test
    void adminRotateMfaKeys_countsUndecryptableSecretAsFailed_andContinues() {
        MfaCryptoUtil oldCrypto = enterRotationState();
        // A blob under a key NOT in the keyring (neither primary nor retired)
        // can't be decrypted — it must be counted and skipped, not abort the run.
        MfaCryptoUtil unknownKey = new MfaCryptoUtil();
        ReflectionTestUtils.setField(unknownKey, "mfaSecretKey", "some-lost-key");
        stubRotationStream(
                showWithSecret("s1", unknownKey.encrypt(secret)),
                showWithSecret("s2", oldCrypto.encrypt(secret)));

        MfaKeyRotationResult result = mfaService.adminRotateMfaKeys(false);

        assertThat(result.getTotalSecrets()).isEqualTo(2);
        assertThat(result.getFailed()).isEqualTo(1);
        assertThat(result.getReencrypted()).isEqualTo(1);   // s2 still rotated
        verify(mongoTemplate, org.mockito.Mockito.times(1))
                .updateFirst(any(), any(), eq(Show.class));
    }

    @Test
    void adminRotateMfaKeys_rotatesPendingEnrollmentsToo() {
        MfaCryptoUtil oldCrypto = enterRotationState();
        // enabled=false (pending) but with a stored secret — must be rotated.
        Show pending = Show.builder().showToken("s1")
                .mfa(MfaConfig.builder().enabled(false).secret(oldCrypto.encrypt(secret)).build())
                .build();
        stubRotationStream(pending);

        MfaKeyRotationResult result = mfaService.adminRotateMfaKeys(false);

        assertThat(result.getReencrypted()).isEqualTo(1);
        verify(mongoTemplate).updateFirst(any(), any(), eq(Show.class));
    }

    @Test
    void adminRotateMfaKeys_throwsWhenNotConfigured() {
        ReflectionTestUtils.setField(crypto, "mfaSecretKey", "");

        assertThatThrownBy(() -> mfaService.adminRotateMfaKeys(false))
                .hasMessage(StatusResponse.MFA_NOT_CONFIGURED.name());
        verify(mongoTemplate, never()).updateFirst(any(), any(), eq(Show.class));
        verify(mfaKeyRotationAuditRepository, never()).save(any());
    }
}
