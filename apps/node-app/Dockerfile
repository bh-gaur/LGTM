# ==========================================
# STAGE 1: Builder
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY node-app/package*.json ./node-app/

# Install dependencies
WORKDIR /app/node-app
RUN npm install --legacy-peer-deps

# Copy application source code
COPY common /app/common
COPY node-app/ /app/node-app/

# Prune devDependencies to keep only production packages
RUN npm prune --omit=dev --legacy-peer-deps

# ==========================================
# STAGE 2: Final Production Runner
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_PATH=/app/node-app/node_modules

# Copy only production source code and pruned node_modules from builder
COPY --from=builder /app/common ./common
COPY --from=builder /app/node-app ./node-app

# Re-create symlink to allow common/ modules to resolve packages from node-app/node_modules
RUN ln -s /app/node-app/node_modules /app/node_modules

WORKDIR /app/node-app

EXPOSE 8081

# Launch the app directly using node rather than npm
CMD ["node", "app.js"]
