package com.remotefalcon.controlpanel.util;

import com.remotefalcon.controlpanel.response.NetworkIp;
import com.remotefalcon.library.util.IpMatcher;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * #211 "Exclude this network": the rule the button adds for the caller's IP.
 * IPv4 is the address itself. IPv6 is the /64, because each device on a home
 * network has its own address and privacy extensions rotate it, while the
 * /64 stays the same for the whole network.
 */
class NetworkRuleTest {

    @Test
    void ipv4IsTheAddressItself() {
        NetworkIp result = NetworkRule.forClientIp("203.0.113.50");
        assertThat(result.getIp()).isEqualTo("203.0.113.50");
        assertThat(result.getFamily()).isEqualTo("IPV4");
        assertThat(result.getSuggestedRule()).isEqualTo("203.0.113.50");
    }

    @ParameterizedTest
    @CsvSource({
            "2001:db8:1:2:aaaa:bbbb:cccc:dddd, 2001:db8:1:2::/64",
            "2001:0DB8:0001:0002:0000:0000:0000:0001, 2001:db8:1:2::/64",
            "2001:db8::1, 2001:db8::/64",
            "2001:db8:0:5::1, 2001:db8:0:5::/64",
            "2001:0:0:5::1, 2001:0:0:5::/64",
            "fe80::1%eth0, fe80::/64",
            "[2001:db8:1:2::9], 2001:db8:1:2::/64"
    })
    void ipv6IsTheSlash64(String ip, String expectedRule) {
        NetworkIp result = NetworkRule.forClientIp(ip);
        assertThat(result.getFamily()).isEqualTo("IPV6");
        assertThat(result.getSuggestedRule()).isEqualTo(expectedRule);
    }

    @Test
    void theIpv6RuleCoversAnotherDeviceOnTheSameNetwork() {
        String rule = NetworkRule.forClientIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd").getSuggestedRule();
        assertThat(IpMatcher.isValidRule(rule)).isTrue();
        assertThat(IpMatcher.matches(rule, "2001:db8:1:2:1111:2222:3333:4444")).isTrue();
        assertThat(IpMatcher.matches(rule, "2001:db8:1:3::1")).isFalse();
    }

    @Test
    void ipv4MappedIpv6IsTreatedAsIpv4() {
        NetworkIp result = NetworkRule.forClientIp("::ffff:203.0.113.50");
        assertThat(result.getFamily()).isEqualTo("IPV4");
        assertThat(result.getSuggestedRule()).isEqualTo("203.0.113.50");
    }

    @Test
    void takesTheFirstAddressOfAForwardedChain() {
        NetworkIp result = NetworkRule.forClientIp(" 203.0.113.50 , 10.0.0.1");
        assertThat(result.getSuggestedRule()).isEqualTo("203.0.113.50");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"unknown", "999.1.1.1", "not-an-ip"})
    void unusableInputHasNoRule(String ip) {
        assertThat(NetworkRule.forClientIp(ip).getSuggestedRule()).isNull();
    }
}
