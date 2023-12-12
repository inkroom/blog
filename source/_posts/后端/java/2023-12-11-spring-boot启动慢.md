---
title: spring-boot启动慢
date: 2023-12-11 16:48:53
tags: [java]
---

一个简单应用，使用了springBoot框架，发现启动就需要五六秒

<!-- more -->

## 可能性

一般情况下，启动慢是注入了太多bean，或者和网络服务建立连接慢，可以通过懒加载之类的方式优化

但是我这次不一样，是由于框架本身导致的启动慢。怎么判断的呢，打开org.springframework的trace日志，发现输出的第一条日志和第二条之间差距在五六秒左右


## 准备

由于涉及底层框架，所以最好下载一份源码，修改代码做好日志打点，一点点排查。耗时问题不太适合使用debug。

这里附上一份用于编译Spring-Boot的Dockerfile，最好启用buildkit使用缓存

```Dockerfile
# syntax=docker/dockerfile:1
#FROM ubuntu:20.04
FROM debian:12.2
#FROM debian:stable-20231120
#RUN echo $' \n\
#deb https://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm main contrib non-free non-free-firmware\n\
#deb-src https://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm main contrib non-free non-free-firmware\n\
#deb https://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm-updates main contrib non-free non-free-firmware\n\
#deb-src https://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm-updates main contrib non-free non-free-firmware\n\
#deb https://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm-backports main contrib non-free non-free-firmware\n\
#deb-src https://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm-backports main contrib non-free non-free-firmware\n\
#deb https://mirrors.tuna.tsinghua.edu.cn/debian-security bookworm-security main contrib non-free non-free-firmware\n\
#deb-src https://mirrors.tuna.tsinghua.edu.cn/debian-security bookworm-security main contrib non-free non-free-firmware\n\' >> /etc/apt/sources.list

#RUN sed -i "s|http://deb.debian.org/debian|http://mirror.sjtu.edu.cn/debian|g" /etc/apt/sources.list
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources

RUN export DEBIAN_FRONTEND=noninteractive  && apt update -y && apt upgrade -y && apt install -y \
# autoconf \
# automake \
 git \
# gcc \
# g++ \
# libtool \
# lksctp-tools \
# libssl-dev \
# lsb-core \
# make \
 tar \
 unzip \
 wget \
 zip
RUN wget https://mirrors.tuna.tsinghua.edu.cn/Adoptium/8/jdk/aarch64/linux/OpenJDK8U-jdk_aarch64_linux_hotspot_8u392b08.tar.gz && tar zvxf OpenJDK8U-jdk_aarch64_linux_hotspot_8u392b08.tar.gz
ARG JDK_HOME=/jdk8u392-b08
ENV JAVA_HOME ${JDK_HOME}
ENV JRE_HOME $JAVA_HOME/jre
ENV CLASS_PATH=.:$JAVA_HOME/lib:$JRE_HOME/lib
ENV PATH ${PATH}:${JAVA_HOME}/bin:${JAVA_HOME}/jre/bin
WORKDIR /app
#RUN apt install -y clang && git clone https://github.com/spring-projects/spring-boot -b v2.7.17 /app
COPY . /app

#RUN --mount=type=cache,mode=0777,target=/root/.gradle/,id=gradle ./gradlew build -x test
RUN --mount=type=cache,mode=0777,target=/root/.gradle/,id=gradle ./gradlew :spring-boot-project:spring-boot:build -x test
#RUN --mount=type=cache,mode=0777,target=/project/maven/ ls /project/maven && mvn clean package -DskipTests=true -Dcheckstyle.skip=true -Dmaven.test.skip=true -T 4 && ls /project/maven

```

编译通过后，拷贝`spring-boot-project/spring-boot/build/libs/spring-boot-2.7.17.jar`到项目引入即可

### 打点


最开始使用 spring的logger成员变量日志打点，但是debug后发现有些日志不会输出，很奇怪，也没功夫去研究，就索性自己写个log方法

```java
public static void info(String m) {
    SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS");
    System.out.println(f.format(new Date()) + " " + m);
}
```

再次编译后遇到代码格式校验不通过问题，几番尝试后，解决办法如下

修改`spring-boot-project/spring-boot/build.gradle`

原内容如下

```gradle
tasks.named("checkFormatMain") {
//	def generatedSources = fileTree("build/generated-sources/main")
//	// Exclude source generated from the templates as expand(properties) changes line endings on Windows
//	exclude { candidate -> generatedSources.contains(candidate.file) }
//	// Add the templates to check that the input is correctly formatted
//	source(fileTree("src/main/javaTemplates"))
}
```

修改后如下
```gradle
tasks.named("checkFormatMain") {
//	def generatedSources = fileTree("build/generated-sources/main")
//	// Exclude source generated from the templates as expand(properties) changes line endings on Windows
//	exclude { candidate -> generatedSources.contains(candidate.file) }
//	// Add the templates to check that the input is correctly formatted
//	source(fileTree("src/main/javaTemplates"))

	enabled = false
}
tasks.named("checkstyleMain") {
	enabled = false
}
```


原理就是关闭两个和格式校验相关的task

