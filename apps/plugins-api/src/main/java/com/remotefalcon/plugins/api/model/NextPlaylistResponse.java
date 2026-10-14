package com.remotefalcon.plugins.api.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Builder
@Data
@AllArgsConstructor
@NoArgsConstructor
public class NextPlaylistResponse {
  private String nextPlaylist;
  private Integer playlistIndex;

  /** "Nothing to play": what the plugin gets when there's nothing queued. */
  public static NextPlaylistResponse empty() {
    return NextPlaylistResponse.builder()
        .nextPlaylist(null)
        .playlistIndex(-1)
        .build();
  }
}
