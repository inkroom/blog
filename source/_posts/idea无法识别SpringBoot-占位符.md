---
title: idea无法识别SpringBoot @占位符
date: 2020-05-13 16:35:46
tags: [java, 后端, idea] 
---



idea部分情况下出现不识别占位符

<!-- more -->



### 背景

idea下启动SpringBoot项目

配置文件中使用了@@占位符获取maven中的配置项

idea启动时报错

```
'@' that cannot start any token. (Do not use @ for indentation)
```

### 解决方案

pom.xml中添加如下内容
```xml
   <resources>
            <resource>
                <directory>src/main/resources</directory>
                <filtering>true</filtering>
            </resource>
        </resources>
```

`plugins`中添加如下内容

```xml

 <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-resources-plugin</artifactId>
                <version>2.7</version>
                <configuration>
                    <delimiters>
                        <delimiter>@</delimiter>
                    </delimiters>
                    <useDefaultDelimiters>false</useDefaultDelimiters>
                </configuration>
            </plugin>

```

---
如果上述方案不奏效，可以尝试执行`mvn spring-boot:run` 之后就不会出错了

或者可以直接修改target/classes/application.yml 文件


### 参考资料
[原来你不是这样的BUG(1):found character '@' that cannot start any token. (Do not use @ for indentation)](https://www.jianshu.com/p/a77b48166327)