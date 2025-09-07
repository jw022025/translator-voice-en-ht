FROM node:20-alpine
USER node
WORKDIR /app
COPY --chown=node:node package.json ./
RUN npm i --omit=dev
COPY --chown=node:node . .
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:8080/healthz').then(r=>{if(r.status!==200) process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "start"]
