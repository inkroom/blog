---
title: ClassLoader和双亲委派模型
date: 2021-06-18 09:26:25
tags: [java, ClassLoader, editing]
---


这篇博客还是有些问题，一些逻辑还是没有理顺

<!-- more -->

## jdk中的ClassLoader

在jdk9以前，jdk中有以下加载器

![https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/6544570c19724b618d0f72c5c2f8824d~tplv-k3u1fbpfcp-watermark.image](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/6544570c19724b618d0f72c5c2f8824d~tplv-k3u1fbpfcp-watermark.image)


- BootstrapClassLoader，又名根加载器，该加载器是由jvm实现，在jdk中不存在该类，负责加载存放在
<JAVA_HOME>\lib目录，或者被-Xbootclasspath参数所指定的路径中的class。同时，该加载器无法获取实例，所有该加载器加载的类的`getClassLoader()`方法都将返回**null**

- ExtClassLoader，又名扩展加载器，负责加载<JAVA_HOME>\lib\ext以及java.ext.dirs内的类。该类存在于jdk中

- AppClassLoader，负责加载由用户编写、不属于jdk的类，自定义加载器应该继承该类，并覆盖`findClass`方法

## 双亲委派模型

jdk使用**双亲委派模型**来处理类加载流程。

以用户编写的**Entry.class**为例，该类将会由**AppClassLoader**来负责加载。当其收到加载请求后，会先将请求交给其父类，也就是**ExtClassLoader**；扩展加载器再递交给根加载器，根加载尝试加载类，发现在其负责查找范围内没有该类，遂将请求返回给扩展加载器；扩展加载器同样无法加载，再返给应用加载器，最终由**AppClassLoader**完成加载

---

采用该模型主要是为了避免在内存中存在同一个类的不同实例，导致**instance**等语法出错。

在这一模型下，类的访问范围被限制在当前加载器及其父加载器。由扩展加载器加载的类，可以访问其他由扩展加载的类以及由根加载器加载的类，但是不能访问应用加载器及其子加载器加载的类


## jdk9以后的类加载器

jdk9以后采用了模块化方案，三级类加载器也有所变动

![jdk9的类加载器](https://i.loli.net/2021/06/18/j7hfFy94C3RVALD.png)

由于模块化设计，jdk目录也有所变化，不再有**ext**目录

三个加载分别负责加载不同的模块，虽然仍然维持着三层类加载器和双亲委派的架构，但类加载的委派关系也发生了
变动。当平台及应用程序类加载器收到类加载请求，在委派给父加载器加载前，要先判断该类是否能
够归属到某一个系统模块中，如果可以找到这样的归属关系，就要优先委派给负责那个模块的加载器
完成加载。

顺便一提，BootstrapClassLoader也出现在了jdk中，但是依然无法获取实例

## 类的隔离性

**运行时包**

每一个类都有一个运行时包的概念。和类所在包不同，运行时包包括了类加载器，基本结构如下

> BootstrapClassLoader.ExtClassLoader.AppClassLoader.com.mysql.jdbc.Driver

**初始类加载器**

jvm规范规定，在类的加载过程中，所有参与的类加载器，即使没有直接加载该类，都属于该类的初始类加载器


---

那么隔离性就由以下规则保证

- 不同运行时包中的类不能互相访问
- 有相同初始化类就行



## 破坏双亲委派模型

双亲委派模型是非强制性规范，同时受限于本身的设计，部分情况下得破坏模型。

其中一种情况是**spi**，例如jdbc，接口以及接口的调用者为jdk中的类，但是实现由用户提供，二者处于不同的加载器中，按照双亲委派模型就无法运行。

jdk提供了**线程上下文类加载器（Thread Context ClassLoader）**。这个类加载器可以通过java.lang.Thread类的setContext-ClassLoader()方
法进行设置，如果创建线程时还未设置，它将会从父线程中继承一个，如果在应用程序的全局范围内
都没有设置过的话，那这个类加载器默认就是应用程序类加载器。


在**SPI**机制中，需要由接口提供方自动发现注册接口实现。在jdbc中，最重要的**DriverManger**使用**PlatformClassLoader**加载的，在其内部去加载某个实现类，如果不提供别的途径的话，**DriverManger**只能使用**PlatformClassLoader**，那就无法加载实现方了。

因此提供一个线程上下文类加载器，**DriverManger**就能拿到可以加载实现方的类加载器了，这一过程也破坏了双亲委派模型


jdk主要是因为核心库和用户代码加载器不同，才需要一个线程上下文类加载器。假设我们需要一个spi机制，反倒不需要这么麻烦。
