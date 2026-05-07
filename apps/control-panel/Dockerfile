# Build context: monorepo root (..)
# Dockerfile path: apps/control-panel/Dockerfile
#
# This Dockerfile expects the build context to be the monorepo root so that
# libs/schema (the shared MongoDB entity model) can be installed into a
# Maven repo cache before the GraalVM native build resolves it.

# Stage 0: build libs/schema on JDK 17 (matches its <java.version>17</java.version>).
# Why a separate stage: the schema lib inherits Lombok via spring-boot-starter-parent
# 3.1.0, which doesn't support JDK 21's compiler internals (JCImport.qualid changed).
# Building on JDK 17 avoids the issue without bumping Lombok org-wide.
FROM maven:3-eclipse-temurin-17 AS schema-build
WORKDIR /lib
COPY libs/schema/pom.xml .
COPY libs/schema/src ./src
RUN mvn install -DskipTests -B

# Stage 1: GraalVM 21 native build for the service, inheriting the schema jar.
FROM ghcr.io/graalvm/native-image-community:21 AS build
WORKDIR /usr/src/app
RUN microdnf install -y maven && microdnf clean all
COPY --from=schema-build /root/.m2/repository /root/.m2/repository
COPY apps/control-panel/pom.xml .
COPY apps/control-panel/src ./src
# -Dmaven.test.skip=true (not -DskipTests) so test-scope deps aren't resolved
# here. control-panel now has libs/test-fixtures + testcontainers in test
# scope; resolving them in this build context would require installing
# libs/test-fixtures into mavenLocal first. Tests run in CI's test-unit job.
RUN mvn -Pnative -Dmaven.test.skip=true package

FROM registry.access.redhat.com/ubi9/ubi-minimal:9.2
WORKDIR /usr/app
RUN microdnf install -y zlib && microdnf clean all
COPY --from=build /usr/src/app/target/remote-falcon-control-panel /usr/app/remote-falcon-control-panel
EXPOSE 8080
ENTRYPOINT ["/usr/app/remote-falcon-control-panel"]
