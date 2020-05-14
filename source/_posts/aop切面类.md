---
title: aop切面类
date: 2019-10-17 16:35:21
tags: java,后端
---



记录一下较为常用的aop切面



<!-- more -->



- org.aopalliance.intercept.MethodInterceptor 环绕切面

### 通配符

.. ：匹配方法定义中的任意数量的参数，此外还匹配类定义中的任意数量包

＋ ：匹配给定类的任意子类

＊ ：匹配任意数量的字符

为了方便类型（如接口、类名、包名）过滤方法，Spring AOP 提供了within关键字。其语法格式如下：

within(<type name>)

//匹配com.zejian.dao包及其子包中所有类中的所有方法
@Pointcut("within(com.zejian.dao..*)")

//匹配UserDaoImpl类中所有方法
@Pointcut("within(com.zejian.dao.UserDaoImpl)")

//匹配UserDaoImpl类及其子类中所有方法
@Pointcut("within(com.zejian.dao.UserDaoImpl+)")

//匹配所有实现UserDao接口的类的所有方法
@Pointcut("within(com.zejian.dao.UserDao+)")