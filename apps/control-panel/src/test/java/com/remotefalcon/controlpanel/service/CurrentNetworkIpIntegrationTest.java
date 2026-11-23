package com.remotefalcon.controlpanel.service;

import com.remotefalcon.testfixtures.JwtFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * #211 {@code currentNetworkIp}: read through the same client header as
 * {@code lastLoginIp} (X-Forwarded-For in the test profile, CF-Connecting-IP
 * in prod), behind {@code @RequiresAccess}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
class CurrentNetworkIpIntegrationTest {

    private static final String QUERY_BODY =
            "{\"query\":\"{ currentNetworkIp { ip family suggestedRule } }\"}";

    @Container
    static MongoDBContainer mongo = new MongoDBContainer("mongo:7");

    @DynamicPropertySource
    static void mongoProps(DynamicPropertyRegistry reg) {
        reg.add("spring.data.mongodb.uri", mongo::getReplicaSetUrl);
    }

    @Autowired
    private MockMvc mockMvc;

    private static String userToken() {
        return JwtFactory.issueControlPanel("user-show-token", "user@example.com", "user-show", "USER");
    }

    @Test
    void returnsTheCallersIpv4AsTheRule() throws Exception {
        mockMvc.perform(post("/graphql")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + userToken())
                        .header("X-Forwarded-For", "203.0.113.50")
                        .content(QUERY_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors").doesNotExist())
                .andExpect(jsonPath("$.data.currentNetworkIp.ip").value("203.0.113.50"))
                .andExpect(jsonPath("$.data.currentNetworkIp.family").value("IPV4"))
                .andExpect(jsonPath("$.data.currentNetworkIp.suggestedRule").value("203.0.113.50"));
    }

    @Test
    void returnsTheSlash64ForAnIpv6Caller() throws Exception {
        mockMvc.perform(post("/graphql")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + userToken())
                        .header("X-Forwarded-For", "2001:db8:1:2:aaaa:bbbb:cccc:dddd")
                        .content(QUERY_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.currentNetworkIp.family").value("IPV6"))
                .andExpect(jsonPath("$.data.currentNetworkIp.suggestedRule").value("2001:db8:1:2::/64"));
    }

    @Test
    void rejectsAnUnauthenticatedCaller() throws Exception {
        mockMvc.perform(post("/graphql")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Forwarded-For", "203.0.113.50")
                        .content(QUERY_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors[0].message").value("INVALID_JWT"))
                .andExpect(jsonPath("$.data.currentNetworkIp").doesNotExist());
    }
}
