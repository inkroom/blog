---
title: SpringBoot配置文件优先级
date: 2019-11-04 16:36:29
tags: java,后端,SpringBoot
---

记录SpringBoot的配置优先级



<!-- more -->



### 场景

项目场景为：SpringBoot本身jar中附带有application.properties配置文件，现在需要将部分配置项放到jar外面

### 实现方案 


查阅资料得知SpringBoot加载配置文件顺序如下:
- 当前目录下的/config目录
- 当前目录
- classpath里的/config目录
- classpath 根目录


因此，将jpa相关配置存放在jar中，将eureka配置外置

实验发现：

**server.port**配置项在两个地方都有时，优先使用外置







### 参考资料

[https://www.cnblogs.com/xiaoqi/p/6955288.html](https://www.cnblogs.com/xiaoqi/p/6955288.html)