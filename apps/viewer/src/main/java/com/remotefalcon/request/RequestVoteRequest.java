package com.remotefalcon.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Builder
@Data
@AllArgsConstructor
@NoArgsConstructor
public class RequestVoteRequest {
  private Float viewerLatitude;
  private Float viewerLongitude;
  private String sequence;
  private String showSubdomain;
  // Optional anonymous browser-local UUID (PRD A3). Older viewer-page
  // bundles call without it; that's fine, the backend stores null and
  // falls back to IP-based identity.
  private String viewerId;
}