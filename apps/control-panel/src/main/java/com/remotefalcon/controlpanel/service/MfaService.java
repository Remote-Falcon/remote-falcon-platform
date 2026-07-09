package com.remotefalcon.controlpanel.service;

import com.remotefalcon.controlpanel.document.MfaKeyRotationAudit;
import com.remotefalcon.controlpanel.repository.MfaKeyRotationAuditRepository;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.response.MfaEnrollment;
import com.remotefalcon.controlpanel.response.MfaKeyRotationResult;
import com.remotefalcon.controlpanel.response.MfaRecoveryCodes;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.Base32Util;
import com.remotefalcon.controlpanel.util.ClientUtil;
import com.remotefalcon.controlpanel.util.MfaCryptoUtil;
import com.remotefalcon.controlpanel.util.TotpUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.MfaMethod;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.models.MfaConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.stream.Stream;

/**
 * Opt-in TOTP second factor (PRD 2FA-TOTP). Every MFA write is an atomic
 * updateFirst on the single `mfa` field — shows loaded here come through
 * PROJECTED repository queries and must never be save()d (full-document
 * replace would wipe the excluded arrays; see ShowRepository).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MfaService {
    // 2FA PRD SR-3 / OQ-3 — a 6-digit code is brute-forceable without
    // throttling. The failed-attempt counter is PERSISTED on the account's
    // MfaConfig (not an in-JVM map), so the "5 failures / 15 min" cap holds
    // across control-panel replicas and survives pod restarts — an in-memory
    // counter would enforce only 5×replicas and reset on every deploy.
    protected static final int MAX_FAILED_ATTEMPTS = 5;
    protected static final Duration FAILURE_WINDOW = Duration.ofMinutes(15);

    // 2FA PRD OQ-2 — 10 codes, 10 chars grouped 5-5. Alphabet drops the
    // ambiguous characters (0/O, 1/I/L) since users read these off paper.
    private static final int RECOVERY_CODE_COUNT = 10;
    private static final String RECOVERY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final AuthUtil authUtil;
    private final ClientUtil clientUtil;
    private final ShowRepository showRepository;
    private final MongoTemplate mongoTemplate;
    private final TotpUtil totpUtil;
    private final MfaCryptoUtil mfaCryptoUtil;
    private final GraphQLQueryService graphQLQueryService;
    private final MfaKeyRotationAuditRepository mfaKeyRotationAuditRepository;

    public MfaEnrollment startMfaEnrollment() {
        if (!mfaCryptoUtil.isConfigured()) {
            throw new RuntimeException(StatusResponse.MFA_NOT_CONFIGURED.name());
        }
        Show show = this.getShowForMfa();
        if (this.isMfaEnabled(show)) {
            throw new RuntimeException(StatusResponse.MFA_ALREADY_ENABLED.name());
        }
        byte[] secret = this.totpUtil.generateSecret();
        String base32Secret = Base32Util.encode(secret);
        // FR-5 — a fresh start replaces any prior unconfirmed enrollment.
        MfaConfig pending = MfaConfig.builder()
                .enabled(false)
                .method(MfaMethod.TOTP)
                .secret(this.mfaCryptoUtil.encrypt(secret))
                .pendingSince(LocalDateTime.now())
                .build();
        this.persistMfa(show.getShowToken(), pending);
        return MfaEnrollment.builder()
                .otpauthUri(this.totpUtil.buildOtpauthUri(show.getEmail(), base32Secret))
                .secret(base32Secret)
                .build();
    }

    public MfaRecoveryCodes confirmMfaEnrollment(String code) {
        if (!this.mfaCryptoUtil.isConfigured()) {
            throw new RuntimeException(StatusResponse.MFA_NOT_CONFIGURED.name());
        }
        Show show = this.getShowForMfa();
        if (this.isMfaEnabled(show)) {
            throw new RuntimeException(StatusResponse.MFA_ALREADY_ENABLED.name());
        }
        MfaConfig mfa = show.getMfa();
        if (mfa == null || StringUtils.isBlank(mfa.getSecret())) {
            throw new RuntimeException(StatusResponse.MFA_NOT_ENABLED.name());
        }
        this.checkRateLimit(mfa);
        long matchedStep = this.totpUtil.verifyCode(this.mfaCryptoUtil.decrypt(mfa.getSecret()), code, null);
        if (matchedStep == TotpUtil.NO_MATCH) {
            this.recordFailure(show.getShowToken(), mfa);
            throw new RuntimeException(StatusResponse.INVALID_MFA_CODE.name());
        }
        List<String> plaintextCodes = this.generateRecoveryCodes();
        mfa.setEnabled(true);
        mfa.setEnrolledDate(LocalDateTime.now());
        mfa.setPendingSince(null);
        mfa.setRecoveryCodes(this.hashRecoveryCodes(plaintextCodes));
        mfa.setLastUsedTimeStep(matchedStep);
        // The full write below replaces mfa wholesale, so null the failure
        // counters here to clear them on success.
        this.resetFailureCounters(mfa);
        this.persistMfa(show.getShowToken(), mfa);
        log.info("MFA enrollment confirmed for show {}", show.getShowSubdomain());
        return MfaRecoveryCodes.builder().recoveryCodes(plaintextCodes).build();
    }

    /**
     * Completes a two-phase sign-in (FR-7). Bearer header carries the
     * MFA-pending challenge token minted by signIn; on success the normal
     * post-login bookkeeping runs and the full 30-day service token is
     * returned on the Show, exactly like a non-MFA signIn.
     */
    public Show verifyMfa(String code) {
        var request = this.authUtil.getCurrentRequest();
        String showToken = this.authUtil.validateMfaPendingToken(request);
        Show show = this.showRepository.findByShowTokenForAuth(showToken)
                .orElseThrow(() -> new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name()));
        if (!this.isMfaEnabled(show)) {
            throw new RuntimeException(StatusResponse.MFA_NOT_ENABLED.name());
        }
        MfaConfig mfa = show.getMfa();
        this.checkRateLimit(mfa);
        // The atomic single-field write below also clears the failure
        // counters on success, so a consumed recovery code / advanced replay
        // floor is persisted BEFORE the session is minted — a crash can't
        // leave a reusable code behind, and concurrent distinct-credential
        // submissions can't lose-update each other (a full mfa replace from a
        // stale projection could reinstate a used code or lower the floor).
        Update credentialUpdate;
        if (this.totpUtil.isTotpCodeFormat(code)) {
            if (!this.mfaCryptoUtil.isConfigured()) {
                throw new RuntimeException(StatusResponse.MFA_NOT_CONFIGURED.name());
            }
            long matchedStep = this.totpUtil.verifyCode(
                    this.mfaCryptoUtil.decrypt(mfa.getSecret()), code, mfa.getLastUsedTimeStep());
            if (matchedStep == TotpUtil.NO_MATCH) {
                this.recordFailure(showToken, mfa);
                throw new RuntimeException(StatusResponse.INVALID_MFA_CODE.name());
            }
            // $max: never lower the replay floor even under a concurrent write.
            credentialUpdate = new Update().max("mfa.lastUsedTimeStep", matchedStep);
        } else {
            // FR-8 — recovery codes are single-use. $pull removes exactly the
            // matched (unique bcrypt) hash atomically.
            String matchedHash = this.consumeRecoveryCode(mfa, code);
            if (matchedHash == null) {
                this.recordFailure(showToken, mfa);
                throw new RuntimeException(StatusResponse.INVALID_MFA_CODE.name());
            }
            credentialUpdate = new Update().pull("mfa.recoveryCodes", matchedHash);
        }
        this.clearFailures(credentialUpdate);
        this.mongoTemplate.updateFirst(
                Query.query(Criteria.where("showToken").is(showToken)), credentialUpdate, Show.class);
        return this.graphQLQueryService.completeSignIn(show, this.clientUtil.getClientIp(request));
    }

    public Boolean disableMfa(String code) {
        Show show = this.getShowForMfa();
        if (!this.isMfaEnabled(show)) {
            throw new RuntimeException(StatusResponse.MFA_NOT_ENABLED.name());
        }
        this.reauthenticate(show, code);
        // FR-10 — disabling clears ALL MFA state (secret + recovery codes +
        // failure counters).
        this.persistMfa(show.getShowToken(), null);
        log.info("MFA disabled for show {}", show.getShowSubdomain());
        return true;
    }

    public MfaRecoveryCodes regenerateRecoveryCodes(String code) {
        Show show = this.getShowForMfa();
        if (!this.isMfaEnabled(show)) {
            throw new RuntimeException(StatusResponse.MFA_NOT_ENABLED.name());
        }
        this.reauthenticate(show, code);
        // FR-11 — regeneration invalidates the previous set wholesale.
        List<String> plaintextCodes = this.generateRecoveryCodes();
        show.getMfa().setRecoveryCodes(this.hashRecoveryCodes(plaintextCodes));
        this.persistMfa(show.getShowToken(), show.getMfa());
        log.info("MFA recovery codes regenerated for show {}", show.getShowSubdomain());
        return MfaRecoveryCodes.builder().recoveryCodes(plaintextCodes).build();
    }

    /**
     * FR-13 — admin lockout recovery (lost device + lost recovery codes),
     * gated by @RequiresAdminAccess at the resolver. Audit-logged with the
     * acting admin's identity.
     */
    public Boolean adminResetMfa(String showSubdomain) {
        Show show = this.showRepository.findByShowSubdomain(showSubdomain)
                .orElseThrow(() -> new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name()));
        this.persistMfa(show.getShowToken(), null);
        log.warn("ADMIN MFA RESET: admin {} cleared MFA for show {} (lockout recovery)",
                this.authUtil.getTokenDTO().getEmail(), showSubdomain);
        return true;
    }

    /**
     * Key rotation (2FA-TOTP). Re-encrypts every stored TOTP secret that is
     * NOT already under the current primary key onto that key, so rotating
     * MFA_SECRET_KEY doesn't orphan enrolled accounts. Covers BOTH confirmed
     * enrollments and still-pending ones (any show with a stored mfa.secret).
     * Gated by @RequiresAdminAccess at the resolver; every run — including a
     * dry run — is persisted to the {@code mfaKeyRotationAudit} collection.
     *
     * <p>Idempotent and resumable: secrets already on the primary key are
     * skipped, so re-running (or resuming after a crash) only touches what's
     * left. The collection is STREAMED, not loaded into a list, so a large
     * enrolled population can't blow the pod's heap (same pattern as the
     * stats-retention sweep). Each write is an atomic single-field
     * updateFirst, and MfaCryptoUtil's decrypt keyring must still hold the old
     * key (via MFA_SECRET_KEY_RETIRED) for the old ciphertext to be readable.
     *
     * <p>A secret that no held key can decrypt does NOT abort the run: it is
     * counted as {@code failed}, logged with its showToken, and left untouched
     * so a later run (with the right retired key configured) can still rescue
     * it.
     *
     * @param dryRun when true, report what WOULD be re-encrypted without
     *               writing any secret.
     */
    public MfaKeyRotationResult adminRotateMfaKeys(boolean dryRun) {
        if (!this.mfaCryptoUtil.isConfigured()) {
            throw new RuntimeException(StatusResponse.MFA_NOT_CONFIGURED.name());
        }
        Query query = Query.query(Criteria.where("mfa.secret").exists(true).ne(null));
        query.fields().include("showToken").include("mfa.secret");
        int total = 0;
        int reencrypted = 0;
        int alreadyOnPrimary = 0;
        int failed = 0;
        try (Stream<Show> shows = this.mongoTemplate.stream(query, Show.class)) {
            Iterator<Show> it = shows.iterator();
            while (it.hasNext()) {
                Show show = it.next();
                String stored = show.getMfa() == null ? null : show.getMfa().getSecret();
                if (StringUtils.isBlank(stored)) {
                    continue;
                }
                total++;
                if (this.mfaCryptoUtil.isEncryptedWithPrimary(stored)) {
                    alreadyOnPrimary++;
                    continue;
                }
                try {
                    String rekeyed = this.mfaCryptoUtil.encrypt(this.mfaCryptoUtil.decrypt(stored));
                    if (!dryRun) {
                        this.mongoTemplate.updateFirst(
                                Query.query(Criteria.where("showToken").is(show.getShowToken())),
                                new Update().set("mfa.secret", rekeyed),
                                Show.class);
                    }
                    reencrypted++;
                } catch (Exception e) {
                    failed++;
                    log.error("MFA key rotation: no configured key could decrypt the secret for show {} — "
                            + "left untouched (is the old key set as MFA_SECRET_KEY_RETIRED?): {}",
                            show.getShowToken(), e.getMessage());
                }
            }
        }
        MfaKeyRotationResult result = MfaKeyRotationResult.builder()
                .totalSecrets(total)
                .reencrypted(reencrypted)
                .alreadyOnPrimary(alreadyOnPrimary)
                .failed(failed)
                .dryRun(dryRun)
                .build();
        this.recordRotationAudit(result);
        log.warn("ADMIN MFA KEY ROTATION{}: admin {} — total={} reencrypted={} alreadyOnPrimary={} failed={} "
                + "onto primary keyId {}",
                dryRun ? " (DRY RUN)" : "", this.authUtil.getTokenDTO().getEmail(),
                total, reencrypted, alreadyOnPrimary, failed, this.mfaCryptoUtil.primaryKeyId());
        return result;
    }

    private void recordRotationAudit(MfaKeyRotationResult result) {
        this.mfaKeyRotationAuditRepository.save(MfaKeyRotationAudit.builder()
                .rotatedAt(LocalDateTime.now(ZoneOffset.UTC))
                .adminEmail(this.authUtil.getTokenDTO().getEmail())
                .primaryKeyId(this.mfaCryptoUtil.primaryKeyId())
                .totalSecrets(result.getTotalSecrets())
                .reencrypted(result.getReencrypted())
                .alreadyOnPrimary(result.getAlreadyOnPrimary())
                .failed(result.getFailed())
                .dryRun(result.isDryRun())
                .build());
    }

    // SR-6 — disable/regenerate require fresh re-auth: the current password
    // (base64 Password header, mirroring updatePassword) OR a current TOTP
    // code. A stolen still-valid session alone is not enough. BOTH branches
    // are rate-limited: an unthrottled password branch would let a session
    // holder brute-force the password to strip the second factor. The caller
    // persists show.getMfa() (or null), which flushes the in-memory counter
    // reset done here on success.
    private void reauthenticate(Show show, String code) {
        this.checkRateLimit(show.getMfa());
        String password = this.authUtil.getPasswordFromHeader(this.authUtil.getCurrentRequest());
        if (StringUtils.isNotBlank(password)) {
            if (!new BCryptPasswordEncoder().matches(password, show.getPassword())) {
                this.recordFailure(show.getShowToken(), show.getMfa());
                throw new RuntimeException(StatusResponse.UNAUTHORIZED.name());
            }
            this.resetFailureCounters(show.getMfa());
            return;
        }
        if (this.totpUtil.isTotpCodeFormat(code)) {
            if (!this.mfaCryptoUtil.isConfigured()) {
                throw new RuntimeException(StatusResponse.MFA_NOT_CONFIGURED.name());
            }
            long matchedStep = this.totpUtil.verifyCode(
                    this.mfaCryptoUtil.decrypt(show.getMfa().getSecret()), code, show.getMfa().getLastUsedTimeStep());
            if (matchedStep == TotpUtil.NO_MATCH) {
                this.recordFailure(show.getShowToken(), show.getMfa());
                throw new RuntimeException(StatusResponse.INVALID_MFA_CODE.name());
            }
            show.getMfa().setLastUsedTimeStep(matchedStep);
            this.resetFailureCounters(show.getMfa());
            return;
        }
        throw new RuntimeException(StatusResponse.UNAUTHORIZED.name());
    }

    // Returns the matched (unique bcrypt) hash so the caller can $pull exactly
    // it, or null if no stored code matches. Normalization strips the display
    // hyphen and whitespace and upper-cases, so a code typed as "ABCDE-FGHJK",
    // "ABCDEFGHJK", or "abcde fghjk" all match — a correct code entered
    // without the separator must not be rejected on the lockout path.
    private String consumeRecoveryCode(MfaConfig mfa, String submitted) {
        if (CollectionUtils.isEmpty(mfa.getRecoveryCodes()) || StringUtils.isBlank(submitted)) {
            return null;
        }
        String normalized = normalizeRecoveryCode(submitted);
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        for (String hash : mfa.getRecoveryCodes()) {
            if (encoder.matches(normalized, hash)) {
                return hash;
            }
        }
        return null;
    }

    private static String normalizeRecoveryCode(String code) {
        return code.trim().replaceAll("[\\s-]", "").toUpperCase();
    }

    private List<String> generateRecoveryCodes() {
        List<String> codes = new ArrayList<>(RECOVERY_CODE_COUNT);
        for (int i = 0; i < RECOVERY_CODE_COUNT; i++) {
            StringBuilder code = new StringBuilder(11);
            for (int c = 0; c < 10; c++) {
                if (c == 5) {
                    code.append('-');
                }
                code.append(RECOVERY_CODE_ALPHABET.charAt(SECURE_RANDOM.nextInt(RECOVERY_CODE_ALPHABET.length())));
            }
            codes.add(code.toString());
        }
        return codes;
    }

    private List<String> hashRecoveryCodes(List<String> plaintextCodes) {
        // Hash the NORMALIZED (dash-less, upper-cased) form so verification is
        // separator-insensitive; the display codes keep their hyphen.
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        return plaintextCodes.stream().map(code -> encoder.encode(normalizeRecoveryCode(code))).toList();
    }

    private Show getShowForMfa() {
        return this.showRepository.findByShowTokenForMfa(this.authUtil.getTokenDTO().getShowToken())
                .orElseThrow(() -> new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name()));
    }

    private boolean isMfaEnabled(Show show) {
        return show.getMfa() != null && Boolean.TRUE.equals(show.getMfa().getEnabled());
    }

    private void persistMfa(String showToken, MfaConfig mfa) {
        this.mongoTemplate.updateFirst(
                Query.query(Criteria.where("showToken").is(showToken)),
                new Update().set("mfa", mfa),
                Show.class);
    }

    // SR-3 throttle, read from the persisted counters on the loaded config.
    private void checkRateLimit(MfaConfig mfa) {
        if (mfa == null || mfa.getFailedAttempts() == null || mfa.getFailedWindowStart() == null) {
            return;
        }
        if (mfa.getFailedWindowStart().isBefore(LocalDateTime.now().minus(FAILURE_WINDOW))) {
            return; // window elapsed — the next failure starts a fresh one
        }
        if (mfa.getFailedAttempts() >= MAX_FAILED_ATTEMPTS) {
            throw new RuntimeException(StatusResponse.MFA_RATE_LIMITED.name());
        }
    }

    // Persist a failure across replicas/restarts. Within a live window the
    // count is bumped with an atomic $inc; a fresh or elapsed window is reset
    // to 1. `mfa` is the just-loaded config, read only to decide which case.
    private void recordFailure(String showToken, MfaConfig mfa) {
        LocalDateTime windowStart = mfa == null ? null : mfa.getFailedWindowStart();
        boolean withinWindow = windowStart != null
                && windowStart.isAfter(LocalDateTime.now().minus(FAILURE_WINDOW));
        Update update = withinWindow
                ? new Update().inc("mfa.failedAttempts", 1)
                : new Update().set("mfa.failedAttempts", 1).set("mfa.failedWindowStart", LocalDateTime.now());
        this.mongoTemplate.updateFirst(
                Query.query(Criteria.where("showToken").is(showToken)), update, Show.class);
    }

    // Fold the failure-counter clear into a caller's atomic update.
    private void clearFailures(Update update) {
        update.unset("mfa.failedAttempts").unset("mfa.failedWindowStart");
    }

    // Clear the counters on an in-memory config that the caller will persist
    // wholesale (confirm/regenerate/disable full writes).
    private void resetFailureCounters(MfaConfig mfa) {
        if (mfa != null) {
            mfa.setFailedAttempts(null);
            mfa.setFailedWindowStart(null);
        }
    }
}
