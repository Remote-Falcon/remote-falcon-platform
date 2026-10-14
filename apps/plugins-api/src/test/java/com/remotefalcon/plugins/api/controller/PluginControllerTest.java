package com.remotefalcon.plugins.api.controller;

import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.model.*;
import com.remotefalcon.plugins.api.repository.ShowRepository;
import com.remotefalcon.plugins.api.service.PluginService;

import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

@QuarkusTest
class PluginControllerTest {

  @BeforeEach
  void setupShowTokenMock() {
    // By default, authorize all requests with a known token
    when(showRepository.findByShowToken(TEST_TOKEN)).thenReturn(java.util.Optional.of(new Show()));
    // The poll endpoints probe the queue before the full load. Report work
    // queued so they fall through to the (mocked) service like the rest.
    when(showRepository.findPollStateByShowToken(TEST_TOKEN))
        .thenReturn(java.util.Optional.of(new ShowRepository.PollState(true, true)));
  }

  private static final String TEST_TOKEN = "test-token";

  @InjectMock
  PluginService pluginService;

  @InjectMock
  ShowRepository showRepository;

  @Test
  void testNextPlaylistInQueue() {
    NextPlaylistResponse expected = NextPlaylistResponse.builder()
        .nextPlaylist("Playlist A")
        .playlistIndex(2)
        .build();
    when(pluginService.nextPlaylistInQueue()).thenReturn(expected);

    NextPlaylistResponse actual =
        given()
            .header("showtoken", TEST_TOKEN)
            .when()
            .get("/nextPlaylistInQueue")
            .then()
            .statusCode(200)
            .extract().as(NextPlaylistResponse.class);

    assertEquals(expected, actual);
    verify(pluginService).nextPlaylistInQueue();
  }

  @Test
  void testUpdatePlaylistQueue() {
    PluginResponse expected = PluginResponse.builder().message("ok").build();
    when(pluginService.updatePlaylistQueue()).thenReturn(expected);

    PluginResponse actual = given()
        .header("showtoken", TEST_TOKEN)
        .contentType(ContentType.JSON)
        .when()
        .post("/updatePlaylistQueue")
        .then()
        .statusCode(200)
        .extract().as(PluginResponse.class);

    assertEquals(expected, actual);
    verify(pluginService).updatePlaylistQueue();
  }

  @Test
  void testSyncPlaylists() {
    SyncPlaylistRequest request = SyncPlaylistRequest.builder()
        .playlists(List.of(
            SyncPlaylistDetails.builder().playlistName("P1").playlistDuration(100).playlistIndex(1).playlistType("NORMAL").build(),
            SyncPlaylistDetails.builder().playlistName("P2").playlistDuration(200).playlistIndex(2).playlistType("SCHEDULED").build()
        ))
        .build();
    PluginResponse expected = PluginResponse.builder().message("synced").build();
    when(pluginService.syncPlaylists(request)).thenReturn(expected);

    PluginResponse actual = given()
        .header("showtoken", TEST_TOKEN)
        .contentType(ContentType.JSON)
        .body(request)
        .when()
        .post("/syncPlaylists")
        .then()
        .statusCode(200)
        .extract().as(PluginResponse.class);

    assertEquals(expected, actual);
    verify(pluginService).syncPlaylists(request);
  }

  @Test
  void testUpdateWhatsPlaying() {
    UpdateWhatsPlayingRequest request = UpdateWhatsPlayingRequest.builder().playlist("NowPlaying").build();
    PluginResponse expected = PluginResponse.builder().currentPlaylist("NowPlaying").build();
    when(pluginService.updateWhatsPlaying(request)).thenReturn(expected);

    PluginResponse actual = given()
        .header("showtoken", TEST_TOKEN)
        .contentType(ContentType.JSON)
        .body(request)
        .when()
        .post("/updateWhatsPlaying")
        .then()
        .statusCode(200)
        .extract().as(PluginResponse.class);

    assertEquals(expected, actual);
    verify(pluginService).updateWhatsPlaying(request);
  }

  @Test
  void testUpdateNextScheduledSequence() {
    UpdateNextScheduledRequest request = UpdateNextScheduledRequest.builder().sequence("Seq1").build();
    PluginResponse expected = PluginResponse.builder().nextScheduledSequence("Seq1").build();
    when(pluginService.updateNextScheduledSequence(request)).thenReturn(expected);

    PluginResponse actual = given()
        .header("showtoken", TEST_TOKEN)
        .contentType(ContentType.JSON)
        .body(request)
        .when()
        .post("/updateNextScheduledSequence")
        .then()
        .statusCode(200)
        .extract().as(PluginResponse.class);

    assertEquals(expected, actual);
    verify(pluginService).updateNextScheduledSequence(request);
  }

  @Test
  void testViewerControlMode() {
    PluginResponse expected = PluginResponse.builder().viewerControlMode("VOTE").build();
    when(pluginService.viewerControlMode()).thenReturn(expected);

    PluginResponse actual = given()
        .header("showtoken", TEST_TOKEN)
        .when()
        .get("/viewerControlMode")
        .then()
        .statusCode(200)
        .extract().as(PluginResponse.class);

    assertEquals(expected, actual);
    verify(pluginService).viewerControlMode();
  }

