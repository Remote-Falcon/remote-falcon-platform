package com.remotefalcon.library.models;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.eclipse.microprofile.graphql.Type;

@Type
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Sequence {
    private String name;
    private String displayName;
    private Integer duration;
    private Boolean visible;
    private Integer index;
    private Integer order;
    private String imageUrl;
    private Boolean active;
    private Integer visibilityCount;
    private String type;
    private String group;
    private String category;
    private String artist;
    // #163 per-night play cap (PRD-009, ADR-3): times this song has played the
    // current show-night. A hard nightly counter distinct from visibilityCount
    // (which is a rolling cooldown). Incremented on play in plugins-api
    // updateWhatsPlaying; reset lazily at the first play of a new night.
    private Integer playsToday;
}
