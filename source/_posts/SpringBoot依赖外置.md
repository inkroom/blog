---
title: SpringBoot依赖外置
date: 2020-05-13 16:36:44
tags: java,SpringBoot,maven,后端
---



近期有个SpringBoot的项目需要频繁更新，但是每次上传到服务器上几十MB，实在是花时间，所以打算优化打包方案，将第三方依赖外置



<!-- more -->

### 背景

近期有个SpringBoot的项目需要频繁更新，但是每次上传到服务器上几十MB，实在是花时间，所以打算优化打包方案，将第三方依赖外置

### 流程

- 首先使用SpringBoot打包插件将第三方排除，但是一些版本号同步更新的本地模块依赖需要放到一个jar中
- 使用maven dependency插件将第三方依赖复制到构建目录中
- 使用maven过滤功能实现一个启动脚本
- 使用assembly打包一个完整版，包括boot jar，第三方依赖，启动脚本
- 第一次部署使用完整版，后续更新只需要上传boot jar就行了


### 实现方法



首先在 **resource** 目录中准备一个脚本

内容如下

```
java -Dloader.path=lib/ -Dfile.encoding=utf-8 -jar @project.build.finalName@.jar

```

其中 **@project.build.finalName@** 是最后生成的可执行jar的文件名
path指定第三方依赖目录

---


其次修改pom文件如下

```xml

    <build>
        <resources>
            <resource>
            <!-- 启用maven过滤，主要为脚本做准备 -->
                <directory>src/main/resources</directory>
                <filtering>true</filtering>
             </resource>
        </resources>

        <finalName>${project.artifactId}-${project.version}-${spring.active}</finalName>

        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <mainClass>xxx.Application</mainClass>

                    <layout>ZIP</layout>
                    <executable>true</executable>
                    <includes>
                    <!-- 以下为需要打包到jar中的本地模块依赖，主要是版本号需要更新，如果放到第三方依赖中，可能会出现多个版本  -->
                        <include>
                            <groupId>xxx.xxx</groupId>
                            <artifactId>upload-starter</artifactId>
                        </include>
                        <include>
                            <groupId>xxx.xxx</groupId>
                            <artifactId>pay</artifactId>
                        </include>
                        <include>
                            <groupId>${project.parent.groupId}</groupId>
                            <artifactId>swagger-starter</artifactId>
                        </include>
                    </includes>

                </configuration>
            </plugin>

            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-dependency-plugin</artifactId>
                <executions>
                    <execution>
                        <id>copy-dependencies</id>
                        <phase>package</phase>
                        <goals>
                            <goal>copy-dependencies</goal>
                        </goals>
                        <configuration>
          <!-- 输出的第三方依赖位置 -->          <outputDirectory>${project.build.directory}/lib</outputDirectory>
                            <overWriteReleases>false</overWriteReleases>
                            <!-- 此处排除需要打到boot jar中的本地模块依赖 -->
                            <excludeGroupIds>
                                ${project.parent.groupId},xxx.xxx
                            </excludeGroupIds>
                        </configuration>
                    </execution>
                </executions>
            </plugin>

            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-assembly-plugin</artifactId>
                <configuration>
                    <descriptors>
                        <descriptor>assembly.xml</descriptor>
                    </descriptors>
                </configuration>
                <executions>
                    <execution><!-- 配置执行器 -->
                        <id>make-assembly</id>
                        <phase>package</phase><!-- 绑定到package生命周期阶段上 -->
                        <goals>
                            <goal>single</goal><!-- 只运行一次 -->
                        </goals>

                        <!--                        <configuration>-->
                        <!--                            <finalName>${project.name}</finalName>-->

                        <!--                            <descriptor>src/main/assembly.xml</descriptor>&lt;!&ndash;配置描述文件路径&ndash;&gt;-->
                        <!--                        </configuration>-->
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
```

---

在 **pom.xml** 同级目录创建 **assembly.xml**

内容如下
```xml
<assembly>
    <id>release</id>
    <formats>
        <format>zip</format><!--打包的文件格式,也可以有：war zip-->
    </formats>
    <!--tar.gz压缩包下是否生成和项目名相同的根目录-->
    <includeBaseDirectory>false</includeBaseDirectory>
    
    <!-- 如果使用这个，也可以不使用maven-dependency插件 -->
<!--    <dependencySets>-->
<!--        <dependencySet>-->
<!--            &lt;!&ndash;是否把本项目添加到依赖文件夹下&ndash;&gt;-->
<!--            <useProjectArtifact>true</useProjectArtifact>-->
<!--            <outputDirectory>lib</outputDirectory>-->
<!--            &lt;!&ndash;将scope为runtime的依赖包打包&ndash;&gt;-->
<!--            <scope>runtime</scope>-->
<!--        </dependencySet>-->
<!--    </dependencySets>-->
    <fileSets>
        <fileSet>
            <directory>${project.build.directory}/lib</directory>
            <outputDirectory>/lib</outputDirectory>
        </fileSet>
    </fileSets>
    <files>
        <file>
            <source>target/${build.finalName}.jar</source>
            <outputDirectory>/</outputDirectory>
        </file>
        <file>
           <!-- 此处将脚本复制两份，分别对应类unix和windows系统，注意，maven过滤之后的文件在target目录下 --> <source>${project.build.directory}/classes/start.sh</source>
            <outputDirectory>/</outputDirectory>
            <destName>start.bat</destName>
        </file>
        <file>
            <source>${project.build.directory}/classes/start.sh</source>
            <outputDirectory>/</outputDirectory>
            <destName>start.sh</destName>
        </file>
    </files>
</assembly>


```

### 最终效果

![TIM图片20191205091306](https://user-images.githubusercontent.com/27911304/70195072-87fb6700-173f-11ea-8431-e96d6b92690e.png)


可以很明显的看出两个方式打包的大小差异

---

完整版的目录结构
![04ACB025-7C19-4a98-9351-2E6AD9007E23](https://user-images.githubusercontent.com/27911304/70195270-30113000-1740-11ea-8a3d-db9eed190719.png)