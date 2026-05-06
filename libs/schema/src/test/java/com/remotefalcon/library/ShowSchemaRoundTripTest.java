package com.remotefalcon.library;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.remotefalcon.library.documents.Notification;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.documents.Wattson;
import com.remotefalcon.library.enums.LocationCheckMethod;
import com.remotefalcon.library.enums.NotificationType;
import com.remotefalcon.library.enums.ShowRole;
import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.ActiveViewer;
import com.remotefalcon.library.models.ApiAccess;
import com.remotefalcon.library.models.NotificationModel;
import com.remotefalcon.library.models.NotificationPreference;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.PsaSequence;
import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.models.SequenceGroup;
import com.remotefalcon.library.models.ShowNotification;
import com.remotefalcon.library.models.Stat;
import com.remotefalcon.library.models.UserProfile;
import com.remotefalcon.library.models.ViewerPage;
import com.remotefalcon.library.models.Vote;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Schema round-trip contract test.
 *
 * Proves that the canonical Mongo documents in {@code libs/schema/} survive a
 * Jackson serialize -> deserialize cycle using a mapper configured the way
 * Spring Data Mongo configures its own under the hood (JavaTimeModule
 * registered, dates as ISO-8601 strings rather than numeric timestamps).
 *
 * The dual-mapper drift class is the highest-leverage untested concern in
 * pre-monorepo Remote Falcon: {@code Show} is consumed by 5 services across
 * two stacks (Spring Data Mongo and Quarkus Mongo Panache). A field rename or
 * an annotation change here can silently desync any one service that bumps
 * the library SHA without the others. This test fails loudly the moment a
 * field stops round-tripping.
 *
 * Intentionally uses Jackson directly (no Mongo container) -- catching schema
 * drift does not require driving a real database, and Jackson is the
 * serialization path both Spring Data and Quarkus go through underneath.
 */
class ShowSchemaRoundTripTest {

    private static final LocalDateTime FIXED_TIME = LocalDateTime.of(2026, 1, 1, 0, 0, 0);

    private ObjectMapper mapper;

