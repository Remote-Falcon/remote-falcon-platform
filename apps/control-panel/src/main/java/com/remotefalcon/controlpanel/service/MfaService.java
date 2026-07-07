package com.remotefalcon.controlpanel.service;

import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.response.MfaEnrollment;
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
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

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
    // throttling. Per-account in-memory sliding window (same pattern as
    // DashboardService's wrapped rate limit — deliberately not a
    // @Conditional/cache bean, which native-image builds strip): 5
    // consecutive failures lock the account's MFA verification for the
    // remainder of the 15-minute window.
    protected static final int MAX_FAILED_ATTEMPTS = 5;
    protected static final long FAILURE_WINDOW_MS = 15 * 60 * 1000L;

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

    private final ConcurrentHashMap<String, ConcurrentLinkedDeque<Long>> failedAttempts = new ConcurrentHashMap<>();

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
        Show show = this.getShowForMfa();
        if (this.isMfaEnabled(show)) {
            throw new RuntimeException(StatusResponse.MFA_ALREADY_ENABLED.name());
        }
        MfaConfig mfa = show.getMfa();
        if (mfa == null || StringUtils.isBlank(mfa.getSecret())) {
            throw new RuntimeException(StatusResponse.MFA_NOT_ENABLED.name());
        }
        this.checkRateLimit(show.getShowToken());
        long matchedStep = this.totpUtil.verifyCode(this.mfaCryptoUtil.decrypt(mfa.getSecret()), code, null);
        if (matchedStep == TotpUtil.NO_MATCH) {
            this.recordFailure(show.getShowToken());
            throw new RuntimeException(StatusResponse.INVALID_MFA_CODE.name());
        }
        this.clearFailures(show.getShowToken());
        List<String> plaintextCodes = this.generateRecoveryCodes();
        mfa.setEnabled(true);
        mfa.setEnrolledDate(LocalDateTime.now());
        mfa.setPendingSince(null);
        mfa.setRecoveryCodes(this.hashRecoveryCodes(plaintextCodes));
        mfa.setLastUsedTimeStep(matchedStep);
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
        this.checkRateLimit(showToken);
        Show show = this.showRepository.findByShowTokenForAuth(showToken)
                .orElseThrow(() -> new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name()));
        if (!this.isMfaEnabled(show)) {
            throw new RuntimeException(StatusResponse.MFA_NOT_ENABLED.name());
        }
        MfaConfig mfa = show.getMfa();
        boolean verified = false;
        if (this.totpUtil.isTotpCodeFormat(code)) {
            long matchedStep = this.totpUtil.verifyCode(
                    this.mfaCryptoUtil.decrypt(mfa.getSecret()), code, mfa.getLastUsedTimeStep());
            if (matchedStep != TotpUtil.NO_MATCH) {
                mfa.setLastUsedTimeStep(matchedStep);
                verified = true;
            }
        } else {
            // FR-8 — recovery codes are single-use; consumeRecoveryCode
            // removes the matched hash from the config.
            verified = this.consumeRecoveryCode(mfa, code);
        }
        if (!verified) {
            this.recordFailure(showToken);
            throw new RuntimeException(StatusResponse.INVALID_MFA_CODE.name());
        }
        this.clearFailures(showToken);
        // Persist the consumed recovery code / advanced replay floor BEFORE
        // minting the session so a crash can't leave a reusable code behind.
        this.persistMfa(showToken, mfa);
        return this.graphQLQueryService.completeSignIn(show, this.clientUtil.getClientIp(request));
    }

    public Boolean disableMfa(String code) {
        Show show = this.getShowForMfa();
        if (!this.isMfaEnabled(show)) {
            throw new RuntimeException(StatusResponse.MFA_NOT_ENABLED.name());
        }
        this.reauthenticate(show, code);
        // FR-10 — disabling clears ALL MFA state (secret + recovery codes).
        this.persistMfa(show.getShowToken(), null);
        this.clearFailures(show.getShowToken());
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
        this.clearFailures(show.getShowToken());
        log.warn("ADMIN MFA RESET: admin {} cleared MFA for show {} (lockout recovery)",
                this.authUtil.getTokenDTO().getEmail(), showSubdomain);
        return true;
    }

    // SR-6 — disable/regenerate require fresh re-auth: the current password
    // (base64 Password header, mirroring updatePassword) OR a current TOTP
    // code. A stolen still-valid session alone is not enough.
    private void reauthenticate(Show show, String code) {
        String password = this.authUtil.getPasswordFromHeader(this.authUtil.getCurrentRequest());
        if (StringUtils.isNotBlank(password)) {
            if (!new BCryptPasswordEncoder().matches(password, show.getPassword())) {
                throw new RuntimeException(StatusResponse.UNAUTHORIZED.name());
            }
            return;
        }
        if (this.totpUtil.isTotpCodeFormat(code)) {
            this.checkRateLimit(show.getShowToken());
            long matchedStep = this.totpUtil.verifyCode(
                    this.mfaCryptoUtil.decrypt(show.getMfa().getSecret()), code, show.getMfa().getLastUsedTimeStep());
            if (matchedStep == TotpUtil.NO_MATCH) {
                this.recordFailure(show.getShowToken());
                throw new RuntimeException(StatusResponse.INVALID_MFA_CODE.name());
            }
            this.clearFailures(show.getShowToken());
            show.getMfa().setLastUsedTimeStep(matchedStep);
            return;
        }
        throw new RuntimeException(StatusResponse.UNAUTHORIZED.name());
    }

    private boolean consumeRecoveryCode(MfaConfig mfa, String submitted) {
        if (CollectionUtils.isEmpty(mfa.getRecoveryCodes()) || StringUtils.isBlank(submitted)) {
            return false;
        }
        String normalized = submitted.trim().toUpperCase();
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        for (String hash : mfa.getRecoveryCodes()) {
            if (encoder.matches(normalized, hash)) {
                List<String> remaining = new ArrayList<>(mfa.getRecoveryCodes());
                remaining.remove(hash);
                mfa.setRecoveryCodes(remaining);
                return true;
            }
        }
        return false;
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
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        return plaintextCodes.stream().map(encoder::encode).toList();
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

    private void checkRateLimit(String showToken) {
        ConcurrentLinkedDeque<Long> failures = this.failedAttempts.get(showToken);
        if (failures == null) {
            return;
        }
        long cutoff = System.currentTimeMillis() - FAILURE_WINDOW_MS;
        failures.removeIf(timestamp -> timestamp < cutoff);
        if (failures.size() >= MAX_FAILED_ATTEMPTS) {
            throw new RuntimeException(StatusResponse.MFA_RATE_LIMITED.name());
        }
    }

    private void recordFailure(String showToken) {
        this.failedAttempts
                .computeIfAbsent(showToken, key -> new ConcurrentLinkedDeque<>())
                .add(System.currentTimeMillis());
    }

    private void clearFailures(String showToken) {
        this.failedAttempts.remove(showToken);
    }
}
