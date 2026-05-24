# Build context: monorepo root (..)
# Dockerfile path: apps/external-api/Dockerfile
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

# Stage 0b: build libs/auth on the same JDK 17. Added 2026-05-24 for PR-B
# of the RFPB integration — external-api consumes LaunchTokenVerifier
# from this module on POST /v1/sessions/exchange.
FROM maven:3-eclipse-temurin-17 AS auth-build
WORKDIR /lib
COPY libs/auth/pom.xml .
COPY libs/auth/src ./src
RUN mvn install -DskipTests -B

# Stage 1: GraalVM 21 native build for the service, inheriting both jars.
FROM ghcr.io/graalvm/native-image-community:21 AS build
WORKDIR /usr/src/app
RUN microdnf install -y maven && microdnf clean all
COPY --from=schema-build /root/.m2/repository /root/.m2/repository
COPY --from=auth-build /root/.m2/repository /root/.m2/repository
COPY apps/external-api/pom.xml .
COPY apps/external-api/src ./src
RUN mvn -Pnative -DskipTests package

FROM registry.access.redhat.com/ubi9/ubi-minimal:9.2
WORKDIR /usr/app
RUN microdnf install -y zlib && microdnf clean all
COPY --from=build /usr/src/app/target/remote-falcon-external-api /usr/app/remote-falcon-external-api
EXPOSE 8080
ENTRYPOINT ["/usr/app/remote-falcon-external-api"]
