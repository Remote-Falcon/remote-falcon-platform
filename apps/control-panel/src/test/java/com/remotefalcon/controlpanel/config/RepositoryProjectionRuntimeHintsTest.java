package com.remotefalcon.controlpanel.config;

import com.remotefalcon.controlpanel.repository.ShowNameOnly;
import org.junit.jupiter.api.Test;
import org.springframework.aot.hint.JdkProxyHint;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.TypeReference;
import org.springframework.aot.hint.predicate.RuntimeHintsPredicates;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the GraalVM native-image hints required for the
 * {@link ShowNameOnly} Spring Data projection interface used by the
 * admin show-name autosuggest.
 *
 * <p>Without these hints the native image silently returns empty
 * results from {@code findTop25ByShowNameContainingIgnoreCase}
 * (validated 2026-05-26 via PostHog Logs showing "Couldn't read class
 * metadata for interface … ShowNameOnly. Input property calculation
 * might fail" on every admin search query).
 *
 * <p>If a future contributor refactors the hints away by accident,
 * this test fails at PR time — well before the native image ships
 * and the autosuggest silently breaks again in prod.
 */
class RepositoryProjectionRuntimeHintsTest {

    private final RuntimeHints hints = new RuntimeHints();
    private final RepositoryProjectionRuntimeHints registrar =
            new RepositoryProjectionRuntimeHints();

    @Test
    void registersReflectionForShowNameOnly() {
        registrar.registerHints(hints, getClass().getClassLoader());

        // Confirms the reflection-introspection hint that fixes the
        // PropertyDescriptorSource "Couldn't read class metadata" log line.
        assertThat(RuntimeHintsPredicates.reflection().onType(ShowNameOnly.class).test(hints))
                .as("ShowNameOnly must be registered for reflection so "
                        + "Spring Data's PropertyDescriptorSource can read its "
                        + "class metadata at runtime")
                .isTrue();
    }

    @Test
    void registersJdkProxyForShowNameOnlyAndSpringDataMarkers() {
        registrar.registerHints(hints, getClass().getClassLoader());

        // Find the proxy hint that contains ShowNameOnly. The proxy
        // composes ShowNameOnly + the three Spring Data marker
        // interfaces; native-image needs ALL of them or proxy class
        // generation fails at AOT time.
        List<JdkProxyHint> proxyHints = hints.proxies().jdkProxyHints().toList();
        JdkProxyHint showNameOnlyProxy = proxyHints.stream()
                .filter(p -> p.getProxiedInterfaces().contains(TypeReference.of(ShowNameOnly.class)))
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "No JDK proxy hint registered for ShowNameOnly. Found proxies: "
                                + proxyHints));

        List<TypeReference> interfaces = showNameOnlyProxy.getProxiedInterfaces();
        assertThat(interfaces).contains(
                TypeReference.of(ShowNameOnly.class),
                TypeReference.of("org.springframework.data.projection.TargetAware"),
                TypeReference.of("org.springframework.aop.SpringProxy"),
                TypeReference.of("org.springframework.core.DecoratingProxy"));
    }
}
