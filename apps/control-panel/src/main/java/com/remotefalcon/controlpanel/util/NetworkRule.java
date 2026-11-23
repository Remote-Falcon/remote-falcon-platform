package com.remotefalcon.controlpanel.util;

import com.remotefalcon.controlpanel.response.NetworkIp;
import com.remotefalcon.library.util.IpMatcher;

/**
 * Builds the IP-list rule for "Exclude this network" (#211).
 *
 * <p>IPv4: the address itself, since a home network shares one public IPv4.
 * IPv6: the /64. Every device on the network gets its own address inside that
 * prefix and privacy extensions rotate it, so a single IPv6 address would stop
 * matching within a day, and wouldn't cover the owner's phone at all.
 */
public final class NetworkRule {

    private NetworkRule() {
    }

    public static NetworkIp forClientIp(String clientIp) {
        // CF-Connecting-IP is a single address, but X-Forwarded-For (the
        // fallback configuration) is a chain whose first entry is the client.
        String ip = clientIp == null ? "" : clientIp.split(",")[0].trim();
        byte[] bytes = IpMatcher.parse(ip);
        if (bytes == null) {
            return NetworkIp.builder().ip(ip.isEmpty() ? null : ip).build();
        }
        if (bytes.length == 4) {
            // Also how an IPv4-mapped IPv6 address comes back from parse().
            String v4 = ipv4(bytes);
            return NetworkIp.builder().ip(ip).family("IPV4").suggestedRule(v4).build();
        }
        return NetworkIp.builder().ip(ip).family("IPV6").suggestedRule(slash64(bytes)).build();
    }

    private static String ipv4(byte[] bytes) {
        return (bytes[0] & 0xff) + "." + (bytes[1] & 0xff) + "." + (bytes[2] & 0xff) + "." + (bytes[3] & 0xff);
    }

    /**
     * The /64 prefix in RFC 5952 form: lowercase, no leading zeros, and the
     * longest zero run written as "::". The host half is four zero groups, so
     * the longest run is always the trailing one (plus any zero groups just
     * before it): print the prefix groups up to the last non-zero one, then "::".
     */
    private static String slash64(byte[] bytes) {
        int[] words = new int[4];
        int lastNonZero = -1;
        for (int i = 0; i < 4; i++) {
            words[i] = ((bytes[2 * i] & 0xff) << 8) | (bytes[2 * i + 1] & 0xff);
            if (words[i] != 0) {
                lastNonZero = i;
            }
        }
        StringBuilder out = new StringBuilder();
        for (int i = 0; i <= lastNonZero; i++) {
            if (i > 0) {
                out.append(':');
            }
            out.append(Integer.toHexString(words[i]));
        }
        return out.append("::/64").toString();
    }
}
