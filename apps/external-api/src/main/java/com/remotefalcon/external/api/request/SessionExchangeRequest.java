package com.remotefalcon.external.api.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request body for {@code POST /v1/sessions/exchange}. RFPB's {@code
 * /launch} handler POSTs this with the launch JWT extracted from the
 * query param.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionExchangeRequest {
    private String launchToken;
}
