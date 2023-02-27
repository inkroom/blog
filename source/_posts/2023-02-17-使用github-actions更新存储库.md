---
title: 使用github actions更新存储库
date: 2023-02-17 13:20:02
tags: [github, node]
---

我在我的[图片存储库](https://github.com/inkroom/image)里搞了个列表用于存储文件列表，由于每次上传图片后需要手动执行一些操作，比较繁琐，最终想到利用github actions来实现

<!-- more -->

## 背景

在我的[图片库](https://github.com/inkroom/image)里，有个list文件夹，按上传顺序存储图片列表和对应的图床地址。

实际上，这个图片存储方案改过几次了。

最早存在云服务oss里，自己写个web服务用于上传、浏览，但是后来云服务器到期了，这套方案就没法用了。

然后又使用github pages服务，把图片存在仓库里，然后写个静态页面，借用github pages服务，和github的api，实现了完全免费的图片相册。

但是github访问速度比较慢，因此考虑过gitee，但是图片库体积超过了gitee的限制。借着服务器打折的机会，又买了服务器，这次采用的方案是把网站和图片备份放到服务器上，然后再通过webhook的方式同步图片库，这样速度上去了，也不用担心服务器故障导致图片丢失。

但是又有新问题，图片列表如果调用github的api的话，排序规则不由我决定，不能实现新上传的图片在前面。

最终方案是在图片库里新建文件夹专门存放图片列表，这样顺序就有了。后来又搞了一个图床用作缩略图，还是把数据放这个文件夹里。

----

于是上传操作就变得比较繁琐。

首先添加要上传的图片，然后手动上传到图床，接着修改list文件，最后push。后面的同步借用webhook机制，不用管

## actions

后来比较偶然的机会知道了github actions，其实还有别的免费自动化CI/CD，但是需要到第三方网站使用，不如github本身的便捷

相关代码比较简单，直接参考[仓库](https://github.com/inkroom/image/blob/master/.github/workflows/list.yml)

为了限定获取到上传的文件的commit范围，每次成功后会写入一个**commit sha**到 **.sha** 文件


需要注意的是，想要在github actions里push代码，需要配置 **GITHUB_TOKEN** 的权限，在[https://github.com/inkroom/image/settings/actions](https://github.com/inkroom/image/settings/actions)的 **Workflow permissions** 选中 **Read and write permissions**


借用 github actions 有个好处是不用关注网络问题了，不需要镜像，不需要代理

最后只需要添加图片后**push**就行了


## 其他


这里顺便提供一份配置，用于重建仓库以减小仓库体积

在 **.github/workflows/** 下新建**clean.yml**

由于需要使用ssh，还需要将ssh私钥配置到actions secrets

```yaml
name: clean

# Controls when the workflow will run
on:
  # Triggers the workflow on push or pull request events but only for the "main" branch
  push:
    branches: [ "master" ]
  pull_request:
    branches: [ "master" ]

  # Allows you to run this workflow manually from the Actions tab
  workflow_dispatch:

# A workflow run is made up of one or more jobs that can run sequentially or in parallel
jobs:
  # This workflow contains a single job called "build"
  clean:
    # The type of runner that the job will run on
    runs-on: ubuntu-20.04

    # Steps represent a sequence of tasks that will be executed as part of the job
    steps:
      - name: Encoding
        run: |
          git config --global i18n.logoutputencoding utf-8
          git config --global i18n.commitencoding utf-8
          git config --global core.quotepath false
          git config --global http.version HTTP/1.1
          git config --global http.postBuffer 524288000
          export LESSCHARSET=utf-8
      # Checks-out your repository under $GITHUB_WORKSPACE, so your job can access it
      - name: Checkout
        uses: actions/checkout@v3
        with:
          ssh-key: ${{  secrets.SSH_PR }}
          # We need to fetch all branches and commits so that Nx affected has a base to compare against.
          fetch-depth: 0
      # - name: Last Success SHA
      #   uses: nrwl/nx-set-shas@v3
      #   id: sha
      #   with:
      #     main-branch-name: "master"
      - name: Clean
        run: |
          git remote set-url origin git@github.com:/inkroom/image.git
          git config http.version HTTP/1.1
          git config http.postBuffer 5242880000
          git checkout --orphan clean
          rm .github/workflows/clean.yml
          git config user.email "enpassPixiv@protonmail.com"
          git config user.name "inkbox"
          #  因为一次全部commit会超出github限制,所以需要分成多次提交 首先把单独的文件都提交了
          git rm --cached -f -r .
          for file in *
          do
            if [ -f "$(pwd)/$file" ]
            then
              echo "添加文件 $file"
              git add "$file"
            fi
          done

          git commit -m "clean"
          git branch -D master
          git branch -m master
          git push -f origin master

          ## 文件夹依次提交

          for file in *
          do
            if [ -d "$(pwd)/$file" ]
            then
              if [ "$file" != '.git' ]
              then
                echo "添加文件夹 $file"
                git add "$file"
                git commit -m "clean:$file"
           #     git push origin master
              fi
            fi
          done

          echo $(git show -s --format=%H) > .github/.sha
          git add .github/.sha
          git commit -m "clean:sha"
          git log
          git push origin master


```
