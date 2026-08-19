package com.remotefalcon.util;

import io.vertx.core.http.HttpServerRequest;
import io.vertx.ext.web.RoutingContext;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * PRD-019 — user agents below are real, taken from the 2026-08-10 rejection
 * sample. Misclassifying ordinary mobile Chrome would be the damaging failure:
 * it rejected 0 of 45 attempts in the same window, so folding it in would bury
 * the in-app signal this split exists to surface.
 */
class ClientTypeUtilTest {

  private static final String FB_ANDROID =
      "Mozilla/5.0 (Linux; Android 14; SM-S901U) AppleWebKit/537.36 (KHTML, like Gecko) "
          + "Chrome/151.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/500.0.0.0;]";
  private static final String FB_IOS =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/500.0;]";
  private static final String INSTAGRAM =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.0";
  private static final String CHROME_ANDROID =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) "
          + "Chrome/151.0.0.0 Mobile Safari/537.36";
  private static final String IOS_SAFARI =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1";

  @Test
  @DisplayName("Detects the Facebook Android in-app webview")
  void detectsFacebookAndroid() {
    assertTrue(ClientTypeUtil.isInAppBrowser(FB_ANDROID));
  }

  @Test
  @DisplayName("Detects the Facebook iOS in-app webview")
  void detectsFacebookIos() {
    assertTrue(ClientTypeUtil.isInAppBrowser(FB_IOS));
  }

  @Test
  @DisplayName("Detects the Instagram in-app webview")
  void detectsInstagram() {
    assertTrue(ClientTypeUtil.isInAppBrowser(INSTAGRAM));
  }

  @Test
  @DisplayName("Does not misclassify ordinary Chrome on Android — it is the webview, not the OS")
  void doesNotMisclassifyChromeAndroid() {
    assertFalse(ClientTypeUtil.isInAppBrowser(CHROME_ANDROID));
  }

  @Test
  @DisplayName("Does not misclassify Safari on iOS")
  void doesNotMisclassifyIosSafari() {
    assertFalse(ClientTypeUtil.isInAppBrowser(IOS_SAFARI));
  }

  @Test
  @DisplayName("Treats a missing or empty User-Agent as an ordinary browser")
  void handlesMissingUserAgent() {
    assertFalse(ClientTypeUtil.isInAppBrowser((String) null));
    assertFalse(ClientTypeUtil.isInAppBrowser(""));
  }

  @Test
  @DisplayName("Reads the User-Agent off the routing context")
  void readsUserAgentFromContext() {
    RoutingContext ctx = mock(RoutingContext.class);
    HttpServerRequest req = mock(HttpServerRequest.class);
    when(ctx.request()).thenReturn(req);
    when(req.getHeader("User-Agent")).thenReturn(FB_ANDROID);

    assertTrue(ClientTypeUtil.isInAppBrowser(ctx));
    assertEquals(FB_ANDROID, ClientTypeUtil.userAgent(ctx));
  }

  @Test
  @DisplayName("Never throws on a null context or a context with no request")
  void toleratesNullContext() {
    // This runs on the rejection path. An exception here would turn a handled
    // rejection into an unexpected error for the viewer.
    assertFalse(ClientTypeUtil.isInAppBrowser((RoutingContext) null));
    assertNull(ClientTypeUtil.userAgent(null));

    RoutingContext ctx = mock(RoutingContext.class);
    when(ctx.request()).thenReturn(null);
    assertFalse(ClientTypeUtil.isInAppBrowser(ctx));
    assertNull(ClientTypeUtil.userAgent(ctx));
  }
}
