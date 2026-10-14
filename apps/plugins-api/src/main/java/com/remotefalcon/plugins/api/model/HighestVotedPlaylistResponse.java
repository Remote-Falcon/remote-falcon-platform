package com.remotefalcon.plugins.api.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Builder
@Data
@AllArgsConstructor
@NoArgsConstructor
public class HighestVotedPlaylistResponse {
  private String winningPlaylist;
  private Integer playlistIndex;

  /** "Nothing to play": what the plugin gets when there's nothing queued. */
  public static HighestVotedPlaylistResponse empty() {
    return HighestVotedPlaylistResponse.builder()
        .winningPlaylist(null)
        .playlistIndex(-1)
        .build();
  }
}
