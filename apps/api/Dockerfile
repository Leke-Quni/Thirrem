FROM node:24-slim AS build
WORKDIR /repo
COPY package.json yarn.lock ./
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/
RUN yarn install --frozen-lockfile --ignore-scripts --production=false
COPY tsconfig.base.json ./
COPY packages/types packages/types
COPY apps/api apps/api
RUN yarn workspace @thirrem/api build

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 5001
CMD ["sh", "-c", "node dist/database/migrate.js && node dist/main.js"]
