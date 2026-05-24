package com.remotefalcon.external.api.configuration;

import com.remotefalcon.auth.LaunchTokenVerifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Spring bean wiring for the RF Page Builder launch-token integration on
 * the consume side (PRD External Viewer Page API, PR-B M3).
 *
 * <p>Holds the {@link LaunchTokenVerifier} initialized from the shared
 * {@code RF_RFPB_LAUNCH_SECRET} — must match control-panel's bean to
 * verify the JWTs minted there.
 *
 * <p>Singleton, thread-safe per the verifier's contract.
 */
@Configuration
public class RfpbVerifierConfig {

    @Bean
    public LaunchTokenVerifier launchTokenVerifier(@Value("${rfpb.launch.secret}") String secret) {
        return new LaunchTokenVerifier(secret);
    }
}
