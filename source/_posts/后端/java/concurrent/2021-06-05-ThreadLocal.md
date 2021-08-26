---
title: ThreadLocal
date: 2021-06-05 14:42:29
tags: [java, 多线程, ThreadLocal]
---

本文将解释ThreadLocal的原理

<!-- more -->


## 结构

**ThreadLocal** 本质是给每一个线程绑定一个map，以线程名为key

线程和ThreadLocal的关系如下：

![](https://i.loli.net/2021/06/05/wLzsQg6xHGDk21R.png)

每一个线程都有一个**ThreadLocalMap**属性，该属性存有**Entry**数组，通过对**threadLocalHashCode**取模，得到下标索引。

## 内存泄漏

**ThreadLocalMap**是通过Thread访问的，同时还是**default**权限，如果Thread结束了，那么这一部分数据将用于无法被访问。如果Thread的实例还被保存着，那么这一部分数据就有泄漏的风险。

---

为了解决这一问题，jdk采取了以下办法

### WeakReference

**Entry**类使用 **WeakReference**。jvm在任何一次GC中，总会尝试去回收被WeakReference引用的对象。**ThreadLocalMap**会在get、set操作中去清理被回收的entry

但是以上只是回收了Entry，对应的Value不会回收。想要回收，还是得等到Thread被回收

可通过以下程序验证，以下代码就无法回收value内存
```java
ThreadLocal threadLocal = new ThreadLocal();
try {
    TimeUnit.SECONDS.sleep(20);
} catch (InterruptedException e) {
    e.printStackTrace();
}
threadLocal.set(new byte[100 * 1024 * 1024]);

threadLocal = null;
try {
    Thread.currentThread().join();
} catch (InterruptedException e) {
    e.printStackTrace();
}

```






