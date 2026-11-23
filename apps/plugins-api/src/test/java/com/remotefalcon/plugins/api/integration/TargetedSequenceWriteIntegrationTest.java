package com.remotefalcon.plugins.api.integration;

import com.mongodb.client.MongoClient;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Updates;
import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.*;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.context.ShowContext;
import com.remotefalcon.plugins.api.model.HighestVotedPlaylistResponse;
import com.remotefalcon.plugins.api.model.NextPlaylistResponse;
import com.remotefalcon.plugins.api.model.UpdateWhatsPlayingRequest;
import com.remotefalcon.plugins.api.repository.ShowRepository;
import com.remotefalcon.plugins.api.service.PluginService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.bson.BsonDocument;
import org.bson.Document;
import org.bson.RawBsonDocument;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/**
 * Season Prep S4 / release R3: per-song counter writes on the play path
 * (nextPlaylistInQueue, updateWhatsPlaying, highestVotedPlaylist) are
 * targeted element updates instead of whole {@code sequences} /
 * {@code sequenceGroups} {@code $set}s.
 *
 * <p>Each test seeds a show, captures the stored document, and writes down
 * the document the pre-R3 whole-array code produced for the same inputs
 * ({@code expected}). The resulting stored document must equal it, so the
 * change is a pure write-shape change. A few tests pin the deliberate
 * difference: a stale in-memory snapshot no longer clobbers concurrent
 * edits to other elements.
 *
 * <p>Calls the service directly with a mocked {@link ShowContext} so a test
 * can hand it a snapshot that is stale relative to the database, which is
 * what a concurrent write looks like from inside a request.
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class TargetedSequenceWriteIntegrationTest {

  private static final String TOKEN = "targeted-sequence-write-token";
  // Regex/operator-looking characters: names are matched by equality in
  // arrayFilters, never as a pattern.
  private static final String SPECIAL = "Silent Night (Remix) [v2].*+?^$ {a:1} \\ \"q\"";

  @Inject
  PluginService pluginService;

  @InjectMock
  ShowContext showContext;

  @Inject
  ShowRepository showRepository;

  @Inject
  RecordingUpdateListener updates;

  @Inject
  MongoClient mongoClient;

  @BeforeEach
  void clean() {
    showRepository.delete("showToken", TOKEN);
  }

  @AfterEach
  void tearDown() {
    showRepository.delete("showToken", TOKEN);
  }

  // ---------------------------------------------------------------- fixtures

  private static Sequence seq(String name, int visibilityCount) {
    return Sequence.builder()
        .name(name)
        .displayName(name + " display")
        .duration(180)
        .visible(true)
        .index(1)
        .order(1)
        .active(true)
        .visibilityCount(visibilityCount)
        .type("SEQUENCE")
        .group("")
        .imageUrl("data:image/png;base64,AAAA")
        .build();
  }

  private static Sequence grouped(String name, String group, int order) {
    Sequence s = seq(name, 0);
    s.setGroup(group);
    s.setOrder(order);
    return s;
  }

  private static Show baseShow(List<Sequence> sequences, List<SequenceGroup> groups) {
    Show show = new Show();
    show.setShowToken(TOKEN);
    show.setShowSubdomain("targeted-seq");
    show.setShowName("Targeted Sequence Writes");
    show.setPlayingNow("");
    show.setPlayingNext("");
    show.setPlayingNextFromSchedule("");
    show.setPreferences(Preference.builder()
        .viewerControlMode(ViewerControlMode.JUKEBOX)
        .viewerControlEnabled(true)
        .hideSequenceCount(2)
        .managePsa(false)
        .psaEnabled(false)
        .psaFrequency(3)
        .resetVotes(true)
        .sequencesPlayed(0)
        .build());
    show.setSequences(sequences);
    show.setSequenceGroups(groups);
    show.setRequests(new ArrayList<>());
    show.setVotes(new ArrayList<>());
    show.setPsaSequences(new ArrayList<>());
    show.setStats(Stat.builder().votingWin(new ArrayList<>()).build());
    return show;
  }

  private void persist(Show show) {
    showRepository.persist(show);
  }

  /** Fresh snapshot, as ShowTokenFilter would load it for a request. */
  private Show load() {
    return showRepository.findByShowToken(TOKEN).orElseThrow();
  }

  private void useSnapshot(Show snapshot) {
    when(showContext.getShow()).thenReturn(snapshot);
  }

  private Document raw() {
    return Show.mongoCollection().withDocumentClass(Document.class)
        .find(Filters.eq("showToken", TOKEN)).first();
  }

  @SuppressWarnings("unchecked")
  private static List<Document> list(Document doc, String field) {
    return (List<Document>) doc.get(field);
  }

  private List<BsonDocument> sentUpdates() {
    return updates.showUpdates();
  }

  private static boolean setsWholeField(BsonDocument update, String field) {
    return update.containsKey("$set") && update.getDocument("$set").containsKey(field);
  }

  private static void assertNoWholeArrayWrites(List<BsonDocument> sent) {
    for (BsonDocument u : sent) {
      assertFalse(setsWholeField(u, "sequences"), "whole sequences $set: " + u);
      assertFalse(setsWholeField(u, "sequenceGroups"), "whole sequenceGroups $set: " + u);
    }
  }

  /** updateWhatsPlaying writes no whole play-path array and no arrayFilters. */
  private static void assertElementWritesOnly(List<BsonDocument> sent) {
    for (BsonDocument u : sent) {
      for (String field : List.of("sequences", "sequenceGroups", "requests", "votes")) {
        assertFalse(setsWholeField(u, field), "whole " + field + " $set: " + u);
      }
      assertFalse(u.toJson().contains(".$["), "arrayFilters path in " + u);
    }
  }

  private static Request request(int position, Sequence sequence) {
    return Request.builder().position(position).sequence(sequence).viewerRequested("1.2.3.4").build();
  }

  // ------------------------------------------------------ nextPlaylistInQueue

  @Test
  void nextPlaylist_plainSequence_setsOnlyThatElementsVisibility() {
    Show show = baseShow(
        new ArrayList<>(List.of(seq("Jingle", 0), seq(SPECIAL, 1), seq("Carol", 0))),
        new ArrayList<>(List.of(SequenceGroup.builder().name("G").visibilityCount(1).build())));
    show.getRequests().add(request(1, seq(SPECIAL, 1)));
    show.getRequests().add(request(2, seq("Carol", 0)));
    persist(show);
    Document expected = raw();
    useSnapshot(load());
    updates.clear();

    NextPlaylistResponse resp = pluginService.nextPlaylistInQueue();

    assertEquals(SPECIAL, resp.getNextPlaylist());
    // Old behavior: request at position 1 pulled; sequences[1].visibilityCount
    // = hideSequenceCount + 1 = 3; every other element and the groups as stored.
    list(expected, "requests").removeIf(r -> Integer.valueOf(1).equals(r.get("position")));
    list(expected, "sequences").get(1).put("visibilityCount", 3);
    assertEquals(expected, raw());
    assertEquals(1, sentUpdates().size());
    assertNoWholeArrayWrites(sentUpdates());
  }

  @Test
  void nextPlaylist_caseInsensitiveMatch_targetsTheStoredElement() {
    Show show = baseShow(
        new ArrayList<>(List.of(seq("Jingle Bells", 0), seq("Carol", 0))),
        new ArrayList<>());
    show.getRequests().add(request(1, seq("JINGLE bells", 0)));
    persist(show);
    Document expected = raw();
    useSnapshot(load());
    updates.clear();

    pluginService.nextPlaylistInQueue();

    list(expected, "requests").clear();
    list(expected, "sequences").get(0).put("visibilityCount", 3);
    assertEquals(expected, raw());
    assertNoWholeArrayWrites(sentUpdates());
  }

  @Test
  void nextPlaylist_groupRequest_setsOnlyTheGroupsVisibility() {
    Show show = baseShow(
        new ArrayList<>(List.of(grouped("G1", "Medley [x]", 1), grouped("G2", "Medley [x]", 2), seq("Solo", 0))),
        new ArrayList<>(List.of(
            SequenceGroup.builder().name("Other").visibilityCount(1).build(),
            SequenceGroup.builder().name("Medley [x]").visibilityCount(0).build())));
    show.getRequests().add(request(1, grouped("G1", "medley [X]", 1)));
    persist(show);
    Document expected = raw();
    useSnapshot(load());
    updates.clear();

    pluginService.nextPlaylistInQueue();

    list(expected, "requests").clear();
    list(expected, "sequenceGroups").get(1).put("visibilityCount", 3);
    assertEquals(expected, raw());
    assertNoWholeArrayWrites(sentUpdates());
  }

  @Test
  void nextPlaylist_hideCountZero_onlyPullsTheRequest() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 2), seq("B", 0))), new ArrayList<>());
    show.getPreferences().setHideSequenceCount(0);
    show.getRequests().add(request(1, seq("A", 2)));
    persist(show);
    Document expected = raw();
    useSnapshot(load());
    updates.clear();

    pluginService.nextPlaylistInQueue();

    list(expected, "requests").clear();
    assertEquals(expected, raw());
    BsonDocument sent = sentUpdates().getFirst();
    assertFalse(sent.containsKey("$set"), "nothing to $set when hideSequenceCount is 0: " + sent);
  }

  @Test
  void nextPlaylist_exactDuplicateNames_onlyFirstChanges_viaWholeArrayFallback() {
    // Old code changed the FIRST case-insensitive match only. A name filter
    // would hit both exact duplicates, so this falls back to the old write.
    Show show = baseShow(
        new ArrayList<>(List.of(seq("Dup", 0), seq("Other", 0), seq("Dup", 0))),
        new ArrayList<>());
    show.getRequests().add(request(1, seq("dup", 0)));
    persist(show);
    Document expected = raw();
    useSnapshot(load());
    updates.clear();

    pluginService.nextPlaylistInQueue();

    list(expected, "requests").clear();
    list(expected, "sequences").get(0).put("visibilityCount", 3);
    assertEquals(expected, raw());
    assertTrue(setsWholeField(sentUpdates().getFirst(), "sequences"));
  }

  @Test
  void nextPlaylist_caseVariantDuplicates_onlyFirstMatchChanges() {
    Show show = baseShow(
        new ArrayList<>(List.of(seq("Other", 0), seq("Jingle", 0), seq("JINGLE", 0))),
        new ArrayList<>());
    show.getRequests().add(request(1, seq("jingle", 0)));
    persist(show);
    Document expected = raw();
    useSnapshot(load());
    updates.clear();

    pluginService.nextPlaylistInQueue();

    list(expected, "requests").clear();
    list(expected, "sequences").get(1).put("visibilityCount", 3);
    assertEquals(expected, raw());
    assertNoWholeArrayWrites(sentUpdates());
  }

  @Test
  void nextPlaylist_staleSnapshot_keepsConcurrentEditsToOtherElements() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 0), seq("B", 0))), new ArrayList<>());
    show.getRequests().add(request(1, seq("A", 0)));
    persist(show);
    useSnapshot(load());
    // Lands after this request loaded the show (e.g. an operator rename or
    // a concurrent visibility write). The old whole-array $set reverted it.
    Show.mongoCollection().updateOne(Filters.eq("showToken", TOKEN),
        Updates.combine(Updates.set("sequences.1.displayName", "Edited"),
            Updates.set("sequences.1.visibilityCount", 5)));
    Document expected = raw();

    pluginService.nextPlaylistInQueue();

    list(expected, "requests").clear();
    list(expected, "sequences").get(0).put("visibilityCount", 3);
    assertEquals(expected, raw());
  }

  // ------------------------------------------------------- updateWhatsPlaying

  private void play(String playlist) {
    pluginService.updateWhatsPlaying(UpdateWhatsPlayingRequest.builder().playlist(playlist).build());
  }

  /**
   * The non-sequence fields updateWhatsPlaying writes, as the old code wrote
   * them: playingNow, sequencesPlayed, lastPlayCountedAt, the scrubbed
   * requests/votes, and nextPsaOverride (null).
   */
  private static void expectPlayFields(Document expected, Document actual, String playlist, int sequencesPlayed) {
    expected.put("playingNow", playlist);
    Document prefs = (Document) expected.get("preferences");
    prefs.put("sequencesPlayed", sequencesPlayed);
    // Always $set (null when the nightly cap is off); its value is asserted
    // separately where it matters.
    prefs.put("lastPlayCountedAt", ((Document) actual.get("preferences")).get("lastPlayCountedAt"));
    expected.put("nextPsaOverride", null);
    // The viewer-IP scrub nulls viewerRequested; the codec omits nulls, so
    // the re-written request loses the key.
    for (Document r : list(expected, "requests")) {
      r.remove("viewerRequested");
    }
  }

  @Test
  void whatsPlaying_decrementsEveryPositiveVisibilityCount() {
    Show show = baseShow(
        new ArrayList<>(List.of(seq("A", 3), seq(SPECIAL, 0), seq("C", 1))),
        new ArrayList<>(List.of(
            SequenceGroup.builder().name("G1").visibilityCount(2).build(),
            SequenceGroup.builder().name("G2").visibilityCount(0).build())));
    show.getRequests().add(request(1, seq("C", 1)));
    persist(show);
    Document expected = raw();
    useSnapshot(load());
    updates.clear();

    play("A");

    Document actual = raw();
    list(expected, "sequences").get(0).put("visibilityCount", 2);
    list(expected, "sequences").get(2).put("visibilityCount", 0);
    list(expected, "sequenceGroups").get(0).put("visibilityCount", 1);
    expectPlayFields(expected, actual, "A", 1);
    assertEquals(expected, actual);
    assertNoWholeArrayWrites(sentUpdates());
  }

  @Test
  void whatsPlaying_nightlyCount_incrementsOnlyThePlayedSong() {
    Show show = baseShow(
        new ArrayList<>(List.of(seq("A", 1), seq(SPECIAL, 2), seq("C", 0))),
        new ArrayList<>());
    show.getSequences().get(0).setPlaysToday(4);
    show.getSequences().get(1).setPlaysToday(2);
    show.getPreferences().setNightlyPlayLimit(5);
    show.getPreferences().setLastPlayCountedAt(LocalDateTime.now().minusHours(1));
    persist(show);
    Document expected = raw();
    Document raw0 = raw();
    useSnapshot(load());
    updates.clear();

    play(SPECIAL.toLowerCase());

    Document actual = raw();
    List<Document> seqs = list(expected, "sequences");
    seqs.get(0).put("visibilityCount", 0);
    seqs.get(1).put("visibilityCount", 1);
    seqs.get(1).put("playsToday", 3);
    expectPlayFields(expected, actual, SPECIAL.toLowerCase(), 1);
    assertEquals(expected, actual);
    assertNoWholeArrayWrites(sentUpdates());
    Date seeded = (Date) ((Document) raw0.get("preferences")).get("lastPlayCountedAt");
    Date last = (Date) ((Document) actual.get("preferences")).get("lastPlayCountedAt");
    assertTrue(last.after(seeded), "lastPlayCountedAt advanced past the seeded value");
  }

  @Test
  void whatsPlaying_nightlyCount_nullPlaysTodayBecomesOne() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 0), seq("B", 0))), new ArrayList<>());
    show.getPreferences().setNightlyPlayLimit(5);
    show.getPreferences().setLastPlayCountedAt(LocalDateTime.now().minusHours(1));
    persist(show);
    Document expected = raw();
    assertFalse(list(expected, "sequences").get(1).containsKey("playsToday"), "seed has no playsToday");
    useSnapshot(load());
    updates.clear();

    play("B");

    Document actual = raw();
    list(expected, "sequences").get(1).put("playsToday", 1);
    expectPlayFields(expected, actual, "B", 1);
    assertEquals(expected, actual);
    assertNoWholeArrayWrites(sentUpdates());
  }

  @Test
  void whatsPlaying_nightlyReset_zeroesEveryTallyThenCounts() {
    Show show = baseShow(
        new ArrayList<>(List.of(seq("A", 2), seq("B", 0), seq("C", 0))),
        new ArrayList<>(List.of(SequenceGroup.builder().name("G").visibilityCount(1).build())));
    show.getSequences().get(0).setPlaysToday(4);
    show.getSequences().get(1).setPlaysToday(5);
    show.getPreferences().setNightlyPlayLimit(5);
    show.getPreferences().setLastPlayCountedAt(LocalDateTime.now().minusHours(7));
    persist(show);
    Document expected = raw();
    useSnapshot(load());
    updates.clear();

    play("B");

    Document actual = raw();
    List<Document> seqs = list(expected, "sequences");
    seqs.get(0).put("visibilityCount", 1);
    seqs.get(0).put("playsToday", 0);
    seqs.get(1).put("playsToday", 1);
    seqs.get(2).put("playsToday", 0);
    list(expected, "sequenceGroups").getFirst().put("visibilityCount", 0);
    expectPlayFields(expected, actual, "B", 1);
    assertEquals(expected, actual);
    // The once-a-night reset touches every element: still index paths, one
    // per changed tally, never the whole array.
    assertEquals(1, sentUpdates().size());
    assertNoWholeArrayWrites(sentUpdates());
  }

  @Test
  void whatsPlaying_nightlyCount_exactDuplicates_onlyFirstCounts() {
    Show show = baseShow(new ArrayList<>(List.of(seq("Dup", 1), seq("Dup", 1))), new ArrayList<>());
    show.getSequences().get(0).setPlaysToday(1);
    show.getSequences().get(1).setPlaysToday(1);
    show.getPreferences().setNightlyPlayLimit(5);
    show.getPreferences().setLastPlayCountedAt(LocalDateTime.now().minusHours(1));
    persist(show);
    Document expected = raw();
    useSnapshot(load());

    play("Dup");

    Document actual = raw();
    List<Document> seqs = list(expected, "sequences");
    seqs.get(0).put("visibilityCount", 0);
    seqs.get(1).put("visibilityCount", 0);
    seqs.get(0).put("playsToday", 2);
    expectPlayFields(expected, actual, "Dup", 1);
    assertEquals(expected, actual);
  }

  @Test
  void whatsPlaying_missingArrays_areWrittenAsEmptyLikeBefore() {
    Show show = baseShow(null, null);
    persist(show);
    Document expected = raw();
    assertFalse(expected.containsKey("sequences"));
    useSnapshot(load());

    play("Anything");

    Document actual = raw();
    expected.put("sequences", new ArrayList<>());
    expected.put("sequenceGroups", new ArrayList<>());
    expectPlayFields(expected, actual, "Anything", 1);
    assertEquals(expected, actual);
  }

  @Test
  void whatsPlaying_staleSnapshot_decrementsWhatIsStoredAndKeepsEdits() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 0), seq("B", 0))), new ArrayList<>());
    persist(show);
    useSnapshot(load());
    // A concurrent nextPlaylistInQueue grayed out B, and an operator renamed
    // A, after this request loaded the show. Serially, this play would then
    // decrement B to 2. The old whole-array write reset B to 0 and undid the
    // rename.
    Show.mongoCollection().updateOne(Filters.eq("showToken", TOKEN),
        Updates.combine(Updates.set("sequences.1.visibilityCount", 3),
            Updates.set("sequences.0.displayName", "Edited")));
    Document expected = raw();

    play("A");

    Document actual = raw();
    list(expected, "sequences").get(1).put("visibilityCount", 2);
    expectPlayFields(expected, actual, "A", 1);
    assertEquals(expected, actual);
  }

  @Test
  void whatsPlaying_staleSnapshot_concurrentPlaysBothCount() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 0))), new ArrayList<>());
    show.getSequences().getFirst().setPlaysToday(1);
    show.getPreferences().setNightlyPlayLimit(5);
    show.getPreferences().setLastPlayCountedAt(LocalDateTime.now().minusHours(1));
    persist(show);
    Show first = load();
    Show second = load();

    useSnapshot(first);
    play("A");
    useSnapshot(second);
    play("A");

    // Old code wrote stale+1 twice (= 2). $inc counts both plays.
    assertEquals(3, list(raw(), "sequences").getFirst().getInteger("playsToday"));
  }

  // ----------------------------------------------------- highestVotedPlaylist

  private static Vote vote(Sequence sequence, int votes) {
    return Vote.builder().sequence(sequence).votes(votes).lastVoteTime(LocalDateTime.now())
        .ownerVoted(false).viewersVoted(new ArrayList<>()).build();
  }

  @Test
  void highestVoted_winner_setsOnlyItsVisibility() {
    Show show = baseShow(
        new ArrayList<>(List.of(seq("A", 1), seq(SPECIAL, 0), seq("C", 0))),
        new ArrayList<>(List.of(SequenceGroup.builder().name("G").visibilityCount(1).build())));
    show.getPreferences().setViewerControlMode(ViewerControlMode.VOTING);
    show.getVotes().add(vote(seq(SPECIAL, 0), 10));
    show.getVotes().add(vote(seq("C", 0), 5));
    persist(show);
    Document expected = raw();
    useSnapshot(load());
    updates.clear();

    HighestVotedPlaylistResponse resp = pluginService.highestVotedPlaylist();

    assertEquals(SPECIAL, resp.getWinningPlaylist());
    Document actual = raw();
    list(expected, "sequences").get(1).put("visibilityCount", 3);
    // votes reset (resetVotes=true); one voting win appended.
    expected.put("votes", new ArrayList<>());
    ((Document) expected.get("stats")).put("votingWin", ((Document) actual.get("stats")).get("votingWin"));
    assertEquals(expected, actual);
    assertEquals(1, list((Document) actual.get("stats"), "votingWin").size());
    assertNoWholeArrayWrites(sentUpdates());
  }

  @Test
  void highestVoted_hideCountZero_leavesSequencesAlone() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 1), seq("B", 0))), new ArrayList<>());
    show.getPreferences().setHideSequenceCount(0);
    show.getVotes().add(vote(seq("B", 0), 3));
    persist(show);
    Document expected = raw();
    useSnapshot(load());
    updates.clear();

    pluginService.highestVotedPlaylist();

    Document actual = raw();
    expected.put("votes", new ArrayList<>());
    ((Document) expected.get("stats")).put("votingWin", ((Document) actual.get("stats")).get("votingWin"));
    assertEquals(expected, actual);
    assertNoWholeArrayWrites(sentUpdates());
  }

  @Test
  void highestVoted_groupWin_persistsOnlyTheGroupsVisibility() {
    // #210: a winning group's visibilityCount used to be set in memory only,
    // so a group that won a vote was never hidden or grayed out.
    Show show = baseShow(
        new ArrayList<>(List.of(grouped("M1", "Medley", 1), grouped("M2", "Medley", 2), seq("Solo", 0))),
        new ArrayList<>(List.of(
            SequenceGroup.builder().name("Other").visibilityCount(1).build(),
            SequenceGroup.builder().name("Medley").visibilityCount(0).build())));
    show.getVotes().add(Vote.builder().sequenceGroup(SequenceGroup.builder().name("medley").build())
        .votes(9).lastVoteTime(LocalDateTime.now()).ownerVoted(false).viewersVoted(new ArrayList<>()).build());
    persist(show);
    Document expected = raw();
    useSnapshot(load());
    updates.clear();

    HighestVotedPlaylistResponse resp = pluginService.highestVotedPlaylist();

    assertEquals("M1", resp.getWinningPlaylist());
    Document actual = raw();
    // hideSequenceCount + 1 on the stored "Medley" element only; the grouped
    // songs themselves and the other group are untouched.
    list(expected, "sequenceGroups").get(1).put("visibilityCount", 3);
    assertEquals(list(expected, "sequences"), list(actual, "sequences"));
    assertEquals(list(expected, "sequenceGroups"), list(actual, "sequenceGroups"));
    assertNoWholeArrayWrites(sentUpdates());
  }

  @Test
  void highestVoted_leaderCycle_setsWinnerVisibility() {
    Show show = baseShow(
        new ArrayList<>(List.of(seq("Leader", 0), seq("Win", 0), seq("Other", 1))),
        new ArrayList<>());
    show.setVoteLeaderSequence("Leader");
    show.getVotes().add(vote(seq("Win", 0), 4));
    persist(show);
    Document expected = raw();
    useSnapshot(load());
    updates.clear();

    HighestVotedPlaylistResponse resp = pluginService.highestVotedPlaylist();

    assertEquals("Leader", resp.getWinningPlaylist());
    Document actual = raw();
    list(expected, "sequences").get(1).put("visibilityCount", 3);
    assertEquals(list(expected, "sequences"), list(actual, "sequences"));
    assertEquals(list(expected, "sequenceGroups"), list(actual, "sequenceGroups"));
    assertNoWholeArrayWrites(sentUpdates());
  }

  @Test
  void highestVoted_exactDuplicateWinner_onlyFirstChanges() {
    Show show = baseShow(new ArrayList<>(List.of(seq("Dup", 0), seq("Dup", 0))), new ArrayList<>());
    show.getVotes().add(vote(seq("Dup", 0), 4));
    persist(show);
    Document expected = raw();
    useSnapshot(load());

    pluginService.highestVotedPlaylist();

    list(expected, "sequences").get(0).put("visibilityCount", 3);
    assertEquals(list(expected, "sequences"), list(raw(), "sequences"));
  }

  // ------------------------------------- updateWhatsPlaying: guarded index paths

  @Test
  void whatsPlaying_arrayReorderedAfterRead_retriesAndWritesTheRightElements() {
    Show show = baseShow(
        new ArrayList<>(List.of(seq("A", 2), seq("B", 0), seq("C", 1))),
        new ArrayList<>());
    show.getSequences().get(1).setPlaysToday(2);
    show.getPreferences().setNightlyPlayLimit(5);
    show.getPreferences().setLastPlayCountedAt(LocalDateTime.now().minusHours(1));
    persist(show);
    useSnapshot(load());
    // syncPlaylists reorders the array between this request's read and its
    // write: index 0 is now C, 1 is A, 2 is B.
    Document stored = raw();
    List<Document> seqs = list(stored, "sequences");
    Show.mongoCollection().updateOne(Filters.eq("showToken", TOKEN),
        Updates.set("sequences", List.of(seqs.get(2), seqs.get(0), seqs.get(1))));
    Document expected = raw();
    updates.clear();

    play("B");

    Document actual = raw();
    List<Document> exp = list(expected, "sequences");
    exp.get(0).put("visibilityCount", 0); // C 1 -> 0
    exp.get(1).put("visibilityCount", 1); // A 2 -> 1
    exp.get(2).put("playsToday", 3);      // B counted
    expectPlayFields(expected, actual, "B", 1);
    assertEquals(expected, actual);
    // First attempt's guards (name at each index) matched nothing; the retry
    // re-read the show and wrote the reordered indices.
    assertEquals(2, sentUpdates().size());
    assertEquals(0L, Show.mongoCollection().countDocuments(Filters.and(
        Filters.eq("showToken", TOKEN), Filters.lt("sequences.visibilityCount", 0))));
    assertElementWritesOnly(sentUpdates());
  }

  @Test
  void whatsPlaying_concurrentDecrementToZero_neverGoesNegative() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 1), seq("B", 0))), new ArrayList<>());
    persist(show);
    Show first = load();
    Show second = load();

    useSnapshot(first);
    play("B");
    useSnapshot(second);
    play("B");

    // The second play read A=1 but A is already 0: its guard misses, the
    // retry re-reads A=0 and leaves it.
    assertEquals(0, list(raw(), "sequences").getFirst().getInteger("visibilityCount"));
  }

  @Test
  void whatsPlaying_scrubsViewerIpsAndVotersPerElement_keepingMarkers() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 0), seq("B", 0))), new ArrayList<>());
    show.getRequests().add(request(1, seq("A", 0)));
    show.getRequests().add(Request.builder().position(2).sequence(seq("B", 0)).viewerRequested("PSA").build());
    show.getRequests().add(Request.builder().position(3).sequence(seq("B", 0)).build());
    Vote voted = vote(seq("A", 0), 2);
    voted.setViewersVoted(new ArrayList<>(List.of("1.2.3.4", "5.6.7.8")));
    Vote empty = vote(seq("B", 0), 1);
    Vote noList = vote(seq("B", 0), 1);
    noList.setViewersVoted(null);
    show.getVotes().addAll(List.of(voted, empty, noList));
    persist(show);
    Document expected = raw();
    assertFalse(list(expected, "votes").get(2).containsKey("viewersVoted"), "seed has no viewersVoted");
    useSnapshot(load());
    updates.clear();

    play("A");

    Document actual = raw();
    expectPlayFields(expected, actual, "A", 1);
    // expectPlayFields drops every viewerRequested; the PSA marker survives.
    list(expected, "requests").get(1).put("viewerRequested", "PSA");
    for (Document v : list(expected, "votes")) {
      v.put("viewersVoted", new ArrayList<>());
    }
    assertEquals(expected, actual);
    assertElementWritesOnly(sentUpdates());
    BsonDocument sent = sentUpdates().getFirst();
    assertTrue(sent.getDocument("$unset").containsKey("requests.0.viewerRequested"), sent.toJson());
    assertEquals(1, sent.getDocument("$unset").size(), "only the IP-carrying request: " + sent.toJson());
    assertTrue(sent.getDocument("$set").containsKey("votes.0.viewersVoted"));
    assertFalse(sent.getDocument("$set").containsKey("votes.1.viewersVoted"), "already empty");
    assertTrue(sent.getDocument("$set").containsKey("votes.2.viewersVoted"));
  }

  @Test
  void whatsPlaying_managedPsaQueued_pushedWhenNothingToScrub() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 0), seq("Ad", 0))), new ArrayList<>());
    show.getPreferences().setPsaEnabled(true);
    show.getPreferences().setManagePsa(true);
    show.getPreferences().setPsaFrequency(1);
    show.getPsaSequences().add(PsaSequence.builder().name("Ad").order(0).build());
    show.getRequests().add(Request.builder().position(4).sequence(seq("A", 0)).build());
    persist(show);
    useSnapshot(load());
    updates.clear();

    play("A");

    Document actual = raw();
    List<Document> reqs = list(actual, "requests");
    assertEquals(2, reqs.size());
    assertEquals(4, reqs.get(0).getInteger("position"));
    assertEquals(5, reqs.get(1).getInteger("position"));
    assertEquals("Ad", ((Document) reqs.get(1).get("sequence")).getString("name"));
    List<Document> votes = list(actual, "votes");
    assertEquals(1, votes.size());
    assertEquals(2000, votes.getFirst().getInteger("votes"));
    assertEquals(new ArrayList<>(), votes.getFirst().get("viewersVoted"));
    assertElementWritesOnly(sentUpdates());
    assertTrue(sentUpdates().getFirst().containsKey("$push"));
  }

  @Test
  void whatsPlaying_managedPsaQueued_withIpsToScrub_rewritesRequestsAsBefore() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 0), seq("Ad", 0))), new ArrayList<>());
    show.getPreferences().setPsaEnabled(true);
    show.getPreferences().setManagePsa(true);
    show.getPreferences().setPsaFrequency(1);
    show.getPsaSequences().add(PsaSequence.builder().name("Ad").order(0).build());
    show.getRequests().add(request(4, seq("A", 0)));
    persist(show);
    useSnapshot(load());
    updates.clear();

    play("A");

    List<Document> reqs = list(raw(), "requests");
    assertEquals(2, reqs.size());
    assertFalse(reqs.get(0).containsKey("viewerRequested"), "IP scrubbed");
    assertEquals(5, reqs.get(1).getInteger("position"));
    // $push and an element path can't share an update: whole requests write.
    assertTrue(setsWholeField(sentUpdates().getFirst(), "requests"));
  }

  @Test
  void whatsPlaying_manyElementsChange_oplogStaysSmall() {
    String artwork = "data:image/jpeg;base64," + "A".repeat(4_000);
    List<Sequence> sequences = new ArrayList<>();
    for (int i = 0; i < 200; i++) {
      Sequence s = seq("Song " + i, i < 3 ? 2 : 0);
      s.setImageUrl(artwork);
      s.setPlaysToday(1);
      sequences.add(s);
    }
    List<SequenceGroup> groups = new ArrayList<>();
    for (int i = 0; i < 5; i++) {
      groups.add(SequenceGroup.builder().name("Group " + i).visibilityCount(i < 2 ? 1 : 0).build());
    }
    Show show = baseShow(sequences, groups);
    show.getPreferences().setNightlyPlayLimit(5);
    show.getPreferences().setLastPlayCountedAt(LocalDateTime.now().minusHours(1));
    Sequence queued = seq("Song 50", 0);
    queued.setImageUrl(artwork);
    show.getRequests().add(request(1, queued));
    Vote v = vote(queued, 3);
    v.setViewersVoted(new ArrayList<>(List.of("1.2.3.4")));
    show.getVotes().add(v);
    persist(show);
    useSnapshot(load());
    updates.clear();

    play("Song 100");

    int oplog = lastShowOplogBytes();
    Document actual = raw();
    List<Document> seqs = list(actual, "sequences");
    assertEquals(1, seqs.get(0).getInteger("visibilityCount"));
    assertEquals(1, seqs.get(2).getInteger("visibilityCount"));
    assertEquals(2, seqs.get(100).getInteger("playsToday"));
    assertEquals(0, list(actual, "sequenceGroups").get(1).getInteger("visibilityCount"));
    assertElementWritesOnly(sentUpdates());
    System.out.printf("R3-OPLOG updateWhatsPlaying (3 seq + 2 group decrements, 1 tally, 1 IP scrub, 1 voter clear): %d bytes%n", oplog);
    assertTrue(oplog < 3_000, "element writes log per element, not the arrays: " + oplog);
  }

  @Test
  void whatsPlaying_concurrentViewerVote_doesNotMissTheGuard_andTheVoteSurvives() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 0), seq("B", 0))), new ArrayList<>());
    show.getPreferences().setViewerControlMode(ViewerControlMode.VOTING);
    Vote v = vote(seq("B", 0), 4);
    v.setViewersVoted(new ArrayList<>(List.of("1.1.1.1")));
    show.getVotes().add(v);
    persist(show);
    useSnapshot(load());
    // The viewer's incrementVoteAndAppendVoter lands after this request read
    // the show: same element, new count, new lastVoteTime, new voter.
    Show.mongoCollection().updateOne(Filters.eq("showToken", TOKEN), Updates.combine(
        Updates.inc("votes.0.votes", 1),
        Updates.set("votes.0.lastVoteTime", new Date()),
        Updates.push("votes.0.viewersVoted", "2.2.2.2")));
    updates.clear();

    play("A");

    assertEquals(1, sentUpdates().size(), "guard keys on the vote's name, so the first attempt lands");
    Document stored = list(raw(), "votes").getFirst();
    assertEquals(5, stored.getInteger("votes"), "the concurrent vote is kept");
    assertEquals(new ArrayList<>(), stored.get("viewersVoted"));
  }

  @Test
  void whatsPlaying_explicitNullTallySinceRead_retriesIntoSetInsteadOfFailing() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 0))), new ArrayList<>());
    show.getSequences().getFirst().setPlaysToday(2);
    show.getPreferences().setNightlyPlayLimit(5);
    show.getPreferences().setLastPlayCountedAt(LocalDateTime.now().minusHours(1));
    persist(show);
    useSnapshot(load());
    Show.mongoCollection().updateOne(Filters.eq("showToken", TOKEN), Updates.set("sequences.0.playsToday", null));
    updates.clear();

    play("A");

    // $inc on an explicit null is a Mongo error; the numeric-type guard turns
    // it into a miss, and the re-read (null tally) writes $set 1.
    assertEquals(2, sentUpdates().size());
    assertEquals(1, list(raw(), "sequences").getFirst().getInteger("playsToday"));
  }

  @Test
  void whatsPlaying_nullPsaPreferences_readAsOff() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 0), seq("Ad", 0))), new ArrayList<>());
    show.getPreferences().setPsaEnabled(null);
    show.getPreferences().setManagePsa(null);
    show.getPsaSequences().add(PsaSequence.builder().name("Ad").order(0).build());
    persist(show);
    assertNull(((Document) raw().get("preferences")).get("psaEnabled"));
    useSnapshot(load());

    assertDoesNotThrow(() -> play("A"));

    Document actual = raw();
    assertEquals("A", actual.getString("playingNow"));
    assertTrue(list(actual, "requests").isEmpty(), "no PSA queued");
    assertTrue(list(actual, "votes").isEmpty());
  }

  @Test
  void highestVoted_nullResetVotesAndPsaPreferences_readAsOff() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 0), seq("B", 0))), new ArrayList<>());
    show.getPreferences().setResetVotes(null);
    show.getPreferences().setPsaEnabled(null);
    show.getPreferences().setManagePsa(null);
    show.getVotes().add(vote(seq("A", 0), 3));
    show.getVotes().add(vote(seq("B", 0), 1));
    persist(show);
    useSnapshot(load());

    HighestVotedPlaylistResponse resp = pluginService.highestVotedPlaylist();

    assertEquals("A", resp.getWinningPlaylist());
    List<Document> votes = list(raw(), "votes");
    assertEquals(1, votes.size(), "resetVotes null = off: the other vote stays");
    assertEquals("B", ((Document) votes.getFirst().get("sequence")).getString("name"));
  }

  // ------------------------------------------- null hideSequenceCount (legacy)

  @Test
  void highestVoted_nullHideSequenceCount_readsAsZero() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 0), seq("B", 0))), new ArrayList<>());
    show.getPreferences().setHideSequenceCount(null);
    show.getVotes().add(vote(seq("B", 0), 3));
    persist(show);
    Document expected = raw();
    assertNull(((Document) expected.get("preferences")).get("hideSequenceCount"));
    useSnapshot(load());

    HighestVotedPlaylistResponse resp = pluginService.highestVotedPlaylist();

    assertEquals("B", resp.getWinningPlaylist());
    assertEquals(list(expected, "sequences"), list(raw(), "sequences"), "no cooldown applied");
  }

  @Test
  void nextPlaylist_nullHideSequenceCount_readsAsZero() {
    Show show = baseShow(new ArrayList<>(List.of(seq("A", 0))), new ArrayList<>());
    show.getPreferences().setHideSequenceCount(null);
    show.getRequests().add(request(1, seq("A", 0)));
    persist(show);
    Document expected = raw();
    useSnapshot(load());

    NextPlaylistResponse resp = pluginService.nextPlaylistInQueue();

    assertEquals("A", resp.getNextPlaylist());
    assertEquals(list(expected, "sequences"), list(raw(), "sequences"));
    assertTrue(list(raw(), "requests").isEmpty());
  }

  // --------------------------------------------------------------- oplog size

  /**
   * Measures the oplog entry nextPlaylistInQueue produces for a show with 200
   * sequences carrying inline data: URI artwork, against the pre-R3 write
   * (replayed here verbatim) on the same document. Printed for the release
   * notes; the assertion only guards the order of magnitude.
   */
  @Test
  void nextPlaylist_oplogEntry_isSmallForLargeShows() {
    String artwork = "data:image/jpeg;base64," + "A".repeat(4_000);
    List<Sequence> sequences = new ArrayList<>();
    for (int i = 0; i < 200; i++) {
      Sequence s = seq("Song " + i, 0);
      s.setImageUrl(artwork);
      s.setIndex(i);
      sequences.add(s);
    }
    List<SequenceGroup> groups = new ArrayList<>();
    for (int i = 0; i < 10; i++) {
      groups.add(SequenceGroup.builder().name("Group " + i).visibilityCount(0).build());
    }

    // Old write, replayed: $pull + whole-array $set of the mutated snapshot.
    Show show = baseShow(sequences, groups);
    show.getRequests().add(request(1, seq("Song 100", 0)));
    persist(show);
    Show snapshot = load();
    snapshot.getSequences().get(100).setVisibilityCount(3);
    Show.mongoCollection().updateOne(Filters.eq("showToken", TOKEN), Updates.combine(
        Updates.pull("requests", Filters.eq("position", 1)),
        Updates.set("sequences", snapshot.getSequences()),
        Updates.set("sequenceGroups", snapshot.getSequenceGroups())));
    int oldOplog = lastShowOplogBytes();
    Document oldResult = raw();

    showRepository.delete("showToken", TOKEN);
    Show again = baseShow(sequences, groups);
    again.getSequences().get(100).setVisibilityCount(0);
    again.getRequests().clear();
    again.getRequests().add(request(1, seq("Song 100", 0)));
    persist(again);
    useSnapshot(load());
    updates.clear();
    pluginService.nextPlaylistInQueue();
    int newOplog = lastShowOplogBytes();
    int newCommand = sentUpdates().getFirst().toBsonDocument().toString().length();

    Document newResult = raw();
    oldResult.remove("_id");
    newResult.remove("_id");
    assertEquals(oldResult, newResult, "same stored document either way");
    System.out.printf("R3-OPLOG nextPlaylistInQueue: old=%d bytes, new=%d bytes, new update doc ~%d chars%n",
        oldOplog, newOplog, newCommand);
    assertTrue(oldOplog > 500_000, "old write logs the whole array: " + oldOplog);
    assertTrue(newOplog < 2_000, "targeted write logs one field: " + newOplog);
  }

  private int lastShowOplogBytes() {
    String ns = Show.mongoCollection().getNamespace().getFullName();
    RawBsonDocument entry = mongoClient.getDatabase("local")
        .getCollection("oplog.rs", RawBsonDocument.class)
        .find(Filters.and(Filters.eq("ns", ns), Filters.eq("op", "u")))
        .sort(new Document("$natural", -1))
        .first();
    assertNotNull(entry, "no oplog entry for " + ns);
    return entry.getByteBuffer().remaining();
  }
}
