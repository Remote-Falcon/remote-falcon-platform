package com.remotefalcon.library;

import com.remotefalcon.library.documents.Show;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Cross-variant schema contract for the {@code Show} document.
 *
 * <p>libs/schema ships two parallel {@code Show} classes that map onto the same
 * Mongo {@code show} collection:
 * <ul>
 *   <li>{@link com.remotefalcon.library.documents.Show} — Spring Data
 *       ({@code @Document}); used by control-panel and external-api.</li>
 *   <li>{@link com.remotefalcon.library.quarkus.entity.Show} — Quarkus Panache
 *       ({@code @MongoEntity}); used by viewer, plugins-api, account-archive.</li>
 * </ul>
 *
 * <p>If a field exists on one variant but not the other, services that read a
 * document written by the other variant will silently drop that field on the
 * next round-trip. There is no production code path that catches this — the
 * variants don't reference each other and the library has no contract tests.
 *
 * <p>This test enumerates declared instance fields on both classes via
 * reflection (most-direct contract; the two classes use different ORM and
 * GraphQL annotations so an annotation-driven check would be noisy) and asserts
 * the field-name sets match and shared-name fields have compatible types.
 *
 * <p><b>Handling a legitimate divergence:</b> add the field to
 * {@link #EXEMPT_FIELDS} keyed by the variant that owns it
 * ({@code "documents"} or {@code "quarkus"}), with an inline comment justifying
 * why the asymmetry is intentional and how the data still survives round-trip.
 */
class ShowSchemaContractTest {

    /**
     * Field names that legitimately differ between the two Show variants.
     * Format: {@code Map.entry(variant, fieldName)} where variant is
     * {@code "documents"} or {@code "quarkus"}.
     *
     * <p>Currently empty — the {@code id} field on the Spring variant has a
     * matching {@code id} inherited from {@code PanacheMongoEntity} on the
     * Quarkus variant, so reflective inclusion of inherited fields keeps them
     * in sync. If you need to add an exemption, document why here.
     */
    private static final Set<String> EXEMPT_FIELDS = Set.of();

    /**
     * Field names whose Java type legitimately differs between variants but
     * whose Mongo BSON representation is interchangeable.
     *
     * <p>{@code id}: Spring Data Show declares {@code String id}; Quarkus Show
     * inherits {@code ObjectId id} from {@code PanacheMongoEntity}. The Mongo
     * driver coerces between the two on read, so cross-variant round-trip is
     * safe in practice. Aligning the Java types would require choosing one
     * stack's idiom and forcing the other to wrap — not worth the churn.
     */
    private static final Set<String> EXEMPT_TYPE_FIELDS = Set.of("id");

    private static final Class<?> SPRING_SHOW = com.remotefalcon.library.documents.Show.class;
    private static final Class<?> QUARKUS_SHOW = com.remotefalcon.library.quarkus.entity.Show.class;

    @Test
    void bothShowVariantsDeclareSameFieldSet() {
        Set<String> spring = persistedFieldNames(SPRING_SHOW);
        Set<String> quarkus = persistedFieldNames(QUARKUS_SHOW);

        Set<String> onlyOnSpring = new TreeSet<>(spring);
        onlyOnSpring.removeAll(quarkus);
        onlyOnSpring.removeAll(EXEMPT_FIELDS);

        Set<String> onlyOnQuarkus = new TreeSet<>(quarkus);
        onlyOnQuarkus.removeAll(spring);
        onlyOnQuarkus.removeAll(EXEMPT_FIELDS);

        assertThat(onlyOnSpring)
                .as("fields present only on Spring Data Show (would silently drop on Quarkus round-trip)")
                .isEmpty();
        assertThat(onlyOnQuarkus)
                .as("fields present only on Quarkus Show (would silently drop on Spring Data round-trip)")
                .isEmpty();
    }

    @Test
    void sharedFieldsHaveCompatibleTypes() {
        var springTypes = persistedFieldTypes(SPRING_SHOW);
        var quarkusTypes = persistedFieldTypes(QUARKUS_SHOW);

        var mismatches = new TreeMap<String, String>();
        for (var name : springTypes.keySet()) {
            if (!quarkusTypes.containsKey(name)) continue;
            if (EXEMPT_TYPE_FIELDS.contains(name)) continue;
            String s = springTypes.get(name);
            String q = quarkusTypes.get(name);
            if (!s.equals(q)) {
                mismatches.put(name, "spring=" + s + " quarkus=" + q);
            }
        }
        assertThat(mismatches)
                .as("shared field types must match between Show variants")
                .isEmpty();
    }

    /** Walks the class and its superclasses, collecting non-static, non-synthetic instance field names. */
    private static Set<String> persistedFieldNames(Class<?> clazz) {
        return persistedFields(clazz)
                .map(Field::getName)
                .collect(Collectors.toCollection(TreeSet::new));
    }

    private static java.util.Map<String, String> persistedFieldTypes(Class<?> clazz) {
        var map = new TreeMap<String, String>();
        persistedFields(clazz).forEach(f -> map.put(f.getName(), f.getType().getSimpleName()));
        return map;
    }

    private static java.util.stream.Stream<Field> persistedFields(Class<?> clazz) {
        var fields = new java.util.ArrayList<Field>();
        for (Class<?> c = clazz; c != null && c != Object.class; c = c.getSuperclass()) {
            for (Field f : c.getDeclaredFields()) {
                if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
                if (f.isSynthetic()) continue;
                // Lombok @Builder may generate a synthetic-ish $default field on some variants.
                if (f.getName().startsWith("$")) continue;
                fields.add(f);
            }
        }
        return fields.stream();
    }
}
