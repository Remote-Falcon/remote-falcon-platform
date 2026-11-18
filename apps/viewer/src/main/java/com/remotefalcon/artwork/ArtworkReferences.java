package com.remotefalcon.artwork;

import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.models.Vote;
import com.remotefalcon.library.quarkus.entity.Show;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * S2 (Season Prep R2): replaces inline {@code data:image/...} artwork in the
 * viewer's getShow response with a short URL to {@link ArtworkController}.
 *
 * <p>{@code imageUrl} keeps its meaning, "something usable as an img src", so
 * viewer templates and the UI keep working; only the bytes move out of the 5s
 * poll. The URL carries a content hash, so it changes exactly when the art
 * does and the endpoint can serve it as immutable.
 *
 * <p>The URL base is {@code remotefalcon.viewer.public-url} when set (SaaS sets
 * it, because viewer pages on show subdomains call the viewer on the apex host),
 * otherwise the root path, which resolves on any host whose reverse proxy
 * routes {@code /remote-falcon-viewer} (dev stack and self-host nginx both
 * do). The UI also resolves the root-relative form against VITE_VIEWER_API.
 */
@ApplicationScoped
public class ArtworkReferences {

  public static final String PATH = "/artwork";

  private final ArtworkHashes hashes;
  private final String base;

  @Inject
  public ArtworkReferences(ArtworkHashes hashes,
      @ConfigProperty(name = "remotefalcon.viewer.public-url") Optional<String> publicUrl,
      @ConfigProperty(name = "quarkus.http.root-path", defaultValue = "/") String rootPath) {
    this.hashes = hashes;
    String chosen = publicUrl.map(String::trim).filter(s -> !s.isEmpty()).orElse(rootPath);
    this.base = chosen.endsWith("/") ? chosen.substring(0, chosen.length() - 1) : chosen;
  }

  /** The reference URL for an inline image, or {@code imageUrl} unchanged. */
  public String reference(String showSubdomain, String imageUrl) {
    if (showSubdomain == null || showSubdomain.isEmpty()) {
      return imageUrl;
    }
    Optional<String> hash = hashes.hashOf(showSubdomain, imageUrl);
    if (hash.isEmpty()) {
      return imageUrl;
    }
    // hashOf only returns a hash for a decodable inline image, so the media
    // type is read straight off the prefix without decoding again.
    return base + PATH + "/" + URLEncoder.encode(showSubdomain, StandardCharsets.UTF_8).replace("+", "%20")
        + "/" + hash.get() + "." + InlineArtwork.extensionFor(InlineArtwork.mediaTypeOf(imageUrl));
  }

  /**
   * Rewrites every artwork field the viewer schema exposes, in place.
   * Idempotent (a reference is not a data URI), so a show object that is
   * cached and rewritten again on a later request is unaffected.
   */
  public void rewrite(Show show) {
    if (show == null) {
      return;
    }
    String sub = show.getShowSubdomain();
    if (sub == null || sub.isEmpty()) {
      return;
    }
    for (Sequence sequence : artworkSequences(show)) {
      if (InlineArtwork.isCandidate(sequence.getImageUrl())) {
        sequence.setImageUrl(reference(sub, sequence.getImageUrl()));
      }
    }
  }

  /**
   * Every non-null sequence whose artwork getShow exposes: the gallery, playing
   * now/next, and the sequences inside requests and votes. Shared by the
   * rewrite and by {@link ArtworkController}'s lookup so the two cannot drift.
   */
  static List<Sequence> artworkSequences(Show show) {
    List<Sequence> all = new ArrayList<>();
    if (show.getSequences() != null) {
      all.addAll(show.getSequences());
    }
    all.add(show.getPlayingNowSequence());
    all.add(show.getPlayingNextSequence());
    if (show.getRequests() != null) {
      for (Request r : show.getRequests()) {
        if (r != null) all.add(r.getSequence());
      }
    }
    if (show.getVotes() != null) {
      for (Vote v : show.getVotes()) {
        if (v != null) all.add(v.getSequence());
      }
    }
    all.removeIf(Objects::isNull);
    return all;
  }

  /** The hash in an artwork URL's last segment, dropping the cosmetic extension. */
  static String hashFromFileName(String fileName) {
    int dot = fileName.indexOf('.');
    return dot < 0 ? fileName : fileName.substring(0, dot);
  }
}
