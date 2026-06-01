package com.remotefalcon.library.models;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.eclipse.microprofile.graphql.Type;

import java.time.LocalDateTime;

@Type
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PsaSequence {
    private String name;
    private Integer order;
    private LocalDateTime lastPlayed;
    // PSA-v2 Q1 — soft-disable a PSA without removing it from the list.
    // Default true to preserve existing behavior on first deploy.
    private Boolean enabled;
}
