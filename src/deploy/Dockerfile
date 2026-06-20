FROM node:22-alpine

LABEL description="SessionMaster Sync Server - 云端Cookie双向同步中继"
LABEL version="1.2.0"

# 创建运行目录
WORKDIR /app

# 只复制 server.js，零依赖，无需 npm install
COPY server.js .

# 数据持久化目录
VOLUME /app/data

# 暴露同步端口（默认 5789，可在 docker-compose 中通过 PORT 环境变量修改）
EXPOSE 5789

# 健康检查（使用 PORT 环境变量，默认为 5789）
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "const p=process.env.PORT||'5789';require('http').get('http://localhost:'+p+'/api/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>process.exit(d.includes('\"ok\"')?0:1))}).on('error',()=>process.exit(1))"

# 启动（支持通过 PORT 环境变量自定义端口）
CMD ["node", "server.js"]