## 定位

一通操作之后，将耗时操作定位到 `org/springframework/boot/SpringApplicationRunListeners` 的第**66**行的lamda方法内

```java
void environmentPrepared(ConfigurableBootstrapContext bootstrapContext, ConfigurableEnvironment environment) {
    doWithListeners("spring.boot.application.environment-prepared",
            (listener) -> listener.environmentPrepared(bootstrapContext, environment)/* 就这一行代码 */ );
}
```

虽然定位到耗时代码，但是这段代码的执行顺序还是挺奇怪的

以下代码位于 `org/springframework/boot/SpringApplication` 第293行

```java
	public ConfigurableApplicationContext run(String... args) {
/*1*/	long startTime = System.nanoTime();
    	DefaultBootstrapContext bootstrapContext = createBootstrapContext();
    	ConfigurableApplicationContext context = null;
/*2*/	configureHeadlessProperty();
/*3*/	SpringApplicationRunListeners listeners = getRunListeners(args);
/*4*/	listeners.starting(bootstrapContext, this.mainApplicationClass);
		try {
			ApplicationArguments applicationArguments = new DefaultApplicationArguments(args);
/*5*/		ConfigurableEnvironment environment = prepareEnvironment(listeners, bootstrapContext, applicationArguments);// 耗时操作就在这里
/*6*/		configureIgnoreBeanInfo(environment);
/*7*/		Banner printedBanner = printBanner(environment);
			context = createApplicationContext();
/*8*/		context.setApplicationStartup(this.applicationStartup);
			prepareContext(bootstrapContext, context, environment, listeners, applicationArguments, printedBanner);
			refreshContext(context);
			afterRefresh(context, applicationArguments);
			Duration timeTakenToStartup = Duration.ofNanos(System.nanoTime() - startTime);
			if (this.logStartupInfo) {
				new StartupInfoLogger(this.mainApplicationClass).logStarted(getApplicationLog(), timeTakenToStartup);
			}
			listeners.started(context, timeTakenToStartup);
			callRunners(context, applicationArguments);
		}
		catch (Throwable ex) {
			handleRunFailure(context, ex, listeners);
			throw new IllegalStateException(ex);
		}
		try {
			Duration timeTakenToReady = Duration.ofNanos(System.nanoTime() - startTime);
			listeners.ready(context, timeTakenToReady);
		}
		catch (Throwable ex) {
			handleRunFailure(context, ex, null);
			throw new IllegalStateException(ex);
		}
		return context;
	}
```


我对关键代码标注了行号，其执行顺序为：1 -> 2 -> 3 -> 4 -> 5 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 6 -> 7 -> 8 -> 启动完成

由于执行顺序过于绕，可能有遗漏，总体逻辑就是 **5** 会被执行两次，而且是递归式的两次，不是并行的两次，这都是因为spring使用的listener机制，弄得人头大，然后耗时的是第二次也就是被递归调用的那一次

所以接下来的思路就是理清listener的逻辑，是否前后两次执行的代码不一样

## listener

首先这套机制是 spring 提供的，具体到我的项目是 **spring-context** 里的 `org.springframework.context.event.SimpleApplicationEventMulticaster#multicastEvent:137`，不同的项目配置可能会有不同的listener实现，所以这里再下载一份spring源码，看看具体是哪个listener在耗时


```Dockerfile
# syntax=docker/dockerfile:1
#FROM ubuntu:20.04
FROM debian:12.2
#FROM debian:stable-20231120
#RUN echo $' \n\
#deb https://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm main contrib non-free non-free-firmware\n\
#deb-src https://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm main contrib non-free non-free-firmware\n\
#deb https://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm-updates main contrib non-free non-free-firmware\n\
#deb-src https://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm-updates main contrib non-free non-free-firmware\n\
#deb https://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm-backports main contrib non-free non-free-firmware\n\
#deb-src https://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm-backports main contrib non-free non-free-firmware\n\
#deb https://mirrors.tuna.tsinghua.edu.cn/debian-security bookworm-security main contrib non-free non-free-firmware\n\
#deb-src https://mirrors.tuna.tsinghua.edu.cn/debian-security bookworm-security main contrib non-free non-free-firmware\n\' >> /etc/apt/sources.list

#RUN sed -i "s|http://deb.debian.org/debian|http://mirror.sjtu.edu.cn/debian|g" /etc/apt/sources.list
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources

RUN export DEBIAN_FRONTEND=noninteractive  && apt update -y && apt upgrade -y && apt install -y \
# autoconf \
# automake \
 git \
# gcc \
# g++ \
# libtool \
# lksctp-tools \
# libssl-dev \
# lsb-core \
# make \
 tar \
 unzip \
 wget \
 zip
RUN wget https://mirrors.tuna.tsinghua.edu.cn/Adoptium/8/jdk/aarch64/linux/OpenJDK8U-jdk_aarch64_linux_hotspot_8u392b08.tar.gz && tar zvxf OpenJDK8U-jdk_aarch64_linux_hotspot_8u392b08.tar.gz
ARG JDK_HOME=/jdk8u392-b08
ENV JAVA_HOME ${JDK_HOME}
ENV JRE_HOME $JAVA_HOME/jre
ENV CLASS_PATH=.:$JAVA_HOME/lib:$JRE_HOME/lib
ENV PATH ${PATH}:${JAVA_HOME}/bin:${JAVA_HOME}/jre/bin
WORKDIR /app
RUN git clone https://github.com/spring-projects/spring-framework -b v5.3.30 /app
#COPY . /app

RUN --mount=type=cache,mode=0777,target=/root/.gradle/,id=gradle ./gradlew :spring-context:build -x test
```


