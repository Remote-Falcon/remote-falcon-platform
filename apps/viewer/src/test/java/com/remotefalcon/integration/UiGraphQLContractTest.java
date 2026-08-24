package com.remotefalcon.integration;

import graphql.language.Document;
import graphql.language.OperationDefinition;
import graphql.language.ScalarTypeDefinition;
import graphql.parser.Parser;
import graphql.schema.GraphQLSchema;
import graphql.schema.idl.SchemaParser;
import graphql.schema.idl.TypeDefinitionRegistry;
import graphql.schema.idl.UnExecutableSchemaGenerator;
import graphql.validation.ValidationError;
import graphql.validation.Validator;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Contract test: every GraphQL document the UI's viewer page actually ships
 * (apps/ui/src/utils/graphql/viewer/*.jsx) must validate against the schema
 * this service actually generates.
 *
 * Exists because of the post-#150 outage: the UI added a locationPermission
 * argument to VoteForSequence that the server never declared, GraphQL failed
 * the mutation at validation, and every voting-mode show on the platform broke
 * for ~5 days. UI unit tests mock the mutation and Java tests only see the
 * server signature, so neither side can catch a client/server argument
 * mismatch — only validating the real documents against the real schema can.
 *
 * The schema is fetched from the running app (not a checked-in snapshot) so it
 * can never drift from the deployed truth.
 */
@QuarkusTest
class UiGraphQLContractTest {

  private static final Pattern GQL_TEMPLATE = Pattern.compile("gql`([^`]+)`");
  // Apollo MultiAPILink's client-side routing directive — stripped before
  // validation because the server schema (correctly) doesn't know it.
  private static final Pattern CLIENT_API_DIRECTIVE = Pattern.compile("@api\\([^)]*\\)");

  @BeforeAll
  static void setBasePath() {
    RestAssured.basePath = "/remote-falcon-viewer";
  }

  @Test
  @DisplayName("every UI viewer gql document validates against the generated schema")
  void uiDocumentsValidateAgainstSchema() throws IOException {
    // Fetched inside the test (not @BeforeAll) — Quarkus configures
    // RestAssured's test port only once test methods start.
    String schemaSdl = RestAssured.given()
        .when().get("/graphql/schema.graphql")
        .then().statusCode(200)
        .extract().asString();
    TypeDefinitionRegistry registry = new SchemaParser().parse(schemaSdl);
    // SmallRye's printed SDL references its scalars without declaring them;
    // declare any missing ones so graphql-java can build the schema. The
    // mocked wiring supplies stand-in coercing, which is fine for validation.
    for (String scalar : List.of("DateTime", "Date", "Time", "BigDecimal", "BigInteger")) {
      if (registry.getType(scalar).isEmpty()) {
        registry.add(ScalarTypeDefinition.newScalarTypeDefinition().name(scalar).build());
      }
    }
    GraphQLSchema schema = UnExecutableSchemaGenerator.makeUnExecutableSchema(registry);

    List<ExtractedDocument> documents = extractUiDocuments();

    // Canaries: if the path or the extraction regex silently breaks, this
    // fails loudly instead of the test degrading to validating nothing.
    List<String> names = documents.stream().map(d -> d.operationName).toList();
    assertTrue(names.contains("VoteForSequence"), "expected VoteForSequence among UI documents, got: " + names);
    assertTrue(names.contains("AddSequenceToQueue"), "expected AddSequenceToQueue among UI documents, got: " + names);
    assertTrue(names.contains("GetShowForViewer"), "expected GetShowForViewer among UI documents, got: " + names);

    List<String> failures = new ArrayList<>();
    Validator validator = new Validator();
    Parser parser = new Parser();
    for (ExtractedDocument doc : documents) {
      Document parsed = parser.parseDocument(doc.body);
      List<ValidationError> errors = validator.validateDocument(schema, parsed, Locale.ENGLISH);
      for (ValidationError error : errors) {
        failures.add(doc.sourceFile + " → " + doc.operationName + ": " + error.getMessage());
      }
    }

    assertTrue(failures.isEmpty(),
        "UI GraphQL documents no longer match the viewer schema — this is exactly "
            + "the mismatch that broke voting platform-wide post-#150. Fix the UI "
            + "document or add the argument/field to the schema, never ignore this:\n  "
            + String.join("\n  ", failures));
  }

  /**
   * The UI-side twin of this test (schemaContract.test.js) validates the same
   * documents on UI-only changes, which never trigger this module's CI job —
   * but it can only validate against a checked-in snapshot of the schema.
   * This keeps that snapshot honest: any schema change fails here until the
   * snapshot is regenerated, so the UI test never validates against stale SDL.
   */
  @Test
  @DisplayName("checked-in schema snapshot matches the generated schema")
  void schemaSnapshotIsCurrent() throws IOException {
    String servedSdl = RestAssured.given()
        .when().get("/graphql/schema.graphql")
        .then().statusCode(200)
        .extract().asString().trim();

    Path snapshot = resolveUiDocsDir().resolve("viewer-schema.snapshot.graphql");

    if (Boolean.getBoolean("updateViewerSchemaSnapshot")) {
      Files.writeString(snapshot, servedSdl + "\n");
      return;
    }

    assertTrue(Files.exists(snapshot), "missing schema snapshot at " + snapshot.toAbsolutePath()
        + " — regenerate with: ./gradlew test --tests '*UiGraphQLContractTest' -DupdateViewerSchemaSnapshot=true");
    assertEquals(Files.readString(snapshot).trim(), servedSdl,
        "the viewer schema changed but the checked-in snapshot the UI validates against did not — "
            + "regenerate with: ./gradlew test --tests '*UiGraphQLContractTest' -DupdateViewerSchemaSnapshot=true "
            + "and commit the updated viewer-schema.snapshot.graphql");
  }

  private List<ExtractedDocument> extractUiDocuments() throws IOException {
    Path docsDir = resolveUiDocsDir();
    List<ExtractedDocument> documents = new ArrayList<>();
    try (Stream<Path> files = Files.list(docsDir)) {
      for (Path file : files.filter(f -> f.getFileName().toString().endsWith(".jsx")).toList()) {
        String source = Files.readString(file);
        Matcher matcher = GQL_TEMPLATE.matcher(source);
        while (matcher.find()) {
          String body = CLIENT_API_DIRECTIVE.matcher(matcher.group(1)).replaceAll("");
          documents.add(new ExtractedDocument(file.getFileName().toString(), operationName(body), body));
        }
      }
    }
    assertFalse(documents.isEmpty(), "no gql documents extracted from " + docsDir.toAbsolutePath());
    return documents;
  }

  private static Path resolveUiDocsDir() {
    // Gradle runs tests with the module dir (apps/viewer) as working directory;
    // the repo-root fallback covers IDE runners configured differently.
    Path fromModule = Path.of("..", "ui", "src", "utils", "graphql", "viewer");
    if (Files.isDirectory(fromModule)) {
      return fromModule;
    }
    Path fromRepoRoot = Path.of("apps", "ui", "src", "utils", "graphql", "viewer");
    if (Files.isDirectory(fromRepoRoot)) {
      return fromRepoRoot;
    }
    return fail("cannot locate apps/ui/src/utils/graphql/viewer from " + Path.of("").toAbsolutePath()
        + " — if the UI documents moved, update this test rather than deleting it");
  }

  private static String operationName(String body) {
    return new Parser().parseDocument(body).getDefinitions().stream()
        .filter(OperationDefinition.class::isInstance)
        .map(d -> ((OperationDefinition) d).getName())
        .findFirst()
        .orElse("<anonymous>");
  }

  private record ExtractedDocument(String sourceFile, String operationName, String body) {
  }
}
