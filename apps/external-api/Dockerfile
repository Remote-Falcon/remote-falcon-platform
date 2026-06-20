# Build context: monorepo root (..)
# Dockerfile path: apps/external-api/Dockerfile
#
# This Dockerfile expects the build context to be the monorepo root so that
# libs/schema (the shared MongoDB entity model), libs/test-fixtures and
# libs/auth can be installed into a Maven repo cache before the GraalVM
# native build resolves them.

# Single build stage: GraalVM 21. Maven is installed here, the three shared
# libs are built into mavenLocal, then the service native image is built.
#
# History (#119): the shared libs used to be built in separate
# maven:3-eclipse-temurin-17 stages because spring-boot-starter-parent 3.1.0
# pulled a Lombok that couldn't compile under JDK 21 (JCImport.qualid). The
# lombok 1.18.34 override in libs/schema/pom.xml resolves that, so the libs now
# compile on JDK 21 and build in-place here, on the same JDK 21 that already
# has Maven for the service build.
FROM ghcr.io/graalvm/native-image-community:21 AS build
WORKDIR /usr/src/app
RUN microdnf install -y maven && microdnf clean all

# Build the shared libs into mavenLocal (JDK 21). Order matters: test-fixtures
# depends on schema. external-api declares test-fixtures as a test-scope dep,
# so Maven resolves the full tree even with -DskipTests and all three must be
# present in mavenLocal (otherwise the native build fails resolving
# remote-falcon-test-fixtures:jar:1.0.0-LOCAL).
COPY libs/schema/pom.xml libs/schema/pom.xml
COPY libs/schema/src libs/schema/src
RUN mvn -f libs/schema/pom.xml install -DskipTests -B
COPY libs/test-fixtures/pom.xml libs/test-fixtures/pom.xml
COPY libs/test-fixtures/src libs/test-fixtures/src
RUN mvn -f libs/test-fixtures/pom.xml install -DskipTests -B
COPY libs/auth/pom.xml libs/auth/pom.xml
COPY libs/auth/src libs/auth/src
RUN mvn -f libs/auth/pom.xml install -DskipTests -B

COPY apps/external-api/pom.xml .
COPY apps/external-api/src ./src
RUN mvn -Pnative -DskipTests package

FROM registry.access.redhat.com/ubi9/ubi-minimal:9.2
WORKDIR /usr/app
RUN microdnf install -y zlib && microdnf clean all
COPY --from=build /usr/src/app/target/remote-falcon-external-api /usr/app/remote-falcon-external-api
EXPOSE 8080
ENTRYPOINT ["/usr/app/remote-falcon-external-api"]
