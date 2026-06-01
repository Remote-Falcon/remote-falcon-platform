package com.remotefalcon.library.util;

import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.PsaSequence;
import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Sequence;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link PluginQueueHelper}.
 *
 * <p>Exercised against the Spring {@code Show} variant. The Quarkus overloads
 * delegate to the same private field-level implementation, so behavior is
 * provably identical — separate cross-variant coverage is left to the schema
 * contract test in {@code ShowSchemaContractTest}.
 */
class PluginQueueHelperTest {

    // ---------- nonSongNames ----------

    @Test
    void nonSongNames_emptyPsaSequences_noLeaders_returnsEmpty() {
        Show show = Show.builder().psaSequences(new ArrayList<>()).build();
        assertThat(PluginQueueHelper.nonSongNames(show)).isEmpty();
    }

    @Test
    void nonSongNames_nullPsaSequences_nullLeaders_returnsEmpty() {
        Show show = Show.builder().build();
        assertThat(PluginQueueHelper.nonSongNames(show)).isEmpty();
    }

    @Test
    void nonSongNames_nullShow_returnsEmpty() {
        assertThat(PluginQueueHelper.nonSongNames((Show) null)).isEmpty();
    }

    @Test
    void nonSongNames_bothLeadersSet_unionedWithPsas() {
        Show show = Show.builder()
                .psaSequences(List.of(
                        PsaSequence.builder().name("PSA1").build(),
                        PsaSequence.builder().name("PSA2").build()))
                .requestLeaderSequence("Leader-Req")
                .voteLeaderSequence("Leader-Vote")
                .build();
        assertThat(PluginQueueHelper.nonSongNames(show))
                .containsExactlyInAnyOrder("PSA1", "PSA2", "Leader-Req", "Leader-Vote");
    }

    @Test
    void nonSongNames_oneLeaderSetOneNull_excludesNullEntry() {
        Show show = Show.builder()
                .psaSequences(List.of(PsaSequence.builder().name("PSA1").build()))
                .requestLeaderSequence("Leader-Req")
                .voteLeaderSequence(null)
                .build();
        assertThat(PluginQueueHelper.nonSongNames(show))
                .containsExactlyInAnyOrder("PSA1", "Leader-Req");
    }

    @Test
    void nonSongNames_emptyStringLeader_excluded() {
        Show show = Show.builder()
                .psaSequences(List.of(PsaSequence.builder().name("PSA1").build()))
                .requestLeaderSequence("")
                .voteLeaderSequence("Leader-Vote")
                .build();
        assertThat(PluginQueueHelper.nonSongNames(show))
                .containsExactlyInAnyOrder("PSA1", "Leader-Vote");
    }

    @Test
    void nonSongNames_psaWithNullName_excluded() {
        Show show = Show.builder()
                .psaSequences(List.of(
                        PsaSequence.builder().name(null).build(),
                        PsaSequence.builder().name("").build(),
                        PsaSequence.builder().name("PSA1").build()))
                .build();
        assertThat(PluginQueueHelper.nonSongNames(show)).containsExactly("PSA1");
    }

    // ---------- isSongLike ----------

    @Test
    void isSongLike_nameNotInNonSong_returnsTrue() {
        Show show = Show.builder()
                .psaSequences(List.of(PsaSequence.builder().name("PSA1").build()))
                .requestLeaderSequence("Leader-Req")
                .build();
        assertThat(PluginQueueHelper.isSongLike(show, "Song1")).isTrue();
    }

    @Test
    void isSongLike_nameIsPsa_returnsFalse() {
        Show show = Show.builder()
                .psaSequences(List.of(PsaSequence.builder().name("PSA1").build()))
                .build();
        assertThat(PluginQueueHelper.isSongLike(show, "PSA1")).isFalse();
    }

    @Test
    void isSongLike_nameIsLeader_returnsFalse() {
        Show show = Show.builder()
                .requestLeaderSequence("Leader-Req")
                .build();
        assertThat(PluginQueueHelper.isSongLike(show, "Leader-Req")).isFalse();
    }

    @Test
    void isSongLike_nullName_returnsFalse() {
        Show show = Show.builder().build();
        assertThat(PluginQueueHelper.isSongLike(show, null)).isFalse();
    }

    @Test
    void isSongLike_emptyName_returnsFalse() {
        Show show = Show.builder().build();
        assertThat(PluginQueueHelper.isSongLike(show, "")).isFalse();
    }

    @Test
    void isSongLike_emptyShow_anyNonEmptyName_returnsTrue() {
        Show show = Show.builder().build();
        assertThat(PluginQueueHelper.isSongLike(show, "AnySong")).isTrue();
    }

    // ---------- countViewerRequests ----------

    @Test
    void countViewerRequests_emptyRequests_returnsZero() {
        Show show = Show.builder().requests(new ArrayList<>()).build();
        assertThat(PluginQueueHelper.countViewerRequests(show)).isZero();
    }

