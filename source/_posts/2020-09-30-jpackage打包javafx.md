---
title: jpackage打包javafx
date: 2020-09-30 11:43:48
tags:
---

<!-- more -->



## 基本打包命令



```
jpackage -t app-image -i /Users/apple/resource/project/java/seal_client/applet/target/applet-1.0.21/ --java-options --add-modules=javafx.controls,javafx.swing,javafx.fxml,javafx.web --java-options -Dloader.path=lib/ -n applet --main-class com.hongding.seal.pc.applet.AppletApplication --main-jar applet.jar
```

要求 javafx sdk 放到 对应的 mods 目录下



### 配置项处理

#### 日志

mac下相对路径失效，最好使用 user.home



因此实现一个 配置项加载器处理配置项