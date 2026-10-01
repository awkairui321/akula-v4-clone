FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Baked into the client bundle.
ARG VITE_API_URL=
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT
ARG VITE_SENTRY_TRACES_SAMPLE_RATE
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT
ENV VITE_SENTRY_TRACES_SAMPLE_RATE=$VITE_SENTRY_TRACES_SAMPLE_RATE

# Build-time only for source-map upload; ARG (not ENV) so the token isn't kept.
ARG SENTRY_URL
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT

RUN npm run build

# Upload source maps to GlitchTip if a token is set, then delete them (not served).
# Must be sentry-cli (glitchtip-cli uploads are silently discarded) and --release
# must be passed (uploads without one are unusable; the value doesn't matter).
RUN if [ -n "$SENTRY_AUTH_TOKEN" ]; then \
      npm install -g @sentry/cli@3.6.0 && \
      sentry-cli sourcemaps inject ./dist && \
      sentry-cli sourcemaps upload ./dist --org "$SENTRY_ORG" --project "$SENTRY_PROJECT" \
        --release "$(date -u +%Y%m%d%H%M%S)" \
      || echo "WARNING: source-map upload failed; continuing"; \
    fi; \
    find ./dist -name '*.map' -delete

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

