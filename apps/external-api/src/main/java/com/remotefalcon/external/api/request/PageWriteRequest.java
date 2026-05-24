package com.remotefalcon.external.api.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request body for {@code POST /v1/pages} and {@code PUT /v1/pages/:id}.
 * The {@code pageId} field on {@link com.remotefalcon.library.models.ViewerPage}
 * is path-derived for PUT and server-minted for POST — callers don't
 * send it in the body, which is why this DTO exists rather than reusing
 * {@code ViewerPage} directly.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PageWriteRequest {
    private String name;
    private Boolean active;
    private String html;
}
