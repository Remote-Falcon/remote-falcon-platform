package com.remotefalcon.plugins.api.repository;

import com.mongodb.client.FindIterable;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Projections;
import com.remotefalcon.library.quarkus.entity.Show;
import io.quarkus.mongodb.panache.PanacheMongoRepository;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Optional;

@ApplicationScoped
public class ShowRepository implements PanacheMongoRepository<Show> {
  public Optional<Show> findByShowToken(String showToken) {
    // Exclude unnecessary fields to reduce network overhead
    // The plugin API only needs stats.votingWin, not stats.page, stats.voting, or stats.jukebox
    FindIterable<Show> result = mongoCollection()
        .find(Filters.eq("showToken", showToken))
        .projection(Projections.fields(
            Projections.exclude("pages"),
            Projections.exclude("stats.page"),
            Projections.exclude("stats.voting"),
            Projections.exclude("stats.jukebox")
        ));

    Show show = result.first();
    return Optional.ofNullable(show);
  }

  /**
   * Pages metadata only (name + active flag) for the viewer-page FPP command
   * (PRD-016). findByShowToken() deliberately excludes `pages` so the
   * high-frequency listener polls never haul viewer-page HTML; this targeted
   * lookup includes the pages array but still leaves the HTML behind.
   */
  public Optional<Show> findPagesMetaByShowToken(String showToken) {
    FindIterable<Show> result = mongoCollection()
        .find(Filters.eq("showToken", showToken))
        .projection(Projections.fields(
            Projections.include("showToken", "pages.name", "pages.active")
        ));

    return Optional.ofNullable(result.first());
  }
}
