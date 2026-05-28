package com.remotefalcon.external.api.configuration;

import com.remotefalcon.auth.LaunchTokenPayload;
import com.remotefalcon.external.api.document.RfpbLaunchJti;
import com.remotefalcon.external.api.document.RfpbSession;
import com.remotefalcon.external.api.request.PageWriteRequest;
import com.remotefalcon.external.api.request.SessionExchangeRequest;
import com.remotefalcon.external.api.response.PageResponse;
import com.remotefalcon.external.api.response.SessionResponse;
import com.remotefalcon.library.models.ViewerPage;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.local.LocalBucket;
import org.jsoup.nodes.Document;
import org.jsoup.parser.HtmlTreeBuilder;
import org.jsoup.parser.Parser;
import org.springframework.aot.hint.MemberCategory;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;

// GraalVM native-image reflection hints for the RF Page Builder
// integration (PRD External Viewer Page API, PR-D). Spring Boot's AOT
// pass discovers most Jackson DTO surface automatically; what's listed
// here is the residual that AOT misses:
//
//   • libs/auth POJOs — Jackson serializes them from JWT claims that
//     flow through java-jwt, not Spring MVC, so AOT can't see them
//     reachable from a controller signature.
//   • jsoup internals — Cleaner reflectively instantiates parser
//     handlers (HtmlTreeBuilder etc.); without explicit hints the
//     native image fails at first sanitize() call with NPEs in jsoup's
//     internals rather than a clean missing-class error.
//   • Bucket4j local bucket — the filter wires Bucket.builder() which
//     resolves to LocalBucket at runtime; AOT picks up the interfaces
//     but the LocalBucket class itself needs declared-methods so the
//     deserializer can reach getRemainingTokens/getNanosToWaitForRefill.
//   • New RFPB DTOs/documents — request/response bodies on the new
//     controllers and Mongo @Document classes. Spring's AOT for
//     @RestController and @Document mostly handles these but the
//     belt-and-braces registration matches DozerRuntimeHints's
//     existing convention for the rest of the wire surface.
public class RfpbRuntimeHints implements RuntimeHintsRegistrar {
    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
        // libs/auth — JWT payload + (de)serialization on the verify side
        register(hints, LaunchTokenPayload.class);

        // RFPB wire DTOs
        register(hints, PageWriteRequest.class);
        register(hints, PageResponse.class);
        register(hints, SessionExchangeRequest.class);
        register(hints, SessionResponse.class);

        // RFPB Mongo documents
        register(hints, RfpbSession.class);
        register(hints, RfpbLaunchJti.class);

        // Schema POJO that flows through the page API
        register(hints, ViewerPage.class);

        // jsoup parse chain — Parser instantiates HtmlTreeBuilder
        // reflectively; Document gets reflected on .toString output
        // settings. Safelist/Cleaner used to be needed here when the
        // sanitizer was allowlist-based; the denylist rewrite (commit
        // 3b30423) operates directly on the parsed Document so neither
        // is reachable at runtime anymore.
        register(hints, Parser.class);
        register(hints, HtmlTreeBuilder.class);
        register(hints, Document.class);
        register(hints, Document.OutputSettings.class);

        // Bucket4j — filter resolves Bucket.builder() to LocalBucket
        register(hints, Bandwidth.class);
        register(hints, Bucket.class);
        register(hints, ConsumptionProbe.class);
        register(hints, LocalBucket.class);
    }

    private static void register(RuntimeHints hints, Class<?> type) {
        hints.reflection().registerType(type,
                MemberCategory.INVOKE_DECLARED_CONSTRUCTORS,
                MemberCategory.INVOKE_DECLARED_METHODS,
                MemberCategory.INVOKE_PUBLIC_METHODS,
                MemberCategory.DECLARED_FIELDS);
    }
}
