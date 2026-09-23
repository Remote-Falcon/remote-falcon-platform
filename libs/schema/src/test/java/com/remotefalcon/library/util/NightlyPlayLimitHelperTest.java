package com.remotefalcon.library.util;

import com.remotefalcon.library.models.Category;
import com.remotefalcon.library.models.Sequence;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The null / 0 / &gt;0 matrix pinned here is the contract shared by the plugin's
 * play selection, the viewer's request rejection, and the viewer page's
 * gray-out. The JS mirror (sequenceAvailability.test.js) pins the same cases;
 * if the two ever disagree, a viewer sees a song they cannot request or
 * requests one that is then silently skipped.
 */
class NightlyPlayLimitHelperTest {

  private static Category category(String name, Integer nightlyPlayLimit) {
    return Category.builder().name(name).nightlyPlayLimit(nightlyPlayLimit).build();
  }

  private static Sequence sequence(String categoryName, Integer playsToday) {
    return Sequence.builder().name("song").category(categoryName).playsToday(playsToday).build();
  }

  @Nested
  @DisplayName("effectiveLimit")
  class EffectiveLimit {

    @Test
    void nullOverrideInheritsTheShowLimit() {
      List<Category> categories = List.of(category("Classic", null));
      assertEquals(3, NightlyPlayLimitHelper.effectiveLimit(3, "Classic", categories));
    }

    @Test
    void zeroOverrideExemptsTheCategory() {
      List<Category> categories = List.of(category("Kids", 0));
      assertEquals(0, NightlyPlayLimitHelper.effectiveLimit(3, "Kids", categories));
    }

    @Test
    void positiveOverrideWinsOverTheShowLimit() {
      List<Category> categories = List.of(category("Classic", 7));
      assertEquals(7, NightlyPlayLimitHelper.effectiveLimit(3, "Classic", categories));
    }

    @Test
    void anOverrideAppliesEvenWhenTheShowSetsNoLimit() {
      // The operator capped only one category and left the show uncapped.
      List<Category> categories = List.of(category("Novelty", 2));
      assertEquals(2, NightlyPlayLimitHelper.effectiveLimit(null, "Novelty", categories));
      assertEquals(2, NightlyPlayLimitHelper.effectiveLimit(0, "Novelty", categories));
    }

    @Test
    void uncategorizedSongsUseTheShowLimit() {
      List<Category> categories = List.of(category("Kids", 0));
      assertEquals(3, NightlyPlayLimitHelper.effectiveLimit(3, null, categories));
      assertEquals(3, NightlyPlayLimitHelper.effectiveLimit(3, "", categories));
    }

    @Test
    void aCategoryThatNoLongerExistsFallsBackToTheShowLimit() {
      // Renaming or deleting a category must not silently exempt its songs.
      List<Category> categories = List.of(category("Kids", 0));
      assertEquals(3, NightlyPlayLimitHelper.effectiveLimit(3, "Deleted", categories));
    }

    @Test
    void matchesCategoryNameCaseInsensitively() {
      List<Category> categories = List.of(category("Kids", 0));
      assertEquals(0, NightlyPlayLimitHelper.effectiveLimit(3, "kids", categories));
    }

    @Test
    void toleratesNullAndMalformedCategoryLists() {
      assertEquals(3, NightlyPlayLimitHelper.effectiveLimit(3, "Classic", null));
      assertEquals(3, NightlyPlayLimitHelper.effectiveLimit(3, "Classic", List.of()));
      List<Category> withJunk = java.util.Arrays.asList(null, category(null, 0), category("Classic", 5));
      assertEquals(5, NightlyPlayLimitHelper.effectiveLimit(3, "Classic", withJunk));
    }

    @Test
    void returnsNullWhenNothingSetsALimit() {
      assertNull(NightlyPlayLimitHelper.effectiveLimit(null, "Classic", List.of(category("Classic", null))));
    }
  }

  @Nested
  @DisplayName("isCapped")
  class IsCapped {

    @Test
    void cappedOncePlaysReachTheShowLimit() {
      List<Category> categories = List.of(category("Classic", null));
      assertFalse(NightlyPlayLimitHelper.isCapped(sequence("Classic", 2), 3, categories));
      assertTrue(NightlyPlayLimitHelper.isCapped(sequence("Classic", 3), 3, categories));
      assertTrue(NightlyPlayLimitHelper.isCapped(sequence("Classic", 4), 3, categories));
    }

    @Test
    void anExemptCategoryIsNeverCapped() {
      // The whole point of the feature: Bluey keeps playing.
      List<Category> categories = List.of(category("Kids", 0));
      assertFalse(NightlyPlayLimitHelper.isCapped(sequence("Kids", 99), 3, categories));
    }

    @Test
    void anOverriddenCategoryUsesItsOwnThreshold() {
      List<Category> categories = List.of(category("Classic", 7));
      assertFalse(NightlyPlayLimitHelper.isCapped(sequence("Classic", 6), 3, categories));
      assertTrue(NightlyPlayLimitHelper.isCapped(sequence("Classic", 7), 3, categories));
    }

    @Test
    void neverCappedWhenNoLimitApplies() {
      assertFalse(NightlyPlayLimitHelper.isCapped(sequence("Classic", 99), null, List.of()));
      assertFalse(NightlyPlayLimitHelper.isCapped(sequence("Classic", 99), 0, List.of()));
    }

