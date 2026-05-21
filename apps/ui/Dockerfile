# Step 1: Create the build artifacts
FROM node:22.14.0-alpine AS build
WORKDIR /app
ENV PATH /app/node_modules/.bin:$PATH
COPY package.json ./
COPY package-lock.json ./
# .npmrc carries legacy-peer-deps=true (MUI v5 pins @types/react@17 vs RTL v16
# strict peer of @types/react@^18). Must be present before `npm ci` or it
# fails ERESOLVE under modern npm strictness.
COPY .npmrc ./
RUN npm ci --silent

COPY . ./

ARG HOST_ENV
ARG VERSION
ARG CONTROL_PANEL_API
ARG VIEWER_API
ARG GOOGLE_MAPS_KEY
ARG PUBLIC_POSTHOG_KEY
ARG HOSTNAME_PARTS
ARG SWAP_CP
ARG VIEWER_PAGE_SUBDOMAIN
ARG GITHUB_JS_PATH
ARG CDN_JS_PATH

ARG SOCIAL_META

# PostHog CLI auth for source-map upload (Obs-4 follow-up).
# Mirrored from the POSTHOG_API_KEY org secret in deploy.yml. Empty for
# local builds — the build skips the upload step in that case.
ARG POSTHOG_CLI_API_KEY

ENV VITE_HOST_ENV=$HOST_ENV
ENV VITE_VERSION=$VERSION
ENV VITE_CONTROL_PANEL_API=$CONTROL_PANEL_API
ENV VITE_VIEWER_API=$VIEWER_API
ENV VITE_GOOGLE_MAPS_KEY=$GOOGLE_MAPS_KEY
ENV VITE_PUBLIC_POSTHOG_KEY=$PUBLIC_POSTHOG_KEY
ENV VITE_HOSTNAME_PARTS=$HOSTNAME_PARTS
ENV VITE_SWAP_CP=$SWAP_CP
ENV VITE_VIEWER_PAGE_SUBDOMAIN=$VIEWER_PAGE_SUBDOMAIN
ENV VITE_GITHUB_JS_PATH=$GITHUB_JS_PATH
ENV VITE_CDN_JS_PATH=$CDN_JS_PATH

# posthog-cli reads these three vars from env. Project ID matches the
# org's PostHog project (also referenced in ops/posthog-alerts/,
# ops/posthog-dashboards/, ops/k8s/posthog-daily-digest/).
ENV POSTHOG_CLI_HOST=https://us.posthog.com
ENV POSTHOG_CLI_PROJECT_ID=425428
ENV POSTHOG_CLI_API_KEY=$POSTHOG_CLI_API_KEY

ARG VITE_SOCIAL_META=$SOCIAL_META

# Build, then inject + upload source maps so PostHog Error Tracking
# can symbolicate mangled stack traces (the SDK registers $release =
# VITE_VERSION at init time; this upload tags the maps with the
# matching --release-name). Maps are stripped from the runtime image
# before stage 2 copies dist, so they never serve publicly.
RUN npm run build && \
    if [ -n "$POSTHOG_CLI_API_KEY" ]; then \
      echo "Uploading source maps to PostHog (release: $VERSION)..." && \
      posthog-cli sourcemap inject --directory ./dist && \
      posthog-cli sourcemap upload --directory ./dist --release-name "$VERSION"; \
    else \
      echo "POSTHOG_CLI_API_KEY not set; skipping source-map upload (local build?)"; \
    fi && \
    find ./dist -name "*.map" -type f -exec rm -- {} +

# Step 2: Create the compact production image
FROM node:22.14.0-alpine AS production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/serve.json ./serve.json
RUN npm install serve -g --silent

EXPOSE 3000

# start the web server
CMD ["serve", "-s", "/app/dist", "-c", "/app/serve.json"]
