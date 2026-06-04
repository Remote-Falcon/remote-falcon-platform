package com.remotefalcon.library.models;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.eclipse.microprofile.graphql.Type;

import java.time.LocalDateTime;
import java.util.List;

@Type
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Vote {
    private Sequence sequence;
    private SequenceGroup sequenceGroup;
    private Integer votes;
    private List<String> viewersVoted;
    private LocalDateTime lastVoteTime;
    private Boolean ownerVoted;
    // PSA-v2 Q7 — marks a vote injected by an operator "Play Next" override
    // (setNextPsaOverride). Lets the cancel / single-shot-dedup paths find
    // and pull the override vote, which is otherwise indistinguishable from a
    // cadence-fired PSA vote (both at priority 2000). Null/absent on every
    // other vote. Distinct from ownerVoted, which means "the owner cast a
    // normal vote" and is read by the owner-vote winner logic.
    private Boolean ownerOverride;
    // PSA-v2 — marks any vote NOT cast by a viewer: PSA cadence/burst
    // injections, leader-promoted winners, grouped-winner ordering, and
    // operator "Play Next" overrides. These are written with a priority
    // sentinel (votes >= SYSTEM_VOTE_FLOOR) so they win the highest-vote
    // playback selection, but they are not audience actions and must be
    // excluded from any viewer-facing vote tally. Set true at every
    // injection site going forward; isSystemInjected() also treats the
    // sentinel band and ownerOverride as system so historical/unflagged
    // rows (e.g. accumulated jukebox-PSA votes) are classified correctly.
    private Boolean systemInjected;

    /**
     * Priority floor used by all non-viewer vote injections. Viewer votes
     * start at 1 (grouped: 1001) and increment by 1, so anything at or above
     * this value was injected by show policy / an operator, not a viewer.
     */
    public static final int SYSTEM_VOTE_FLOOR = 2000;

    /**
     * True when the given vote was injected by show policy or an operator
     * rather than cast by a viewer — so it must be excluded from viewer-facing
     * vote counts. Recognizes the explicit flag, the Q7 operator-override
     * marker, and the priority sentinel band (covers historical rows written
     * before the flag existed). A deliberate owner vote (ownerVoted, value
     * 1000) stays below the floor and is intentionally still counted.
     *
     * <p>Deliberately a static helper, not an {@code isSystemInjected()}
     * instance getter: Vote is a SmallRye GraphQL {@code @Type} and a Mongo
     * POJO, and a bean-style {@code isX()} method would collide with Lombok's
     * generated {@code getSystemInjected()} (both map to the property
     * {@code systemInjected}), breaking GraphQL schema build and
     * Jackson/Mongo serialization.
     */
    public static boolean isSystemInjected(Vote vote) {
        if (vote == null) {
            return false;
        }
        return Boolean.TRUE.equals(vote.getSystemInjected())
                || Boolean.TRUE.equals(vote.getOwnerOverride())
                || (vote.getVotes() != null && vote.getVotes() >= SYSTEM_VOTE_FLOOR);
    }
}
