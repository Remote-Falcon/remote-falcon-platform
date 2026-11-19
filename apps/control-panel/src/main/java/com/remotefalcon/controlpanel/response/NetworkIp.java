package com.remotefalcon.controlpanel.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Payload for the {@code currentNetworkIp} query (#211): the caller's public
 * IP as Remote Falcon sees it, and the IP-list rule that covers their network.
 * {@code suggestedRule} is null when the address can't be read.
 */
@Builder
@Data
@AllArgsConstructor
@NoArgsConstructor
public class NetworkIp {
    private String ip;
    /** IPV4 or IPV6; null when the address can't be read. */
    private String family;
    private String suggestedRule;
}
