package com.remotefalcon.plugins.api.controller;

import com.remotefalcon.plugins.api.model.*;
import com.remotefalcon.plugins.api.service.PluginService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;

@Path("/")
public class PluginController {

  @Inject
  PluginService pluginService;

  @GET
  @Path("/nextPlaylistInQueue")
  @Produces(MediaType.APPLICATION_JSON)
  public NextPlaylistResponse nextPlaylistInQueue() {
    return this.pluginService.nextPlaylistInQueue();
  }

  @POST
  @Path("/updatePlaylistQueue")
  @Produces(MediaType.APPLICATION_JSON)
  public PluginResponse updatePlaylistQueue() {
    return this.pluginService.updatePlaylistQueue();
  }

  @POST
  @Path("/syncPlaylists")
  @Produces(MediaType.APPLICATION_JSON)
  @Consumes(MediaType.APPLICATION_JSON)
  public PluginResponse syncPlaylists(SyncPlaylistRequest request) {
    return this.pluginService.syncPlaylists(request);
  }

  @POST
  @Path("/updateWhatsPlaying")
  @Produces(MediaType.APPLICATION_JSON)
  @Consumes(MediaType.APPLICATION_JSON)
  public PluginResponse updateWhatsPlaying(UpdateWhatsPlayingRequest request) {
    return this.pluginService.updateWhatsPlaying(request);
  }

  @POST
  @Path("/updateNextScheduledSequence")
  @Produces(MediaType.APPLICATION_JSON)
  @Consumes(MediaType.APPLICATION_JSON)
  public PluginResponse updateNextScheduledSequence(UpdateNextScheduledRequest request) {
    return this.pluginService.updateNextScheduledSequence(request);
  }

  @GET
  @Path("/viewerControlMode")
  @Produces(MediaType.APPLICATION_JSON)
  public PluginResponse viewerControlMode() {
    return this.pluginService.viewerControlMode();
  }

  @GET
  @Path("/highestVotedPlaylist")
  @Produces(MediaType.APPLICATION_JSON)
  public HighestVotedPlaylistResponse highestVotedPlaylist() {
    return this.pluginService.highestVotedPlaylist();
  }

  @POST
  @Path("/pluginVersion")
  @Produces(MediaType.APPLICATION_JSON)
  @Consumes(MediaType.APPLICATION_JSON)
  public PluginResponse pluginVersion(PluginVersion request) {
    return this.pluginService.pluginVersion(request);
  }

  @GET
  @Path("/remotePreferences")
  @Produces(MediaType.APPLICATION_JSON)
  public RemotePreferenceResponse remotePreferences() {
    return this.pluginService.remotePreferences();
  }

  @DELETE
  @Path("/purgeQueue")
  @Produces(MediaType.APPLICATION_JSON)
  public PluginResponse purgeQueue() {
    return this.pluginService.purgeQueue();
  }

  @DELETE
  @Path("/resetAllVotes")
  @Produces(MediaType.APPLICATION_JSON)
  public PluginResponse resetAllVotes() {
    return this.pluginService.resetAllVotes();
  }

  @POST
  @Path("/toggleViewerControl")
  @Produces(MediaType.APPLICATION_JSON)
  @Consumes(MediaType.APPLICATION_JSON)
  public PluginResponse toggleViewerControl() {
    return this.pluginService.toggleViewerControl();
  }

  @POST
  @Path("/updateViewerControl")
  @Produces(MediaType.APPLICATION_JSON)
  @Consumes(MediaType.APPLICATION_JSON)
  public PluginResponse updateViewerControl(ViewerControlRequest request) {
    return this.pluginService.updateViewerControl(request);
  }

  @POST
  @Path("/updateManagedPsa")
  @Produces(MediaType.APPLICATION_JSON)
  @Consumes(MediaType.APPLICATION_JSON)
  public PluginResponse updateManagedPsa(ManagedPSARequest request) {
    return this.pluginService.updateManagedPsa(request);
  }

  @POST
  @Path("/fppHeartbeat")
  @Produces(MediaType.APPLICATION_JSON)
  @Consumes(MediaType.APPLICATION_JSON)
  public void fppHeartbeat() {
    this.pluginService.fppHeartbeat();
  }

  @GET
  @Path("/actuator/health")
  @Produces(MediaType.APPLICATION_JSON)
  @Consumes(MediaType.APPLICATION_JSON)
  public Health health() {
    return Health.builder()
        .status("UP")
        .build();
  }
}
