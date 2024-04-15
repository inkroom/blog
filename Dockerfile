# 只支持x86架构,因为 optipng-bin mozjpeg 不支持arm架构 被hexo-all-minifier引入 https://github.com/imagemin/optipng-bin/blob/main/lib/index.js
FROM debian:bookworm-20240311-slim
ARG NODE_VERSION=18.18.0
ARG NODE_DIST=linux-x64
ARG NODE_HOME=/usr/local/lib/nodejs
ARG NODE_MIRROR=https://registry.npmmirror.com/

ENV PATH ${NODE_HOME}/node-v${NODE_VERSION}-${NODE_DIST}/bin:$PATH
#RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list && apt update -y && apt install -y curl
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources && apt  update -y && apt install -y curl autoconf automake libtool libpng-dev make gcc g++ nasm jq git
RUN mkdir -p ${NODE_HOME} && curl -sL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_DIST}.tar.gz | tar xz -C ${NODE_HOME}  \
  && ${NODE_HOME}/node-v${NODE_VERSION}-${NODE_DIST}/bin/node -v && node -v && npm -v \
  && npm config set registry ${NODE_MIRROR} \
  && npm i -g nrm 
COPY . /app
WORKDIR /app
RUN if [ "$(arch)" = "aarch64"  ]; then echo "aarch 需要修改package.json" && jq 'del(.dependencies."hexo-all-minifier") | del(.dependencies.mozjpeg) |del(.dependencies."optipng-bin")' package.json > p2.json && mv p2.json package.json && cat package.json; fi

RUN  npm i 
