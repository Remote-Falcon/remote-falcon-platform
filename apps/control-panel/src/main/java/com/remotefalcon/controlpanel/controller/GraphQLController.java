package com.remotefalcon.controlpanel.controller;

import com.remotefalcon.controlpanel.aop.RequiresAccess;
import com.remotefalcon.controlpanel.aop.RequiresAdminAccess;
import com.remotefalcon.controlpanel.response.ShowsOnAMap;
import com.remotefalcon.library.documents.Notification;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.*;
import com.remotefalcon.controlpanel.response.dashboard.DashboardLiveStatsResponse;
import com.remotefalcon.controlpanel.response.dashboard.DashboardStatsResponse;
import com.remotefalcon.controlpanel.service.DashboardService;
import com.remotefalcon.controlpanel.service.GraphQLMutationService;
import com.remotefalcon.controlpanel.service.GraphQLQueryService;
import com.remotefalcon.controlpanel.service.LaunchExternalEditorService;
import lombok.RequiredArgsConstructor;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.MutationMapping;
import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class GraphQLController {
    private final GraphQLMutationService graphQLMutationService;
    private final GraphQLQueryService graphQLQueryService;
    private final DashboardService dashboardService;
    private final LaunchExternalEditorService launchExternalEditorService;

    /********
    Mutations
     ********/
    @MutationMapping
    public Boolean signUp(@Argument String firstName, @Argument String lastName, @Argument String showName) {
        return graphQLMutationService.signUp(firstName, lastName, showName);
    }

    @MutationMapping
    public Boolean forgotPassword(@Argument String email) {
        return graphQLMutationService.forgotPassword(email);
    }

    @MutationMapping
    public Boolean verifyEmail(@Argument String showToken) {
        return graphQLMutationService.verifyEmail(showToken);
    }

    @MutationMapping
    @RequiresAccess
    public Boolean resetPassword() {
        return this.graphQLMutationService.resetPassword();
    }

    @MutationMapping
    @RequiresAccess
    public Boolean updatePassword() {
        return this.graphQLMutationService.updatePassword();
    }

    @MutationMapping
    @RequiresAccess
    public Boolean updateUserProfile(@Argument UserProfile userProfile) {
        return this.graphQLMutationService.updateUserProfile(userProfile);
    }

    @MutationMapping
    @RequiresAccess
    public ApiAccess requestApiAccess() {
        return this.graphQLMutationService.requestApiAccess();
    }

    @MutationMapping
    @RequiresAccess
    public String refreshApiSecret() {
        return this.graphQLMutationService.refreshApiSecret();
    }

    @MutationMapping
    @RequiresAccess
    public Boolean deleteAccount() {
        return this.graphQLMutationService.deleteAccount();
    }

    @MutationMapping
    @RequiresAccess
    public Boolean updateShow(@Argument String email, @Argument String showName) {
        return this.graphQLMutationService.updateShow(email, showName);
    }

    @MutationMapping
    @RequiresAccess
    public Boolean updatePreferences(@Argument Preference preferences) {
        return this.graphQLMutationService.updatePreferences(preferences);
    }

    @MutationMapping
    @RequiresAccess
    public List<ViewerPage> updatePages(@Argument List<ViewerPage> pages) {
        return this.graphQLMutationService.updatePages(pages);
    }

    /**
     * Mint a launch URL handing the show owner off to RF Page Builder for
     * the named viewer page. Returns the full {@code https://rfpagebuilder
     * .com/launch?token=<jwt>} URL; the UI does {@code window.location
     * .assign(url)}. See {@link LaunchExternalEditorService}.
     *
     * <p>{@code pageId} is a String at the GraphQL boundary because the
     * schema doesn't define a UUID scalar; the service parses + validates.
     */
    @MutationMapping
    @RequiresAccess
    public String launchExternalEditor(@Argument String pageId) {
        return this.launchExternalEditorService.mintLaunchUrl(pageId);
    }

    @MutationMapping
    @RequiresAccess
    public Boolean updatePsaSequences(@Argument List<PsaSequence> psaSequences) {
        return this.graphQLMutationService.updatePsaSequences(psaSequences);
    }

    // PSA-v2 PR-5 (Q1) — per-PSA enabled toggle. Targeted mutation
    // instead of a wholesale updatePsaSequences write because the
    // Special Roles tab toggles a single row at a time.
    @MutationMapping
    @RequiresAccess
    public Boolean updatePsaEnabled(@Argument String name, @Argument Boolean enabled) {
        return this.graphQLMutationService.updatePsaEnabled(name, enabled);
    }

    // PSA-v2 PR-5 (Q7) — operator pick of the next PSA. Null/empty
    // clears the pending override.
    @MutationMapping
    @RequiresAccess
    public Boolean setNextPsaOverride(@Argument String name) {
        return this.graphQLMutationService.setNextPsaOverride(name);
    }

    // PSA-v2 PR-5 (Q6) — leader sequence dropdowns on the Special
    // Roles tab. Each leader has its own mutation so the UI can save
    // the two fields independently without re-sending the other.
    @MutationMapping
    @RequiresAccess
    public Boolean setRequestLeaderSequence(@Argument String name) {
        return this.graphQLMutationService.setRequestLeaderSequence(name);
    }

    @MutationMapping
    @RequiresAccess
    public Boolean setVoteLeaderSequence(@Argument String name) {
        return this.graphQLMutationService.setVoteLeaderSequence(name);
    }

    @MutationMapping
    @RequiresAccess
    public Boolean updateSequences(@Argument List<Sequence> sequences) {
        return this.graphQLMutationService.updateSequences(sequences);
    }

    @MutationMapping
    @RequiresAccess
    public Boolean updateSequenceGroups(@Argument List<SequenceGroup> sequenceGroups) {
        return this.graphQLMutationService.updateSequenceGroups(sequenceGroups);
    }

    @MutationMapping
    @RequiresAccess
    public Boolean playSequenceFromControlPanel(@Argument Sequence sequence) {
        return this.graphQLMutationService.playSequenceFromControlPanel(sequence);
    }

    @MutationMapping
    @RequiresAccess
    public Boolean deleteSingleRequest(@Argument Integer position) {
        return this.graphQLMutationService.deleteSingleRequest(position);
    }

    @MutationMapping
    @RequiresAccess
    public Boolean deleteAllRequests() {
        return this.graphQLMutationService.deleteAllRequests();
    }

    @MutationMapping
    @RequiresAccess
    public Boolean resetAllVotes() {
        return this.graphQLMutationService.resetAllVotes();
    }

    @MutationMapping
    @RequiresAdminAccess
    public Boolean adminUpdateShow(@Argument Show show) {
        return this.graphQLMutationService.adminUpdateShow(show);
    }

    @MutationMapping
    @RequiresAccess
    public Boolean deleteNowPlaying() {
        return this.graphQLMutationService.deleteNowPlaying();
    }

    @MutationMapping
    @RequiresAccess
    public Boolean purgeStats() {
        return this.graphQLMutationService.purgeStats();
    }

    @MutationMapping
    @RequiresAccess
    public Boolean deleteStatsWithinRange(@Argument Long startDate, @Argument Long endDate, @Argument String timezone) {
        return this.graphQLMutationService.deleteStatsWithinRange(startDate, endDate, timezone);
    }

    @MutationMapping
    @RequiresAdminAccess
    public Boolean createNotification(@Argument Notification notification) {
        return this.graphQLMutationService.createNotification(notification);
    }

    @MutationMapping
    @RequiresAdminAccess
    public Boolean createNotificationForUser(@Argument Notification notification, @Argument String showSubdomain) {
        return this.graphQLMutationService.createNotificationForUser(notification, showSubdomain);
    }

    @MutationMapping
    @RequiresAdminAccess
    public Boolean deleteNotification(@Argument String uuid) {
        return this.graphQLMutationService.deleteNotification(uuid);
    }

    @MutationMapping
    @RequiresAdminAccess
    public Boolean updateNotification(@Argument String uuid, @Argument Notification notification) {
        return this.graphQLMutationService.updateNotification(uuid, notification);
    }



    /*******
     Queries
     *******/
    @QueryMapping
    public Show signIn() {
        return graphQLQueryService.signIn();
    }

    @QueryMapping
    @RequiresAdminAccess
    public Show impersonateShow(@Argument String showSubdomain) {
        return graphQLQueryService.impersonateShow(showSubdomain);
    }

    @QueryMapping
    @RequiresAdminAccess
    public List<String> getShowsAutoSuggest(@Argument String showName) {
        return graphQLQueryService.getShowsAutoSuggest(showName);
    }

    @QueryMapping
    public Show verifyPasswordResetLink(@Argument String passwordResetLink) {
        return graphQLQueryService.verifyPasswordResetLink(passwordResetLink);
    }

    @QueryMapping
    @RequiresAccess()
    public Show getShow() {
        return graphQLQueryService.getShow();
    }

    @QueryMapping
    @RequiresAccess()
    public DashboardStatsResponse dashboardStats(@Argument Long startDate, @Argument Long endDate, @Argument String timezone) {
        return dashboardService.dashboardStats(startDate, endDate, timezone);
    }

    @QueryMapping
    @RequiresAccess()
    public DashboardLiveStatsResponse dashboardLiveStats(@Argument Long startDate, @Argument Long endDate, @Argument String timezone) {
        return dashboardService.dashboardLiveStats(startDate, endDate, timezone);
    }

    @QueryMapping
    @RequiresAccess()
    public com.remotefalcon.controlpanel.response.dashboard.DashboardHourlyStatsResponse dashboardStatsByHour(@Argument Long startDate, @Argument Long endDate, @Argument String timezone) {
        return dashboardService.dashboardStatsByHour(startDate, endDate, timezone);
    }

    @QueryMapping
    @RequiresAccess()
    public com.remotefalcon.controlpanel.response.dashboard.ViewerSessionsResponse viewerSessions(@Argument Long startDate, @Argument Long endDate, @Argument String timezone) {
        return dashboardService.viewerSessions(startDate, endDate, timezone);
    }

    // V15 — request → play conversion funnel for the Sequences analytics tab.
    @QueryMapping
    @RequiresAccess()
    public com.remotefalcon.controlpanel.response.dashboard.RequestConversionResponse requestConversion(@Argument Long startDate, @Argument Long endDate, @Argument String timezone) {
        return dashboardService.requestConversion(startDate, endDate, timezone);
    }

    // V16 — PSA effectiveness panel for the Sequences analytics tab.
    @QueryMapping
    @RequiresAccess()
    public com.remotefalcon.controlpanel.response.dashboard.PsaEffectivenessResponse psaEffectiveness(@Argument String timezone) {
        return dashboardService.psaEffectiveness(timezone);
    }

    // PUBLIC — no @RequiresAccess. Anyone with the show's wrappedShareToken
    // (a CSPRNG-random capability URL) can pull the season summary. The
    // token IS the credential; subdomain enumeration is not a route here.
    @QueryMapping
    public com.remotefalcon.controlpanel.response.dashboard.WrappedSummaryResponse wrappedSummary(
            @Argument String token,
            @Argument String season,
            @Argument Integer year,
            @Argument String timezone) {
        return dashboardService.wrappedSummary(token, season, year, timezone);
    }

    @QueryMapping
    @RequiresAccess()
    public List<ShowsOnAMap> showsOnAMap() {
        return graphQLQueryService.showsOnAMap();
    }

    @QueryMapping
    @RequiresAdminAccess
    public Show getShowByShowName(@Argument String showName) {
        return graphQLQueryService.getShowByShowName(showName);
    }

    @QueryMapping
    @RequiresAccess
    public List<NotificationModel> getNotifications() {
        return this.graphQLQueryService.getNotifications();
    }

    @QueryMapping
    @RequiresAdminAccess
    public NotificationPage listAdminNotifications(@Argument Integer offset, @Argument Integer limit) {
        return this.graphQLQueryService.listAdminNotifications(offset, limit);
    }

}
