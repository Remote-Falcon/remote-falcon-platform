package com.remotefalcon.library.models;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.eclipse.microprofile.graphql.Type;

/**
 * First-class sequence category — PRD-remote-falcon-009 (#128), ADR-3.
 *
 * <p>Promotes the free-text {@code Sequence.category} into a managed entity that
 * carries the Cluster A fairness attributes. Distinct from {@link SequenceGroup}:
 * a group bundles sequences to be requested/voted as one unit, whereas a category
 * classifies sequences and carries limits.
 *
 * <p>The fairness attributes ({@code requestLimit}, {@code antiConsecutive}) are
 * enforced in later phases — request-time limits in the viewer rule chain (#72)
 * and play-selection rules in plugins-api (#109). This change only establishes
 * the entity + the {@code Show.categories} field.
 */
@Type
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Category {
    private String name;
    private Integer requestLimit;
    private Boolean antiConsecutive;
    private String color;
    private Integer displayOrder;
}
