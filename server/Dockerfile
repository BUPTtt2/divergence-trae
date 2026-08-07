# 演策 · 八卦推演引擎 - CloudBase 云托管容器镜像
# 容器型云托管：常驻 Express 服务，支持 SSE 长连接 / 25s+ LLM 调用
FROM node:20-slim

WORKDIR /app

# 先复制依赖清单，利用 Docker 层缓存加速构建
COPY package.json package-lock.json ./
RUN npm install --omit=dev

# 复制源码
COPY index.js ./
COPY src ./src
COPY api ./api

# 云托管默认监听 3000 端口（可通过 --port 覆盖）
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "index.js"]