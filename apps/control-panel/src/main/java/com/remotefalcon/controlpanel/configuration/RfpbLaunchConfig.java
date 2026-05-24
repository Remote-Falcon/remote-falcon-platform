package com.remotefalcon.controlpanel.config;

import com.remotefalcon.auth.LaunchTokenSigner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Spring bean wiring for the RF Page Builder launch-token integration
 * (PRD External Viewer Page API, Phase 1 PR-B).
 *
 * <p>Holds the {@link LaunchTokenSigner} initialized from the shared
 * {@code RF_RFPB_LAUNCH_SECRET} env var. Singleton — one signer instance
 * per application context, thread-safe per the signer's contract.
 *
 * <p>The shared secret is configured at {@code rfpb.launch.secret} (see
 * {@code application.yml}). Dev/test fall back to a placeholder; prod
 * overrides via the cluster Secret. Rotation requires coordinated env
 * update on both control-panel and external-api.
 */
@Configuration
public class RfpbLaunchConfig {

    @Bean
    public LaunchTokenSigner launchTokenSigner(@Value("${rfpb.launch.secret}") String secret) {
        return new LaunchTokenSigner(secret);
    }
}
