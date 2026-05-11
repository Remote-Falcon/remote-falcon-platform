package com.remotefalcon.library.models;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.eclipse.microprofile.graphql.Type;

import java.time.LocalDateTime;

// PRD V18 — version-change log. Appended by plugins-api when a
// pluginVersion request reports a version different from what's
// currently stored on the show. Captures the new values + a timestamp.
//
// Persisted on Show.versionChanges[]. Trimmed to the last 365 days on
// each successful version write to keep the embedded list bounded.
@Type
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VersionChange {
    private LocalDateTime at;
    private String pluginVersion;
    private String fppVersion;
}
