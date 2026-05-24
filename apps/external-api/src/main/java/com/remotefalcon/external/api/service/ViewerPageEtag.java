package com.remotefalcon.external.api.service;

import com.remotefalcon.library.models.ViewerPage;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;

/**
 * SHA-256 ETag computation for {@link ViewerPage}. Duplicated from
 * control-panel's {@code ViewerPageService.computeEtag} so both ends of
 * the RFPB integration compute identical hashes — the launch JWT carries
 * an etag claim minted by control-panel, RFPB sends it back in {@code
 * If-Match}, and external-api compares against its own computation here.
 *
 * <p>Single source of truth would live in libs/schema, but the v1
 * convention is "two copies and trust tests to catch drift" (per PR-B
 * scope). If a third consumer appears, consolidate to a shared utility.
 *
 * <p>Format: lowercase hex, 64 chars. Caller wraps with HTTP ETag quoting.
 * Null {@code html} → empty; null {@code updatedAt} → {@link Instant#EPOCH}
 * (matches the lazy-backfill defaults from PR-A).
 */
public final class ViewerPageEtag {

    private ViewerPageEtag() {
    }

    public static String compute(ViewerPage page) {
        if (page == null) {
            throw new IllegalArgumentException("page must not be null");
        }
        String html = page.getHtml() == null ? "" : page.getHtml();
        Instant updatedAt = page.getUpdatedAt() == null ? Instant.EPOCH : page.getUpdatedAt();
        String input = html + "|" + updatedAt;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
