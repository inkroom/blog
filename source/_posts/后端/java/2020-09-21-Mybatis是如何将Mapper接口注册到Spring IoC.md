---
layout: mybatis是如何将mapper接口注册到spring
title: IoC的
date: 2020-09-21 10:34:17
tags: [java, 后端, mybatis]
---



今天看了篇博客，就是这个标题，但是说得不够清楚。我在研究源码后补上部分细节

<!-- more -->



在阅读本篇博客前，需要阅读 [这篇博客](https://my.oschina.net/10000000000/blog/4614571)

---



### MapperScannerRegistrar

mybatis通过该类注入一个 `BeanDefinitionRegistryPostProcessor` 的实现类 `MapperScannerConfigurer`



### MapperScannerConfigurer

这个类主要读取了mybatis的一些配置信息，并且创建一个`ClassPathMapperScanner`用于对包进行扫描

### ClassPathMapperScanner

这个类负责路径扫描，但是不负责实例创建和代理

### MapperFactoryBean

这里负责实例的创建，但是最终该任务会被交给`MapperRegistry`，`MapperRegistry`会通过`MapperProxyFactory`创建一个代理。

### MapperProxyFactory

通过`MapperProxy`实现代理，所以逻辑都在`MapperProxy`里

### ### MapperMethod

在`MapperProxy`里会创建`MapperMethod`，这个类才是执行相关方法的核心类

