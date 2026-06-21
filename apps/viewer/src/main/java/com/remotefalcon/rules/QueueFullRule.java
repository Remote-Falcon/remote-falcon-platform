package com.remotefalcon.rules;

import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.util.PluginQueueHelper;

/**
 * Denies a request when the count of viewer-initiated requests has reached
 * {@code jukeboxDepth}. PSAs and leader sequences are excluded from the count
 * (PSA-v2 Q3 #49) via {@link PluginQueueHelper#countViewerRequests}. A depth of
 * {@code null}/{@code 0} means "no cap".
 */
public final class QueueFullRule implements Rule {
  @Override
  public Decision evaluate(EvaluationContext ctx) {
    Integer jukeboxDepth = ctx.show().getPreferences().getJukeboxDepth();
    if (jukeboxDepth == null || jukeboxDepth == 0) {
      return Decision.skip();
    }
    return PluginQueueHelper.countViewerRequests(ctx.show()) >= jukeboxDepth
        ? Decision.deny(StatusResponse.QUEUE_FULL.name())
        : Decision.allow();
  }
}
