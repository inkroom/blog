FROM debian:bookworm-20240311-slim
ARG NODE_VERSION=18.18.0
ARG NODE_HOME=/usr/local/lib/nodejs
ARG NODE_MIRROR=https://registry.npmmirror.com/
ENV CPPFLAGS=-DPNG_ARM_NEON_OPT=0
ENV PATH=${NODE_HOME}/bin:$PATH
#RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list && apt update -y && apt install -y curl
RUN sed -i 's/deb.debian.org/mirror.sjtu.edu.cn/g' /etc/apt/sources.list.d/debian.sources && apt  update -y && apt install -y curl autoconf automake libtool libpng-dev make gcc g++ nasm jq git wget pkg-config vim && git config --global core.editor "vim"
RUN mkdir -p ${NODE_HOME} ; \
 dpkgArch="$(dpkg --print-architecture)"; \
    case "${dpkgArch##*-}" in \
        amd64) export NODE_DIST='linux-x64';; \
        armhf) export NODE_DIST='linux-armv7l'  ;; \
        arm64) export NODE_DIST='linux-arm64'  ;; \
        i386) echo "not install node" ; exit 101 ;; \
        s390x) export NODE_DIST='linux-s390x' ;; \
        *) echo >&2 "unsupported architecture: ${dpkgArch}" ; exit 101 ;; \
    esac; \
 wget -q https://nodejs.org/download/release/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_DIST}.tar.gz \ 
 && tar -zxf node-v${NODE_VERSION}-${NODE_DIST}.tar.gz -C ${NODE_HOME} --strip-components 1 \
 && rm -rf node-v${NODE_VERSION}-${NODE_DIST}.tar.gz && ${NODE_HOME}/bin/node -v \
 && node -v && npm -v  \
 && npm config set registry ${NODE_MIRROR}   && npm i -g nrm 

COPY . /app
WORKDIR /app

ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8