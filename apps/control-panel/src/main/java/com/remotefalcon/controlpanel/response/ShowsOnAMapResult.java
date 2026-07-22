package com.remotefalcon.controlpanel.response;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Envelope for the map queries. totalShows is the raw platform-wide show
 * count (community-size context for the map headers); shows is the pin
 * list — public opt-ins only for the unauthenticated query, the
 * members+public union for showsOnAMapForUsers.
 */
@Builder
@Data
@AllArgsConstructor
@NoArgsConstructor
public class ShowsOnAMapResult {
    private Long totalShows;
    private List<ShowsOnAMap> shows;
}
