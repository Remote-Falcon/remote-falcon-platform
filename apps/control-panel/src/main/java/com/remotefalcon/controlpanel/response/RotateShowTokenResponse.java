package com.remotefalcon.controlpanel.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Payload for the {@code rotateShowToken} mutation. Carries the freshly
 * minted showToken (so the UI can display it for the FPP re-paste) plus a
 * re-issued service JWT signed with the new token — the caller's existing
 * JWT embeds the OLD showToken as its identity claim and is dead the
 * moment the rotation persists, so the UI must hot-swap to this one.
 */
@Builder
@Data
@AllArgsConstructor
@NoArgsConstructor
public class RotateShowTokenResponse {
    private String showToken;
    private String serviceToken;
}