    @Test
    void countViewerRequests_nullRequests_returnsZero() {
        Show show = Show.builder().build();
        assertThat(PluginQueueHelper.countViewerRequests(show)).isZero();
    }

    @Test
    void countViewerRequests_allUserRequests_returnsAllCount() {
        Show show = Show.builder()
                .psaSequences(List.of(PsaSequence.builder().name("PSA1").build()))
                .requests(List.of(
                        req("Song1"),
                        req("Song2"),
                        req("Song3")))
                .build();
        assertThat(PluginQueueHelper.countViewerRequests(show)).isEqualTo(3);
    }

    @Test
    void countViewerRequests_allPsas_returnsZero() {
        Show show = Show.builder()
                .psaSequences(List.of(
                        PsaSequence.builder().name("PSA1").build(),
                        PsaSequence.builder().name("PSA2").build()))
                .requests(List.of(req("PSA1"), req("PSA2")))
                .build();
        assertThat(PluginQueueHelper.countViewerRequests(show)).isZero();
    }

    @Test
    void countViewerRequests_mixedMostlyPsas_countsOnlyViewerRequests() {
        Show show = Show.builder()
                .psaSequences(List.of(
                        PsaSequence.builder().name("PSA1").build(),
                        PsaSequence.builder().name("PSA2").build()))
                .requests(List.of(req("PSA1"), req("PSA2"), req("Song1")))
                .build();
        assertThat(PluginQueueHelper.countViewerRequests(show)).isEqualTo(1);
    }

    @Test
    void countViewerRequests_mixedMostlyUserRequests_countsOnlyViewerRequests() {
        Show show = Show.builder()
                .psaSequences(List.of(PsaSequence.builder().name("PSA1").build()))
                .requestLeaderSequence("Leader-Req")
                .requests(List.of(
                        req("Song1"),
                        req("Song2"),
                        req("PSA1"),
                        req("Leader-Req"),
                        req("Song3")))
                .build();
        assertThat(PluginQueueHelper.countViewerRequests(show)).isEqualTo(3);
    }

    @Test
    void countViewerRequests_nullSequenceInRequest_skipped() {
        Show show = Show.builder()
                .requests(List.of(
                        Request.builder().position(1).sequence(null).build(),
                        req("Song1")))
                .build();
        assertThat(PluginQueueHelper.countViewerRequests(show)).isEqualTo(1);
    }

    // ---------- isPsaSequence ----------

    @Test
    void isPsaSequence_matchingName_returnsTrue() {
        Show show = Show.builder()
                .psaSequences(List.of(PsaSequence.builder().name("PSA1").build()))
                .build();
        assertThat(PluginQueueHelper.isPsaSequence(show, "PSA1")).isTrue();
    }

    @Test
    void isPsaSequence_nonMatchingName_returnsFalse() {
        Show show = Show.builder()
                .psaSequences(List.of(PsaSequence.builder().name("PSA1").build()))
                .build();
        assertThat(PluginQueueHelper.isPsaSequence(show, "Song1")).isFalse();
    }

    @Test
    void isPsaSequence_leaderName_returnsFalse() {
        // Leader sequences are non-song but NOT PSAs — the cadence fix needs
        // to distinguish them.
        Show show = Show.builder()
                .requestLeaderSequence("Leader-Req")
                .psaSequences(List.of(PsaSequence.builder().name("PSA1").build()))
                .build();
        assertThat(PluginQueueHelper.isPsaSequence(show, "Leader-Req")).isFalse();
    }

    @Test
    void isPsaSequence_nullName_returnsFalse() {
        Show show = Show.builder()
                .psaSequences(List.of(PsaSequence.builder().name("PSA1").build()))
                .build();
        assertThat(PluginQueueHelper.isPsaSequence(show, null)).isFalse();
    }

    @Test
    void isPsaSequence_emptyName_returnsFalse() {
        Show show = Show.builder()
                .psaSequences(List.of(PsaSequence.builder().name("PSA1").build()))
                .build();
        assertThat(PluginQueueHelper.isPsaSequence(show, "")).isFalse();
    }

    @Test
    void isPsaSequence_emptyPsaList_returnsFalse() {
        Show show = Show.builder().psaSequences(new ArrayList<>()).build();
        assertThat(PluginQueueHelper.isPsaSequence(show, "PSA1")).isFalse();
    }

    @Test
    void isPsaSequence_nullShow_returnsFalse() {
        assertThat(PluginQueueHelper.isPsaSequence((Show) null, "PSA1")).isFalse();
    }

    // ---------- helpers ----------

    private static Request req(String name) {
        return Request.builder()
                .sequence(Sequence.builder().name(name).build())
                .position(1)
                .build();
    }
}
