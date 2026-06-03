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
}
