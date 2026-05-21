# Build context: monorepo root (..)
# Dockerfile path: apps/plugins-api/Dockerfile
#
# This Dockerfile expects the build context to be the monorepo root so that
# libs/schema (the shared MongoDB entity model) can be installed into a
# Maven repo cache before the Quarkus/Gradle build resolves it.

# Stage 0: build libs/schema using a Maven-equipped base image.
FROM maven:3-eclipse-temurin-17 AS schema-build
WORKDIR /lib
COPY libs/schema/pom.xml .
COPY libs/schema/src ./src
RUN mvn install -DskipTests -B

# Stage 1: GraalVM service build, inheriting the schema jar from .m2 cache.
FROM container-registry.oracle.com/graalvm/native-image:21 AS build
WORKDIR /app
COPY --from=schema-build /root/.m2/repository /root/.m2/repository
COPY apps/plugins-api/. .
RUN sed -i 's/\r$//' ./gradlew
RUN chmod +x ./gradlew

ARG MONGO_URI
ENV MONGO_URI=${MONGO_URI}

RUN ./gradlew clean build -x test -Dquarkus.native.enabled=true \
  -Dquarkus.package.jar.enabled=false \
  -Dquarkus.native.container-build=false \
  -Dquarkus.native.builder-image=graalvm \
  -Dquarkus.native.container-runtime=docker \
  -Dquarkus.native.native-image-xmx=4g

FROM registry.access.redhat.com/ubi9/ubi-minimal:9.2
WORKDIR /app
RUN chown 1001 /app && chmod "g+rwX" /app && chown 1001:root /app
COPY --from=build --chown=1001:root /app/build/*-runner /app/application

ARG MONGO_URI
ENV MONGO_URI=${MONGO_URI}

ENV DD_SERVICE=remote-falcon-plugins-api
ENV DD_ENV=prod

EXPOSE 8080
USER 1001

ENTRYPOINT [ \
  "/app/application", \
  "-XX:MaximumHeapSizePercent=75", \
  "-Dquarkus.http.host=0.0.0.0" \
  ]
