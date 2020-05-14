---
title: mybatis-plus缓存配置
date: 2019-10-12 16:33:01
tags: java,mybatis,后端
---



关闭mybatis的缓存



<!-- more -->



### 场景

在单元测试中使用mybatis-plus查询一条数据

再用jdbcTemplate修改数据

再用mybatis-plus查询数据，发现数据未修改


### 原因

这是由于mybatis的一级缓存在起作用。前后两次查询之间没有使用mybatis的修改数据，缓存未被清除

### 解决办法

- 使用mybatis做修改操作
- 配置mybatis-plus.configuration.local-cache-scope=statement
    
    > mybatis-plus.configuration.cache-enabled=false无效

### 局限性

- mybatis和其他orm搭配使用可能会出问题
- 分布式条件下，如果一条修改sql被一台机器执行，而另一台机器全部执行查找，会出现不一致问题