# One image serves the app (`pnpm start`) and runs the TypeScript scripts (`pnpm db:migrar`, `pnpm db:sembrar`,
# `pnpm rol`), which import src/ directly. The build stage keeps the dev dependencies out of the final image.
FROM node:24-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-slim
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_ENV=production
RUN corepack enable && mkdir /app && chown node:node /app
USER node
WORKDIR /app
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# node_modules hard-links the pnpm store; deleting the store in the same layer keeps one copy in the image.
RUN pnpm install --frozen-lockfile --prod && rm -rf ~/.local/share/pnpm ~/.cache/pnpm
COPY --chown=node:node --from=build /app/.output .output
COPY --chown=node:node src src
COPY --chown=node:node scripts scripts
EXPOSE 3000
CMD ["pnpm", "start"]
