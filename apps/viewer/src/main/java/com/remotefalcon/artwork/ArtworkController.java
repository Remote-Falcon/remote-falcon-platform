package com.remotefalcon.artwork;

import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.repository.ShowRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;

import java.util.Optional;
import java.util.regex.Pattern;

/**
 * S2 (Season Prep R2): serves inline data-URI artwork as real image bytes.
 *
 * <p>{@code GET /remote-falcon-viewer/artwork/{showSubdomain}/{hash}[.ext]}.
 * The hash is the content hash {@link ArtworkReferences} put in the URL, so the
 * bytes behind a URL never change: the response is {@code immutable} for a
 * year and a conditional request is answered without touching Mongo. A hash
 * that no longer matches any of the show's artwork (the art was replaced) is a
 * non-cacheable 404.
 *
 * <p>The bytes are operator-supplied and served from the apex origin, so the
 * response is locked down: {@code nosniff}, and a sandboxing CSP so an SVG
 * opened directly cannot run script in that origin.
 */
@ApplicationScoped
@Path(ArtworkReferences.PATH)
public class ArtworkController {

  static final String CACHE_IMMUTABLE = "public, max-age=31536000, immutable";
  static final String CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";

  private static final Pattern HASH = Pattern.compile("[0-9a-f]{32}");

  @Inject
  ShowRepository showRepository;

  @Inject
  ArtworkHashes hashes;

  @GET
  @Path("/{showSubdomain}/{file}")
  public Response artwork(@PathParam("showSubdomain") String showSubdomain,
      @PathParam("file") String file,
      @HeaderParam(HttpHeaders.IF_NONE_MATCH) String ifNoneMatch) {
    String hash = ArtworkReferences.hashFromFileName(file);
    if (!HASH.matcher(hash).matches()) {
      return notFound();
    }
    String etag = "\"" + hash + "\"";
    if (ifNoneMatch != null && (ifNoneMatch.contains(etag) || ifNoneMatch.trim().equals("*"))) {
      return Response.notModified()
          .header(HttpHeaders.ETAG, etag)
          .header(HttpHeaders.CACHE_CONTROL, CACHE_IMMUTABLE)
          .build();
    }
    Optional<Show> show = showRepository.findArtworkByShowSubdomain(showSubdomain);
    if (show.isEmpty()) {
      return notFound();
    }
    // hashOf is empty for anything that is not a decodable inline image.
    for (Sequence sequence : ArtworkReferences.artworkSequences(show.get())) {
      String imageUrl = sequence.getImageUrl();
      if (hashes.hashOf(showSubdomain, imageUrl).filter(hash::equals).isPresent()) {
        InlineArtwork art = InlineArtwork.parse(imageUrl);
        if (art == null) {
          break;
        }
        return Response.ok(art.bytes(), art.mediaType())
            .header(HttpHeaders.CACHE_CONTROL, CACHE_IMMUTABLE)
            .header(HttpHeaders.ETAG, etag)
            .header("X-Content-Type-Options", "nosniff")
            .header("Content-Security-Policy", CSP)
            .build();
      }
    }
    return notFound();
  }

  private static Response notFound() {
    return Response.status(Response.Status.NOT_FOUND)
        .header(HttpHeaders.CACHE_CONTROL, "no-store")
        .build();
  }
}
