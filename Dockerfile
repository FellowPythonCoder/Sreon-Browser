FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --chown=node:node package.json server.js index.html styles.css app.js theme.js site-config.js README.md LICENSE.txt sreon.zip google8a635a877beef351.html ./
COPY --chown=node:node assets ./assets
COPY --chown=node:node search ./search
COPY --chown=node:node o ./o
COPY --chown=node:node games ./games
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
