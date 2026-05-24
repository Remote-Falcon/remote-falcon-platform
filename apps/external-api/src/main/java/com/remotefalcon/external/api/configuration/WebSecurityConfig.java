package com.remotefalcon.external.api.configuration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS configuration. Two distinct policies:
 *
 * <ul>
 *   <li><strong>Legacy endpoints</strong> ({@code /showDetails},
 *       {@code /addSequenceToQueue}, {@code /voteForSequence}): wide-open
 *       CORS. These are API-key authenticated and called server-to-server
 *       from FPP plugins / partner integrations, so browser-origin checks
 *       provide no real defense.
 *   <li><strong>RFPB v1 endpoints</strong> ({@code /v1/**}): tight
 *       allowlist of {@code rfpagebuilder.com} + configurable extra
 *       origins for dev. Bearer-token auth + tighter CORS = layered
 *       defense against browser-mediated attacks.
 * </ul>
 *
 * <p>More-specific mappings take precedence in Spring's CORS registry,
 * so the {@code /v1/**} mapping overrides {@code /**} for that prefix.
 */
@Configuration
public class WebSecurityConfig {

  @Value("${rfpb.cors.allowed-origins:https://rfpagebuilder.com}")
  private String[] rfpbAllowedOrigins;

  @Bean
  public WebMvcConfigurer corsConfigurer() {
    return new WebMvcConfigurer() {
      @Override
      public void addCorsMappings(CorsRegistry registry) {
        // Legacy: wide-open, preserved verbatim from pre-RFPB behavior.
        registry.addMapping("/**").allowedMethods("*");

        // RFPB integration: tight allowlist. allowCredentials=true is
        // important — RFPB will eventually move its session bearer to
        // an httpOnly cookie scoped to its domain, and that requires
        // credentialed CORS. ETag exposed so the browser can read it
        // from cross-origin responses for use in subsequent If-Match.
        registry.addMapping("/v1/**")
            .allowedOrigins(rfpbAllowedOrigins)
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .allowedHeaders("*")
            .exposedHeaders("ETag")
            .allowCredentials(true)
            .maxAge(3600);
      }
    };
  }
}