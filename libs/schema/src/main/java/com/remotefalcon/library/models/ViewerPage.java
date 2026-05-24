package com.remotefalcon.library.models;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.eclipse.microprofile.graphql.Type;

import java.time.Instant;
import java.util.UUID;

@Type
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ViewerPage {
    private String name;
    private Boolean active;
    private String html;

    // Added 2026-05-24 for RF Page Builder integration (PRD External
    // Viewer Page API, Phase 1 PR-A). Both fields are nullable so
    // existing show data round-trips without migration; control-panel
    // lazy-backfills on read via ViewerPageService.normalizeAndBackfill.
    //
    // pageId is the stable identifier across renames — name is display-
    // only once these are populated. ETag for the external write API is
    // sha256(html || updatedAt).
    private UUID pageId;
    private Instant updatedAt;
}
