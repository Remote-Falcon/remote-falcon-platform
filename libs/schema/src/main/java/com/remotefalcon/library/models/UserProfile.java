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
public class UserProfile {
    private String firstName;
    private String lastName;
    private String facebookUrl;
    private String youtubeUrl;
    private Integer totalTokens;
    private LocalDateTime lastTokenResetDate;
}
