FROM node:22-bookworm-slim
WORKDIR /app
COPY index.html ./index.html
COPY site ./site
ENV PORT=3000
# The public bug chat stores its shared thread here. Mount a volume on /data to
# keep reports across restarts; without one they live inside the container.
ENV SREON_BUG_DIR=/data/bugs
RUN mkdir -p /data/bugs && chown -R node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=25s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "site/start.mjs"]
