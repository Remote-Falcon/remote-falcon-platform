package com.remotefalcon.external.api.response;

import com.remotefalcon.library.enums.LocationCheckMethod;
import com.remotefalcon.library.enums.ViewerControlMode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Builder
@Data
@AllArgsConstructor
@NoArgsConstructor
public class ShowResponse {
    private Preference preferences;
    private List<Sequence> sequences;
    private List<SequenceGroup> sequenceGroups;
    private List<Request> requests;
    private List<Vote> votes;
    private String playingNow;
    private String playingNext;
    private String playingNextFromSchedule;

    @Builder
    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class Preference {
        private Boolean viewerControlEnabled;
        private ViewerControlMode viewerControlMode;
        private Boolean resetVotes;
        private Integer jukeboxDepth;
        private LocationCheckMethod locationCheckMethod;
        private Float showLatitude;
        private Float showLongitude;
        private Float allowedRadius;
        private Integer jukeboxRequestLimit;
        private Integer locationCode;
        private Integer hideSequenceCount;
        private Boolean makeItSnow;
    }

    @Builder
    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class Sequence {
        private String name;
        private String displayName;
        private Integer duration;
        private Boolean visible;
        private Integer index;
        private Integer order;
        private Boolean active;
        private Integer visibilityCount;
        private String type;
        private String group;
        private String category;
        private String artist;
        private String imageUrl;
    }

    @Builder
    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class SequenceGroup {
        private String name;
        private Integer visibilityCount;
    }

    @Builder
    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class Request {
        private Sequence sequence;
        private Integer position;
        private String viewerRequested;
        private Boolean ownerRequested;
    }

    @Builder
    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class Vote {
        private Sequence sequence;
        private SequenceGroup sequenceGroup;
        private Integer votes;
        private List<String> viewersVoted;
        private String lastVoteTime;
        private Boolean ownerVoted;
    }
}