    @BeforeEach
    void setUp() {
        mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    @Test
    void show_roundTrips_throughJackson() throws Exception {
        Show original = buildCanonicalShow();

        String json = mapper.writeValueAsString(original);
        Show roundTripped = mapper.readValue(json, Show.class);

        assertEquals(original, roundTripped);
    }

    @Test
    void show_jsonIgnoreFields_areExcluded_fromSerialization() throws Exception {
        // serviceToken is annotated @JsonIgnore. Setting it on the original
        // and checking it disappears on the round-trip locks the contract:
        // if someone removes @JsonIgnore (deliberately or by accident),
        // serviceToken would start leaking into JSON payloads sent to clients.
        Show original = buildCanonicalShow();
        original.setServiceToken("internal-secret-do-not-leak");

        String json = mapper.writeValueAsString(original);
        Show roundTripped = mapper.readValue(json, Show.class);

        assertNull(roundTripped.getServiceToken(),
                "@JsonIgnore on serviceToken must keep it out of the JSON payload");
        assertNotNull(original.getServiceToken(),
                "sanity: original still holds the value, only the serialized copy drops it");
    }

    @Test
    void wattson_roundTrips_throughJackson() throws Exception {
        Wattson original = Wattson.builder()
                .id("wattson-id-1")
                .responseId("resp-1")
                .showSubdomain("test-show")
                .feedback("This is feedback text.")
                .build();

        String json = mapper.writeValueAsString(original);
        Wattson roundTripped = mapper.readValue(json, Wattson.class);

        assertEquals(original, roundTripped);
    }

    @Test
    void notification_roundTrips_throughJackson() throws Exception {
        Notification original = Notification.builder()
                .id("notif-id-1")
                .uuid("uuid-1")
                .createdDate(FIXED_TIME)
                .type(NotificationType.USER)
                .preview("preview text")
                .subject("subject text")
                .message("message body")
                .build();

        String json = mapper.writeValueAsString(original);
        Notification roundTripped = mapper.readValue(json, Notification.class);

        assertEquals(original, roundTripped);
    }

    private Show buildCanonicalShow() {
        ApiAccess apiAccess = ApiAccess.builder()
                .apiAccessActive(true)
                .apiAccessToken("api-token")
                .apiAccessSecret("api-secret")
                .build();

        UserProfile userProfile = UserProfile.builder()
                .firstName("Test")
                .lastName("Owner")
                .facebookUrl("https://facebook.example/test")
                .youtubeUrl("https://youtube.example/test")
                .expoPushToken("expo-token")
                .totalTokens(42)
                .lastTokenResetDate(FIXED_TIME)
                .build();

        NotificationPreference notifPref = NotificationPreference.builder()
                .enableFppHeartbeat(true)
                .fppHeartbeatIfControlEnabled(false)
                .fppHeartbeatRenotifyAfterMinutes(15)
                .fppHeartbeatLastNotification(FIXED_TIME)
                .build();

        Preference preferences = Preference.builder()
                .viewerControlEnabled(true)
                .viewerPageViewOnly(false)
                .viewerControlMode(ViewerControlMode.JUKEBOX)
                .resetVotes(false)
                .jukeboxDepth(3)
                .locationCheckMethod(LocationCheckMethod.GEO)
                .showLatitude(40.7128f)
                .showLongitude(-74.0060f)
                .allowedRadius(1.5f)
                .checkIfVoted(true)
                .checkIfRequested(true)
                .psaEnabled(false)
                .psaFrequency(5)
                .jukeboxRequestLimit(2)
                .locationCode(12345)
                .hideSequenceCount(0)
                .makeItSnow(false)
                .managePsa(false)
                .sequencesPlayed(7)
                .pageTitle("Test Show Page")
                .pageIconUrl("https://example/icon.png")
                .showOnMap(true)
                .selfHostedRedirectUrl("https://example/host")
                .blockedViewerIps(new LinkedHashSet<>(List.of("10.0.0.1", "10.0.0.2")))
                .notificationPreferences(notifPref)
                .build();

        Sequence sequence = Sequence.builder()
                .name("seq-1")
                .displayName("Sequence One")
                .duration(120)
                .visible(true)
                .index(0)
                .order(1)
                .imageUrl("https://example/seq1.png")
                .active(true)
                .visibilityCount(0)
                .type("SEQUENCE")
                .group("group-a")
                .category("rock")
                .artist("Test Artist")
                .build();

        SequenceGroup sequenceGroup = SequenceGroup.builder()
                .name("group-a")
                .visibilityCount(2)
                .build();

        PsaSequence psaSequence = PsaSequence.builder()
                .name("psa-1")
                .order(1)
                .lastPlayed(FIXED_TIME)
                .build();

        ViewerPage viewerPage = ViewerPage.builder()
                .name("home")
                .active(true)
                .html("<html><body>hi</body></html>")
                .build();

        Stat stats = Stat.builder()
                .jukebox(List.of(Stat.Jukebox.builder().name("seq-1").dateTime(FIXED_TIME).build()))
                .voting(List.of(Stat.Voting.builder().name("seq-1").dateTime(FIXED_TIME).build()))
                .votingWin(List.of(Stat.VotingWin.builder().name("seq-1").total(3).dateTime(FIXED_TIME).build()))
                .page(List.of(Stat.Page.builder().ip("10.0.0.1").dateTime(FIXED_TIME).build()))
                .build();

        Request request = Request.builder()
                .sequence(sequence)
                .position(1)
                .viewerRequested("10.0.0.1")
                .ownerRequested(false)
                .build();

        Vote vote = Vote.builder()
                .sequence(sequence)
                .sequenceGroup(sequenceGroup)
                .votes(5)
                .viewersVoted(List.of("10.0.0.1", "10.0.0.2"))
                .lastVoteTime(FIXED_TIME)
                .ownerVoted(false)
                .build();

        ActiveViewer activeViewer = ActiveViewer.builder()
                .ipAddress("10.0.0.1")
                .visitDateTime(FIXED_TIME)
                .build();

        NotificationModel notifModel = NotificationModel.builder()
                .uuid("notif-uuid")
                .createdDate(FIXED_TIME)
                .type(NotificationType.USER)
                .preview("preview")
                .subject("subject")
                .message("message")
                .build();

        ShowNotification showNotification = ShowNotification.builder()
                .notification(notifModel)
                .read(false)
                .deleted(false)
                .build();

        return Show.builder()
                .id("show-id-1")
                .showToken("test-show-token")
                .email("test@local")
                .password("hashed-password")
                .showName("Test Show")
                .showSubdomain("test-show")
                .emailVerified(true)
                .createdDate(FIXED_TIME)
                .lastLoginDate(FIXED_TIME)
                .expireDate(FIXED_TIME)
                .pluginVersion("1.0.0")
                .fppVersion("8.0.0")
                .lastLoginIp("10.0.0.1")
                .showRole(ShowRole.USER)
                .passwordResetLink("reset-link")
                .passwordResetExpiry(FIXED_TIME)
                .apiAccess(apiAccess)
                .userProfile(userProfile)
                .preferences(preferences)
                .sequences(List.of(sequence))
                .sequenceGroups(List.of(sequenceGroup))
                .psaSequences(List.of(psaSequence))
                .pages(List.of(viewerPage))
                .stats(stats)
                .requests(List.of(request))
                .votes(List.of(vote))
                .activeViewers(List.of(activeViewer))
                .playingNow("seq-1")
                .playingNext("seq-2")
                .playingNextFromSchedule("seq-3")
                .playingNowSequence(sequence)
                .playingNextSequence(sequence)
                .lastFppHeartbeat(FIXED_TIME)
                .showNotifications(List.of(showNotification))
                // serviceToken intentionally left null -- it's @JsonIgnore'd
                // and a non-null value would never round-trip cleanly.
                .build();
    }
}