  @Test
  void testHighestVotedPlaylist() {
    HighestVotedPlaylistResponse expected = HighestVotedPlaylistResponse.builder()
        .winningPlaylist("Winner")
        .playlistIndex(3)
        .build();
    when(pluginService.highestVotedPlaylist()).thenReturn(expected);

    HighestVotedPlaylistResponse actual = given()
        .header("showtoken", TEST_TOKEN)
        .when()
        .get("/highestVotedPlaylist")
        .then()
        .statusCode(200)
        .extract().as(HighestVotedPlaylistResponse.class);

    assertEquals(expected, actual);
    verify(pluginService).highestVotedPlaylist();
  }

  @Test
  void testPluginVersion() {
    PluginVersion request = PluginVersion.builder().pluginVersion("1.2.3").fppVersion("7.0").build();
    PluginResponse expected = PluginResponse.builder().message("ok").build();
    when(pluginService.pluginVersion(request)).thenReturn(expected);

    PluginResponse actual = given()
        .header("showtoken", TEST_TOKEN)
        .contentType(ContentType.JSON)
        .body(request)
        .when()
        .post("/pluginVersion")
        .then()
        .statusCode(200)
        .extract().as(PluginResponse.class);

    assertEquals(expected, actual);
    verify(pluginService).pluginVersion(request);
  }

  @Test
  void testRemotePreferences() {
    RemotePreferenceResponse expected = RemotePreferenceResponse.builder()
        .viewerControlMode("SCHEDULED")
        .remoteSubdomain("myshow")
        .interruptSchedule(true)
        .build();
    when(pluginService.remotePreferences()).thenReturn(expected);

    RemotePreferenceResponse actual = given()
        .header("showtoken", TEST_TOKEN)
        .when()
        .get("/remotePreferences")
        .then()
        .statusCode(200)
        .extract().as(RemotePreferenceResponse.class);

    assertEquals(expected, actual);
    verify(pluginService).remotePreferences();
  }

  @Test
  void testPurgeQueue() {
    PluginResponse expected = PluginResponse.builder().message("purged").build();
    when(pluginService.purgeQueue()).thenReturn(expected);

    PluginResponse actual = given()
        .header("showtoken", TEST_TOKEN)
        .when()
        .delete("/purgeQueue")
        .then()
        .statusCode(200)
        .extract().as(PluginResponse.class);

    assertEquals(expected, actual);
    verify(pluginService).purgeQueue();
  }

  @Test
  void testResetAllVotes() {
    PluginResponse expected = PluginResponse.builder().message("reset").build();
    when(pluginService.resetAllVotes()).thenReturn(expected);

    PluginResponse actual = given()
        .header("showtoken", TEST_TOKEN)
        .when()
        .delete("/resetAllVotes")
        .then()
        .statusCode(200)
        .extract().as(PluginResponse.class);

    assertEquals(expected, actual);
    verify(pluginService).resetAllVotes();
  }

  @Test
  void testToggleViewerControl() {
    PluginResponse expected = PluginResponse.builder().viewerControlEnabled(true).build();
    when(pluginService.toggleViewerControl()).thenReturn(expected);

    PluginResponse actual = given()
        .header("showtoken", TEST_TOKEN)
        .contentType(ContentType.JSON)
        .when()
        .post("/toggleViewerControl")
        .then()
        .statusCode(200)
        .extract().as(PluginResponse.class);

    assertEquals(expected, actual);
    verify(pluginService).toggleViewerControl();
  }

  @Test
  void testUpdateViewerControl() {
    ViewerControlRequest request = ViewerControlRequest.builder().viewerControlEnabled("true").build();
    PluginResponse expected = PluginResponse.builder().viewerControlEnabled(true).build();
    when(pluginService.updateViewerControl(request)).thenReturn(expected);

    PluginResponse actual = given()
        .header("showtoken", TEST_TOKEN)
        .contentType(ContentType.JSON)
        .body(request)
        .when()
        .post("/updateViewerControl")
        .then()
        .statusCode(200)
        .extract().as(PluginResponse.class);

    assertEquals(expected, actual);
    verify(pluginService).updateViewerControl(request);
  }

  @Test
  void testUpdateManagedPsa() {
    ManagedPSARequest request = ManagedPSARequest.builder().managedPsaEnabled("true").build();
    PluginResponse expected = PluginResponse.builder().managedPsaEnabled(true).build();
    when(pluginService.updateManagedPsa(request)).thenReturn(expected);

    PluginResponse actual = given()
        .header("showtoken", TEST_TOKEN)
        .contentType(ContentType.JSON)
        .body(request)
        .when()
        .post("/updateManagedPsa")
        .then()
        .statusCode(200)
        .extract().as(PluginResponse.class);

    assertEquals(expected, actual);
    verify(pluginService).updateManagedPsa(request);
  }

  // @Test
  // void testFppHeartbeat() {
  //   // No return body; expect 204 No Content
  //   doNothing().when(pluginService).fppHeartbeat();

  //   given()
  //       .header("showtoken", TEST_TOKEN)
  //       .contentType(ContentType.JSON)
  //       .when()
  //       .post("/fppHeartbeat")
  //       .then()
  //       .statusCode(204);

  //   verify(pluginService).fppHeartbeat();
  // }

  @Test
  void testHealth() {
    Health actual = given()
        .header("showtoken", TEST_TOKEN)
        .when()
        .get("/actuator/health")
        .then()
        .statusCode(200)
        .extract().as(Health.class);

    assertEquals(Health.builder().status("UP").build(), actual);
  }
}
