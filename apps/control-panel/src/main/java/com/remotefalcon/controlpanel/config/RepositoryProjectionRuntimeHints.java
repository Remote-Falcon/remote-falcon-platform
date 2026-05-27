package com.remotefalcon.controlpanel.config;

import com.remotefalcon.controlpanel.repository.ShowNameOnly;
import org.springframework.aot.hint.MemberCategory;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;
import org.springframework.aot.hint.TypeReference;

/**
 * GraalVM native-image hints for Spring Data MongoDB projection interfaces.
 *
 * <p>Spring Data returns rows projected onto an interface as a JDK
 * dynamic proxy that implements the interface. In JVM mode the proxy
 * is generated on demand via {@code java.lang.reflect.Proxy}. In native
 * image there is no runtime proxy generation — every proxy class must
 * be registered at AOT build time via {@link RuntimeHints#proxies()}
 * so {@code native-image} can emit the proxy class up front. Likewise,
 * Spring Data's {@code PropertyDescriptorSource} reflects on the
 * projection interface at runtime to map its getters back to document
 * fields; that path needs a reflection hint or the introspection logs
 * "Couldn't read class metadata for interface … . Input property
 * calculation might fail" and the query returns an empty list.
 *
 * <p>The single projection interface in this service is
 * {@link ShowNameOnly}, used by
 * {@code ShowRepository.findTop25ByShowNameContainingIgnoreCase} and
 * surfaced via the admin show-name autosuggest. Without this contributor
 * the autosuggest silently returns empty in prod (validated against
 * PostHog logs on 2026-05-26 — the "Couldn't read class metadata"
 * INFO line was emitting ~30 times/hour against a live native pod).
 *
 * <p>Pattern adapted from Spring Data MongoDB issue #4220 + the Spring
 * AOT documentation for repository projections. The proxy registration
 * MUST include the four Spring Data marker interfaces below — these
 * are what {@code Proxy.newProxyInstance} actually composes the
 * projection proxy from at runtime.
 *
 * <p>If a second projection interface is added to any repository in
 * this service, register it here too. Grep for {@code interface .* \{$}
 * inside {@code repository/} to find them.
 */
public class RepositoryProjectionRuntimeHints implements RuntimeHintsRegistrar {

    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
        // Reflection on the projection interface itself — lets
        // PropertyDescriptorSource introspect getters back to fields.
        hints.reflection().registerType(
                ShowNameOnly.class,
                MemberCategory.INVOKE_DECLARED_METHODS,
                MemberCategory.INVOKE_PUBLIC_METHODS,
                MemberCategory.DECLARED_FIELDS
        );

        // JDK proxy registration — composes the runtime proxy class
        // that implements ShowNameOnly + the four Spring Data marker
        // interfaces used by SpotShallProxy / TargetAware / Advised.
        hints.proxies().registerJdkProxy(
                TypeReference.of(ShowNameOnly.class),
                TypeReference.of("org.springframework.data.projection.TargetAware"),
                TypeReference.of("org.springframework.aop.SpringProxy"),
                TypeReference.of("org.springframework.core.DecoratingProxy")
        );
    }
}
