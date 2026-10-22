# RecallIQ — one image for the web service and the worker.
#   web:    docker run -p 3300:3300 --env-file .env recalliq
#   worker: docker run --env-file .env recalliq pnpm worker
#   migrations (release step): docker run --env-file .env recalliq pnpm db:migrate
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production PORT=3300
COPY --from=build /app /app
RUN useradd --system --uid 1001 recalliq && chown -R recalliq /app
USER recalliq
EXPOSE 3300
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3300)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "pnpm start"]
