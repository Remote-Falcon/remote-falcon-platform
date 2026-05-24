package com.remotefalcon.controlpanel.config;

import com.remotefalcon.auth.LaunchTokenPayload;
import org.jsoup.nodes.Document;
import org.jsoup.parser.HtmlTreeBuilder;
import org.jsoup.parser.Parser;
import org.jsoup.safety.Cleaner;
import org.jsoup.safety.Safelist;
import org.springframework.aot.hint.MemberCategory;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;

// GraalVM native-image reflection hints for control-panel's slice of the
// RF Page Builder integration (PRD External Viewer Page API, PR-D).
// External-api has its own sister hints file; the two intentionally
// overlap on jsoup because both services sanitize viewer-page HTML and
// the cost of double-registering is zero.
//
//   • libs/auth's LaunchTokenPayload — flows into LaunchTokenSigner on
//     mint; the signer uses Jackson via java-jwt, which AOT doesn't
//     trace into.
//   • jsoup internals — Cleaner reflectively instantiates parser
//     handlers; native image without these hints fails on the first
//     sanitize() call with NPEs inside jsoup rather than a clean
//     missing-class error.
//
// Reflection hints for ViewerPage are already covered upstream by
// libs/schema consumers; not duplicated here.
public class RfpbRuntimeHints implements RuntimeHintsRegistrar {
    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
        register(hints, LaunchTokenPayload.class);

        register(hints, Safelist.class);
        register(hints, Cleaner.class);
        register(hints, Parser.class);
        register(hints, HtmlTreeBuilder.class);
        register(hints, Document.class);
        register(hints, Document.OutputSettings.class);
    }

    private static void register(RuntimeHints hints, Class<?> type) {
        hints.reflection().registerType(type,
                MemberCategory.INVOKE_DECLARED_CONSTRUCTORS,
                MemberCategory.INVOKE_DECLARED_METHODS,
                MemberCategory.INVOKE_PUBLIC_METHODS,
                MemberCategory.DECLARED_FIELDS);
    }
}