    @Test
    void neverCappedBeforeAnythingHasPlayed() {
      List<Category> categories = List.of(category("Classic", null));
      assertFalse(NightlyPlayLimitHelper.isCapped(sequence("Classic", null), 3, categories));
      assertFalse(NightlyPlayLimitHelper.isCapped(sequence("Classic", 0), 3, categories));
    }

    @Test
    void toleratesANullSequence() {
      assertFalse(NightlyPlayLimitHelper.isCapped(null, 3, List.of()));
    }
  }

  @Nested
  @DisplayName("isGroupCapped")
  class IsGroupCapped {

    private Sequence member(String group, String categoryName, Integer playsToday) {
      return Sequence.builder().name("song-" + playsToday).group(group)
          .category(categoryName).playsToday(playsToday).build();
    }

    @Test
    void cappedAsSoonAsAnyMemberIs() {
      // Requesting or voting a group queues/plays every member, so one capped
      // member makes the whole group unplayable. #177 closed the bypass that
      // exempted groups from the cap entirely.
      List<Sequence> sequences = List.of(
          member("Sing-alongs", "Classic", 0),
          member("Sing-alongs", "Classic", 3));
      assertTrue(NightlyPlayLimitHelper.isGroupCapped("Sing-alongs", sequences, 3, List.of()));
    }

    @Test
    void notCappedWhileEveryMemberIsUnderTheLimit() {
      List<Sequence> sequences = List.of(
          member("Sing-alongs", "Classic", 1),
          member("Sing-alongs", "Classic", 2));
      assertFalse(NightlyPlayLimitHelper.isGroupCapped("Sing-alongs", sequences, 3, List.of()));
    }

    @Test
    void resolvesEachMemberAgainstItsOwnCategory() {
      List<Category> categories = List.of(category("Kids", 0), category("Classic", null));
      // An exempt member can't cap the group however often it has played.
      List<Sequence> exempt = List.of(
          member("Mixed", "Kids", 99),
          member("Mixed", "Classic", 1));
      assertFalse(NightlyPlayLimitHelper.isGroupCapped("Mixed", exempt, 3, categories));

      List<Sequence> oneCapped = List.of(
          member("Mixed", "Kids", 99),
          member("Mixed", "Classic", 3));
      assertTrue(NightlyPlayLimitHelper.isGroupCapped("Mixed", oneCapped, 3, categories));
    }

    @Test
    void ignoresMembersOfOtherGroups() {
      List<Sequence> sequences = List.of(
          member("Other", "Classic", 3),
          member("Sing-alongs", "Classic", 0));
      assertFalse(NightlyPlayLimitHelper.isGroupCapped("Sing-alongs", sequences, 3, List.of()));
    }

    @Test
    void matchesGroupNameCaseInsensitively() {
      List<Sequence> sequences = List.of(member("Sing-alongs", "Classic", 3));
      assertTrue(NightlyPlayLimitHelper.isGroupCapped("sing-alongs", sequences, 3, List.of()));
    }

    @Test
    void anEmptyOrUnknownGroupIsNeverCapped() {
      assertFalse(NightlyPlayLimitHelper.isGroupCapped("Nobody",
          List.of(member("Other", "Classic", 9)), 3, List.of()));
      assertFalse(NightlyPlayLimitHelper.isGroupCapped("Sing-alongs", List.of(), 3, List.of()));
    }

    @Test
    void toleratesNullInputs() {
      assertFalse(NightlyPlayLimitHelper.isGroupCapped(null, List.of(), 3, List.of()));
      assertFalse(NightlyPlayLimitHelper.isGroupCapped("  ", List.of(), 3, List.of()));
      assertFalse(NightlyPlayLimitHelper.isGroupCapped("Sing-alongs", null, 3, List.of()));
      assertFalse(NightlyPlayLimitHelper.isGroupCapped("Sing-alongs",
          java.util.Collections.singletonList(null), 3, List.of()));
    }

    @Test
    void notCappedWhenNoLimitApplies() {
      List<Sequence> sequences = List.of(member("Sing-alongs", "Classic", 99));
      assertFalse(NightlyPlayLimitHelper.isGroupCapped("Sing-alongs", sequences, null, List.of()));
      assertFalse(NightlyPlayLimitHelper.isGroupCapped("Sing-alongs", sequences, 0, List.of()));
    }
  }

  @Nested
  @DisplayName("anyLimitActive")
  class AnyLimitActive {

    @Test
    void trueWhenTheShowSetsALimit() {
      assertTrue(NightlyPlayLimitHelper.anyLimitActive(3, List.of()));
    }

    @Test
    void trueWhenOnlyACategorySetsOne() {
      // The short-circuit this guards: a show limit of 0 no longer proves
      // nothing in the show is capped.
      assertTrue(NightlyPlayLimitHelper.anyLimitActive(0, List.of(category("Novelty", 2))));
      assertTrue(NightlyPlayLimitHelper.anyLimitActive(null, List.of(category("Novelty", 2))));
    }

    @Test
    void falseWhenNothingSetsALimit() {
      assertFalse(NightlyPlayLimitHelper.anyLimitActive(null, null));
      assertFalse(NightlyPlayLimitHelper.anyLimitActive(0, List.of()));
      assertFalse(NightlyPlayLimitHelper.anyLimitActive(0, List.of(category("Kids", 0))));
      assertFalse(NightlyPlayLimitHelper.anyLimitActive(null, List.of(category("Classic", null))));
    }
  }
}
