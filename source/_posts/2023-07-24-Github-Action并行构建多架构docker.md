---
title: Github Action并行构建多架构docker
date: 2023-07-24 11:39:12
tags: [github, rust]
---

利用docker作为rust的开发环境，可以便捷升级，引入依赖，避免对本地环境的污染。为了便捷，使用了github action来构建docker镜像，实现了多架构和快速访问国外网络

<!-- more -->

## 问题

在原本的构建逻辑中，使用了[build-push-action](https://github.com/docker/build-push-action/)来实现多架构构建，但是因为其原理是使用QUME来模拟arm进行串行构建，arm构建非常慢，在我构建四个架构的情况下运行时间超出了action的六小时限制


因此需要想办法实现并行构建

## 方案一


action提供了**matrix**，可以通过提供不同的变量实现并行

[简单配置一下](https://github.com/inkroomtemp/util/commit/31c06616160e93bfba2de0bd375fc68328e32814)

```yml
  dev:
    runs-on: ubuntu-20.04
    permissions: write-all
    needs: [version]
    if: needs.version.outputs.u == 'true'
    strategy:
      matrix:
        platform: [linux/386, linux/amd64, linux/arm/v7, linux/arm64]
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3
      - name: Checkout Runtime
        run: |
          git clone https://gist.github.com/inkroom/501548078a930c6f3bd98ea257409648 runtime
      - name: Set up QEMU
        uses: docker/setup-qemu-action@v2
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      - name: Log in to the Container registry
        uses: docker/login-action@v2
        with:
          registry: ghcr.io
          username: ${{ github.repository_owner }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Log in to the Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_HUB_USERNAME }}
          password: ${{ secrets.DOCKER_HUB_PASSWORD }}
      - name: Extract metadata (tags, labels) for Docker
        id: meta
        uses: docker/metadata-action@v4
        with:
          images: |
            ghcr.io/${{ github.repository_owner }}/rust
            ${{ secrets.DOCKER_HUB_USERNAME }}/rust
          tags: |
            type=raw,value=${{ needs.version.outputs.ve }}
          labels: |
            org.opencontainers.image.description=rust开发环境-${{ needs.version.outputs.ve }}
            org.opencontainers.image.title=rust-${{ needs.version.outputs.ve }}
      - name: Build Docker image
        uses: docker/build-push-action@v4
        with:
          context: runtime
          file: runtime/Dockerfile.rust
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          platforms: ${{ matrix.platform }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          build-args: |
            RUST_VERSION=${{ needs.version.outputs.ve }}

```

---

结果就成了每构建成功一个架构，docker hub里面对应tag就会被替换成新镜像，之前push的就会丢失

## 方案二

之前的方案之所以会这样，是因为分开构建的镜像不被认为属于同一个tag

所以尝试使用manifast实现镜像合并

将不同架构push到不同的tag，然后使用命令实现合并


[新增](https://github.com/inkroomtemp/util/commit/6192641a1fcf32a5e9d5add85d273062d4718a40)一个**combine**任务

```yml
  combine:
    runs-on: ubuntu-20.04
    permissions: write-all
    needs: [version, dev]
    # 直接push  会导致 新推送覆盖旧推送，所以只能分开推送到不同tag，最后才采取合并
    if: needs.version.outputs.u == 'true'
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3
      - name: Log in to the Container registry
        uses: docker/login-action@v2
        with:
          registry: ghcr.io
          username: ${{ github.repository_owner }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      - name: Log in to the Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_HUB_USERNAME }}
          password: ${{ secrets.DOCKER_HUB_PASSWORD }}
      - name: Create Manifest
        run: |
          docker manifest create --insecure ghcr.io/${{ github.repository_owner }}/rust:${{ needs.version.outputs.ve }} ghcr.io/${{ github.repository_owner }}/rust:amd64 ghcr.io/${{ github.repository_owner }}/rust:386 ghcr.io/${{ github.repository_owner }}/rust:arm-v7 ghcr.io/${{ github.repository_owner }}/rust:arm64
          
          docker manifest annotate  ghcr.io/${{ github.repository_owner }}/rust:${{ needs.version.outputs.ve }} ghcr.io/${{ github.repository_owner }}/rust:amd64 --os linux --arch amd64 
          docker manifest annotate  ghcr.io/${{ github.repository_owner }}/rust:${{ needs.version.outputs.ve }} ghcr.io/${{ github.repository_owner }}/rust:386 --os linux --arch 386
          docker manifest annotate  ghcr.io/${{ github.repository_owner }}/rust:${{ needs.version.outputs.ve }} ghcr.io/${{ github.repository_owner }}/rust:arm-v7 --os linux --arch arm --variant v7
          docker manifest annotate  ghcr.io/${{ github.repository_owner }}/rust:${{ needs.version.outputs.ve }} ghcr.io/${{ github.repository_owner }}/rust:arm64 --os linux --arch arm64
          docker manifest push --insecure ghcr.io/${{ github.repository_owner }}/rust:${{ needs.version.outputs.ve }}
          
                 
          docker manifest create --insecure ${{ github.repository_owner }}/rust:${{ needs.version.outputs.ve }} ${{ github.repository_owner }}/rust:amd64 ${{ github.repository_owner }}/rust:386 ${{ github.repository_owner }}/rust:arm-v7 ${{ github.repository_owner }}/rust:arm64
     
          docker manifest annotate  ${{ github.repository_owner }}/rust:${{ needs.version.outputs.ve }} ${{ github.repository_owner }}/rust:amd64 --os linux --arch amd64 
          docker manifest annotate  ${{ github.repository_owner }}/rust:${{ needs.version.outputs.ve }} ${{ github.repository_owner }}/rust:386 --os linux --arch 386
          docker manifest annotate  ${{ github.repository_owner }}/rust:${{ needs.version.outputs.ve }} ${{ github.repository_owner }}/rust:arm-v7 --os linux --arch arm --variant v7
          docker manifest annotate  ${{ github.repository_owner }}/rust:${{ needs.version.outputs.ve }} ${{ github.repository_owner }}/rust:arm64 --os linux --arch arm64

          docker manifest push --insecure ${{ github.repository_owner }}/rust:${{ needs.version.outputs.ve }}

```

---

执行后出现以下[错误](https://github.com/inkroomtemp/util/actions/runs/5608340637/job/15200531959)

```
ghcr.io/inkroomtemp/rust:amd64 is a manifest list
```


猜测是因为构建出来的镜像已经是一个 manifest list，而非manifest，所以不能再套娃了

## 方案三


研究一番后，发现[build-push-action](https://github.com/docker/build-push-action/)在readme里提供了一个并行构建的[样例](https://docs.docker.com/build/ci/github-actions/multi-platform/)


---

[结果](https://github.com/inkroomtemp/util/actions/runs/5617649190)是不能**push by digest**

到处都找不到这个配置的文档，只能放弃

## 方案四

这个方案来自[issues](https://github.com/docker/build-push-action/issues/846)

思路是并行构建产物作为缓存，**combine**里引入缓存，完整执行一次普通构建，因为有缓存，所以速度很快，不会超出时间限制

有一点需要处理，每个matrix构建出的缓存都是一个整体，后面使用的时候需要进行一次合并，就是把缓存目录合并，同时把index.json进行[合并](https://github.com/inkroomtemp/util/commit/f75bf5be54b0abb7dce60e98b841baf67cc74475)

---

结果很不理想，构建依然没用上缓存

## 最终方案

研究半天，最终还是回到方案三

发现最开始的错误原因是我在初步构建的时候给了tag和image，这个和outputs里的配置冲突了，去掉就可以正常使用了


## 2024-04-03


使用中发现一个奇怪的问题:使用qemu模拟i386,dockerfile中使用命令`arch`返回的是x86_64,但是包管理器和命令`dpkg --print-architecture`能返回i386

没找到原因和解决方案,只能不构建这个架构


