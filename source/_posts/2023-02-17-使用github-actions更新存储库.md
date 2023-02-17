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

