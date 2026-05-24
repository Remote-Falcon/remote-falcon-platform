package com.remotefalcon.external.api.response;

import com.remotefalcon.library.models.ViewerPage;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Wire shape for a viewer page returned from {@code /v1/pages*}
 * endpoints. Mirrors the {@link ViewerPage} POJO 1:1 with the addition
 * of an explicit {@code etag} field so clients don't have to recompute
 * it from {@code html + updatedAt} (the hash is already in the response
 * {@code ETag} HTTP header too, but inlining it here lets list-page
 * clients use it without inspecting headers per element).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PageResponse {
    private String pageId;
    private String name;
    private Boolean active;
    private String html;
    private Instant updatedAt;
    private String etag;
}
