---
title: 实现swagger2不显示类名
date: 2019-11-01 16:36:17
tags: [java, 后端, 文档]
---

对swagger2进行扩展，实现自定义需求



<!-- more -->



#### 使用场景

在使用swagger2 2.9.2时

在UI上接口旁边会显示类名，我需要把这个去掉
![](https://i.loli.net/2019/11/01/ytJOdM9PQqFwoD7.png)

---

经debug之后，发现这个字段是通过`springfox.documentation.spring.web.scanners.ApiListingReader`显示的


而这个类是被自动注入到`springfox.documentation.spring.web.plugins.DocumentationPluginsManager`中的

因此，只需要自己实现一个`ApiListingReader`注入到spring容器就可以了

---
#### 效果图
![](https://i.loli.net/2019/11/01/2Xc83BoGxCaKmys.png)