输出文件位于 `spring-context/build/libs/spring-context-5.3.30.jar`


修改代码后 同样出现和之前类似的错误

```
Execution failed for task ':spring-context:checkstyleMain'
```

解决方法一样，关闭`checkstyleMain`，这次只有这一个task


打点后输出的多个listener执行时间如下

```
2023-12-12 09:48:11.448 listener org.springframework.cloud.bootstrap.BootstrapApplicationListener@14bee915 org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:11.448 listener finish org.springframework.cloud.bootstrap.BootstrapApplicationListener@14bee915 org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:11.448 listener org.springframework.cloud.bootstrap.LoggingSystemShutdownListener@1115ec15 org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:11.448 listener finish org.springframework.cloud.bootstrap.LoggingSystemShutdownListener@1115ec15 org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:11.448 listener org.springframework.boot.env.EnvironmentPostProcessorApplicationListener@82ea68c org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:11.567 listener finish org.springframework.boot.env.EnvironmentPostProcessorApplicationListener@82ea68c org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:11.567 listener org.springframework.boot.context.config.AnsiOutputApplicationListener@59e505b2 org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:11.569 listener finish org.springframework.boot.context.config.AnsiOutputApplicationListener@59e505b2 org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:11.569 listener org.springframework.boot.context.logging.LoggingApplicationListener@3af0a9da org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:16.620 listener finish org.springframework.boot.context.logging.LoggingApplicationListener@3af0a9da org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:16.621 listener org.springframework.boot.autoconfigure.BackgroundPreinitializer@43b9fd5 org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:16.621 listener finish org.springframework.boot.autoconfigure.BackgroundPreinitializer@43b9fd5 org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:16.621 listener org.springframework.boot.context.config.DelegatingApplicationListener@8e50104 org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:16.621 listener finish org.springframework.boot.context.config.DelegatingApplicationListener@8e50104 org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:16.622 listener org.springframework.boot.context.FileEncodingApplicationListener@74a6f9c1 org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
2023-12-12 09:48:16.622 listener finish org.springframework.boot.context.FileEncodingApplicationListener@74a6f9c1 org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent[source=org.springframework.boot.SpringApplication@54eb2b70]
```

没想到拖后腿的居然是`LoggingApplicationListener`，这个类是boot提供的，兜兜转转又回来了，来看看他干了什么


根据事件类型，定位到119行

```java
    private void onApplicationEnvironmentPreparedEvent(ApplicationEnvironmentPreparedEvent event) {
        SpringApplication springApplication = event.getSpringApplication();
        if (this.loggingSystem == null) {
            this.loggingSystem = LoggingSystem.get(springApplication.getClassLoader());
        }

        this.initialize(event.getEnvironment(), springApplication.getClassLoader());
    }
```

继续对方法打点


最终定位到了`org.springframework.boot.system.ApplicationPid`第72行 `String jvmName = ManagementFactory.getRuntimeMXBean().getName();`，就慢在这个 `getName()` 上，而且只有第一次很慢。另外这行代码下面有过于耗时的一个warn日志，但是现在是在logging初始化阶段，所以这条日志没有输出，让我废了这么大功夫来定位


简单测试一下，果真是这里，第一次执行能有四五秒

```java
public static void main(String[] args) {
    long s = System.currentTimeMillis();
    RuntimeMXBean runtimeMXBean = ManagementFactory.getRuntimeMXBean();
    System.out.println(runtimeMXBean.getName());

    System.out.println((System.currentTimeMillis() - s));
    System.out.println(runtimeMXBean.getName());
    System.out.println((System.currentTimeMillis() - s));
}
```


## 解决

首先我使用的是mac mini的m2版本，所以解决方案也是针对mac系统，其他系统方法可能不通用


首先在网上找了个方法，简化为命令行如下

```shell
HOSTNAME=$(hostname) sudo echo "127.0.0.1  $HOSTNAME" >> /etc/hosts
```

结果未生效

继续往下深入，可定位到`InetAddress.getLocalHost()`，这是jdk的方法，没法打点了，再用这行代码为关键字检索

发现了[这篇文章](https://zhuanlan.zhihu.com/p/570660615)

其 hosts 文件写法和我的不一样

```
127.0.0.1   localhost Mac-mini.local
```

修改一下再测试，成功

---

简单测试了一下，只有文章中的写法才有效，只要单独一行都不行


使用上述测试代码打一个可执行包，放到docker里测试一下

docker run -it --rm -v ./exec.jar:/s.jar eclipse-temurin:8-jre-ubi9-minimal java -jar /s.jar

耗时正常


