---
title: 自建git-lfs-server
date: 2023-02-27 14:17:05
tags: [git, lfs, cmake, c]
---

git-lfs是git对于二进制文件管理的一种扩展，可以减小仓库体积。

<!-- more -->

## 背景

我的[图片库](https://github.com/inkroom/image)由于存放了大量的图片，发现仓库本身高达**5G**，其中 **.git** 目录就占了一半，应该是每一个二进制文件就会有个备份，再加上被删除的文件。

尝试过重建commit历史，但是依然没减小。

后来了解到[git-lfs](https://github.com/git-lfs/git-lfs)，github的lfs仓库就给**1G**，等于没有，于是准备自建一个。

由于个人的兴趣爱好原因，准备使用**C**来实现

## 项目搭建

经过一通搜索，找到了一个C的web框架[facil.io](https://facil.io)，正常情况下，应该没什么人会用纯C写web，起码也要用C++，所以能找到一个框架真不容易

C的编译可以命令行，本次选择使用**CMake**。

开发软件使用[VSCode](https://code.visualstudio.com/)

开发环境搭建使用之前搞出来的[docker镜像](https://gist.github.com/inkroom/501548078a930c6f3bd98ea257409648)，再用VSCode远程开发

由于我对CMake完全不熟悉，所以用了一个[插件](https://marketplace.visualstudio.com/items?itemName=ChenPerach.c-cpp-cmake-project-creator)来新建项目。

----

插件本身只是创建基础的目录结构，启动脚本之类的。源代码初始化需要使用**facil**提供的[脚本](https://github.com/boazsegev/facil.io)

```shell
bash <(curl -s https://raw.githubusercontent.com/boazsegev/facil.io/master/scripts/new/app) appname
```

上面的两个步骤需要两个单独的文件夹，之后把脚本创建的目录里的 **.c** 和 **.h** 复制到插件目录里。

为了引入**facil**依赖，将其源码作为git子模块引入

```shell
git submodule add https://github.com/boazsegev/facil.io
```

最后目录结构如下

```
 . 
 ├── CMakeLists.txt 
 ├── LICENSE
 ├── README.md
 ├── facil.io
 ├── include
 │   ├── cli.h
 │   ├── http_service.h
 │   └── main.h
 └── src
     ├── cli.c
     ├── http_service.c
     └── main.c
```



## 协议文档

本次要实现一个最简单的lfs服务器，相关文档可以查看[lfs仓库](https://github.com/git-lfs/git-lfs/tree/main/docs/api)



## 路由

facil是个基础的web框架，没有路由功能，不过没有正好，本来也不需要那些功能。

这里只需要实现一个 **Batch** 接口，只需要以下代码就能判断url

```c
static void on_http_request(http_s *h)
{
  /* set a response and send it (finnish vs. destroy). */

  fio_str_info_s path = fiobj_obj2cstr(h->path);

  fio_str_info_s method = fiobj_obj2cstr(h->method);

  fio_str_info_s body = fiobj_obj2cstr(h->body);

  if (strcmp(path.data, LFS_BATCH_URL_PATH) == 0)
  {
    batch_request(h);
  }
  else
  {
  }
}
```

`LFS_BATCH_URL_PATH`是一个字符串宏，具体内容是：

```c
#define LFS_BATCH_URL_PATH "/objects/batch"
```


c语言作为早期的高级语言，功能比较原始。比如字符串是用字符数组——实际上很多更高级的语言也是这样——实现的，所以很多库都需要自己用结构体来定义字符串，上面的`fio_str_info_s`是**facil**定义的，之后还有别的库定义的字符串

## 逻辑

```c

void _batch_request(http_s *h, FIOBJ jsonBody, lfs_item_each each)
{

    printf("request 1\n");
    FIOBJ objectsKey = fiobj_str_new("objects", strlen("objects"));
    FIOBJ objects = fiobj_hash_get(jsonBody, objectsKey);

    if (!fiobj_type_is(objects, FIOBJ_T_ARRAY))
    {
        printf("not allowed json body ");

        fio_free(objects);
        fio_free(objectsKey);

        return;
    }
    printf("request 2\n");

    // 构建要返回的数据结构
    FIOBJ res = fiobj_hash_new2(3);
    FIOBJ transferKey = fiobj_str_new("transfer", strlen("transfer"));
    FIOBJ basic = fiobj_str_new("basic", strlen("basic"));

    FIOBJ hash_algo_key = fiobj_str_new("hash_algo", strlen("hash_algo"));
    FIOBJ sha256 = fiobj_str_new("sha256", strlen("sha256"));
    fiobj_hash_set(res, transferKey, basic);
    fiobj_hash_set(res, hash_algo_key, sha256);

    size_t count = fiobj_ary_count(objects);
    printf("request 3");

    // FIOBJ authenticated = fiobj_str_new("true", strlen("true"));

    int i = 0;
    for (i = 0; i < count; i++)
    {
        FIOBJ item = fiobj_ary_index(objects, i);
        printf("request 4\n");

        each(item);
        printf("request 5\n");

        // fio_free(item);
    }

    fiobj_hash_set(res, objectsKey, objects);
    FIOBJ f = fiobj_obj2json(res, 1);
    fio_str_info_s res_str = fiobj_obj2cstr(f);
    fiobj_free(f);

    printf("res %s\n", res_str.data);
    FIOBJ contentTypeKey = fiobj_str_new("Content-Type", strlen("Content-Type"));
    FIOBJ contentType = fiobj_str_new("application/vnd.git-lfs+json", strlen("application/vnd.git-lfs+json"));
    int r = http_set_header(h, contentTypeKey, contentType);
    printf("set content type %d\n", r);
    http_send_body(h, res_str.data, res_str.len);

    fiobj_free(objects);
    fiobj_free(objectsKey);

    fiobj_free(contentTypeKey);
    fiobj_free(contentType);

    fiobj_free(hash_algo_key);
    fiobj_free(sha256);

    fiobj_free(transferKey);
    fiobj_free(basic);

    fiobj_free(res);

    // fio_free(oidKey);
    // fio_free(sizeKey);
    // fio_free(objects);
    // fio_free(objectsKey);
}
```
---

`lfs_item_each`是一个函数指针，upload和download有不同的实现，由于逻辑本身很简单，不再贴代码了，要看可以直接去[仓库](https://github.com/inkroom/git-lfs-server-c)


## 存储

**git-lfs**本身不负责存储，只是负责提供存储相关的API。本次采用[腾讯云COS](https://github.com/tencentyun/cos-c-sdk-v5)作为存储

需要调用两个核心方法**cos_gen_presigned_url**和**cos_gen_object_url**；一个是上传用url，一个是下载用url。

COS库本身的编译安装这里略过不提


由于引入了第三方库，所以需要修改**CMakeLists.txt**，参考cos提供的demo里的，直接把内容拷贝过来，最后就是这样

```CMake
cmake_minimum_required(VERSION 3.14)


set(PROJECT_N lfs)
project(${PROJECT_N} VERSION 1.0)

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED True)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON) # 最好只在debug下生成这个，或者 -DCMAKE_EXPORT_COMPILE_COMMANDS=on

# if (WIN32 OR MSVC)
#     set(CMAKE_FIND_LIBRARY_SUFFIXES ".lib")
# elseif (UNIX)
#     # 仅查找静态库，强制后缀为 .a
#     set(CMAKE_FIND_LIBRARY_SUFFIXES ".a")

#     # 如果只是优先查找静态库，保证 .a 后缀在前面即可，把默认的后缀加上
#     # set(CMAKE_FIND_LIBRARY_SUFFIXES .a ${CMAKE_FIND_LIBRARY_SUFFIXES})
# endif()


file(GLOB_RECURSE SRCS ${PROJECT_SOURCE_DIR}/src/*.c)

# a macro that gets all of the header containing directories. 
MACRO(header_directories return_list includes_base_folder extention)
    FILE(GLOB_RECURSE new_list ${includes_base_folder}/*.${extention})
    SET(dir_list "")
    FOREACH(file_path ${new_list})
        GET_FILENAME_COMPONENT(dir_path ${file_path} PATH)
        SET(dir_list ${dir_list} ${dir_path})
    ENDFOREACH()
    LIST(REMOVE_DUPLICATES dir_list)
    SET(${return_list} ${dir_list})
ENDMACRO()
# a macro that gets all of the header containing directories.
header_directories(INCLUDES ${PROJECT_SOURCE_DIR}/include/ h)

# include(FetchContent)
# FetchContent_Declare(curl
#         GIT_REPOSITORY https://github.com/curl/curl.git
#         GIT_TAG 7.88.1)
# FetchContent_MakeAvailable(curl)

# add_subdirectory(cos-c-sdk-v5)


# find_package(libcos_c_sdk)



FIND_PROGRAM(APR_CONFIG_BIN NAMES apr-config apr-1-config PATHS /usr/bin /usr/local/bin /usr/local/apr/bin/)
FIND_PROGRAM(APU_CONFIG_BIN NAMES apu-config apu-1-config PATHS /usr/bin /usr/local/bin /usr/local/apr/bin/)

IF (APR_CONFIG_BIN)
    EXECUTE_PROCESS(
        COMMAND ${APR_CONFIG_BIN} --includedir
        OUTPUT_VARIABLE APR_INCLUDE_DIR
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )
    EXECUTE_PROCESS(
        COMMAND ${APR_CONFIG_BIN} --cflags
        OUTPUT_VARIABLE APR_C_FLAGS
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )
    EXECUTE_PROCESS(
        COMMAND ${APR_CONFIG_BIN} --link-ld
        OUTPUT_VARIABLE APR_LIBRARIES
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )
ELSE()
    MESSAGE(FATAL_ERROR "Could not find apr-config/apr-1-config")
ENDIF()

IF (APU_CONFIG_BIN)
    EXECUTE_PROCESS(
        COMMAND ${APU_CONFIG_BIN} --includedir
        OUTPUT_VARIABLE APR_UTIL_INCLUDE_DIR
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )
    EXECUTE_PROCESS(
        COMMAND ${APU_CONFIG_BIN} --cflags
        OUTPUT_VARIABLE APU_C_FLAGS
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )
    EXECUTE_PROCESS(
        COMMAND ${APU_CONFIG_BIN} --link-ld
        OUTPUT_VARIABLE APU_LIBRARIES
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )
ELSE()
    MESSAGE(FATAL_ERROR "Could not find apu-config/apu-1-config")
ENDIF()

#curl-config
FIND_PROGRAM(CURL_CONFIG_BIN NAMES curl-config)
  
IF (CURL_CONFIG_BIN)
    EXECUTE_PROCESS(
        COMMAND ${CURL_CONFIG_BIN} --libs
        OUTPUT_VARIABLE CURL_LIBRARIES
        OUTPUT_STRIP_TRAILING_WHITESPACE
        )
ELSE()
    MESSAGE(FATAL_ERROR "Could not find curl-config")
ENDIF()
# set(CURL_LIBRARY "-lcurl") 
# find_package(CURL REQUIRED) 

include_directories (${APR_INCLUDE_DIR})
include_directories (${APR_UTIL_INCLUDE_DIR})
include_directories (${MINIXML_INCLUDE_DIR})
include_directories (${CURL_INCLUDE_DIR})
# include_directories("include/curl")
# message("url ${CURL_INCLUDE_DIRS}")
include_directories ("/usr/local/include/cos_c_sdk")

find_library(APR_LIBRARY apr-1 PATHS /usr/local/apr/lib/)
find_library(APR_UTIL_LIBRARY aprutil-1 PATHS /usr/local/apr/lib/)
find_library(MINIXML_LIBRARY mxml)
find_library(CURL_LIBRARY curl)
find_library(COS_LIBRARY cos_c_sdk PATHS /usr/local/lib/)

add_subdirectory(facil.io)
message(STATUS ${SRCS})
add_executable(${PROJECT_N} ${SRCS})

target_include_directories(${PROJECT_N} PUBLIC include )
target_link_libraries(${PROJECT_N} facil.io)
# target_link_libraries(${PROJECT_N} PRIVATE  cos_c_sdk::cos_c_sdk)
target_link_libraries(${PROJECT_N} ${COS_LIBRARY})
target_link_libraries(${PROJECT_N} ${APR_UTIL_LIBRARY})
target_link_libraries(${PROJECT_N} ${APR_LIBRARY})
target_link_libraries(${PROJECT_N} ${MINIXML_LIBRARY})

# target_link_libraries(${PROJECT_N} curl)
target_link_libraries(${PROJECT_N} ${CURL_LIBRARY})

```


## docker镜像

C程序过于依赖环境，所以最好使用docker镜像来运行构建产物。

采用docker**多阶段构建**，对docker版本要求较高，公司的测试服务器版本就很低，不支持该特性


```Dockerfile
FROM ubuntu:20.04
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone && export DEBIAN_FRONTEND=noninteractive
# libapr1-dev
RUN sed -i "s@http://.*archive.ubuntu.com@http://mirrors.huaweicloud.com@g" /etc/apt/sources.list \
    && sed -i "s@http://.*security.ubuntu.com@http://mirrors.huaweicloud.com@g" /etc/apt/sources.list \
    && apt update -y && apt upgrade -y
RUN apt install -y cmake g++  libaprutil1-dev libcurl4-openssl-dev curl wget git libssl-dev
RUN wget https://github.com/michaelrsweet/mxml/releases/download/v3.3.1/mxml-3.3.1.tar.gz \
    && tar -zxf mxml-3.3.1.tar.gz && cd mxml-3.3.1 && ./configure  && make && make install
RUN wget https://dlcdn.apache.org/apr/apr-1.7.2.tar.gz \
    && tar -zxf apr-1.7.2.tar.gz && cd apr-1.7.2 && ./configure  && make && make install
RUN wget https://github.com/tencentyun/cos-c-sdk-v5/archive/refs/tags/v5.0.16.tar.gz \
    && tar -zxf v5.0.16.tar.gz && cd cos-c-sdk-v5-5.0.16 && cmake .  && make && make install
RUN wget https://curl.se/download/curl-7.88.1.tar.gz
RUN apt install -y libssl-dev
RUN tar -zxf curl-7.88.1.tar.gz && cd curl-7.88.1/ && ./configure --disable-ldap --disable-ldaps --with-openssl && make && make install

ADD . /data
RUN cd /data && git submodule update --init --recursive && mkdir /data/build && cd /data/build && cmake .. && make && chmod +x lfs && cp ../entrypoint.sh ./ && chmod +x entrypoint.sh  && cp ../pack.sh ./  && mkdir lib && sh pack.sh  
RUN 





FROM ubuntu:20.04
COPY --from=0  /data/build/ /lfs
EXPOSE 3000
ENTRYPOINT ["/lfs/entrypoint.sh"]
```

---


有几点需要注意，现在都是动态编译的，单个文件无法运行，需要一堆.so动态库，所以需要使用`pack.sh`来拷贝依赖，`entrypoint.sh`来运行程序

**pack.sh**

```shell
exe="lfs" # 这里是最终构建的可执行程序的名字
des="$(pwd)/lib"
echo $des
deplist=$(ldd $exe | awk '{if (match($3,"/")){ printf("%s "),$3 } }')
cp $deplist $des
```

**entrypoint.sh**

```shell
#!/bin/sh
dirname=`dirname $0`
tmp="${dirname#?}"
if [ "${dirname%$tmp}" != "/" ]; then
dirname=$PWD/$dirname
fi
LD_LIBRARY_PATH=$dirname/lib
export LD_LIBRARY_PATH
echo $LD_LIBRARY_PATH
$dirname/lfs "$@"
```

基础原理就是告诉Linux系统去哪里找对应的动态库文件。

但是上面拷贝的动态库实际上是不全的，缺少**glibc**，这一部分一般由操作系统提供，所以最终使用的运行镜像是**Ubuntu:20.04**，不能使用诸如**alpine**、**busybox**之类的精简镜像，因为没有匹配的环境


## 静态编译

由于动态库下最终镜像体积高达**87MB**，实在是太大了，所以尝试使用静态编译，然后更新精简镜像来缩小体积


想要实现动态编译，就要告诉CMake去查找 **.a** 文件，可以添加以下代码

```CMake
if (WIN32 OR MSVC)
    set(CMAKE_FIND_LIBRARY_SUFFIXES ".lib")
elseif (UNIX)
    # 仅查找静态库，强制后缀为 .a
    set(CMAKE_FIND_LIBRARY_SUFFIXES ".a")

#     # 如果只是优先查找静态库，保证 .a 后缀在前面即可，把默认的后缀加上
#     # set(CMAKE_FIND_LIBRARY_SUFFIXES .a ${CMAKE_FIND_LIBRARY_SUFFIXES})
endif()

```
注意 cos 库的 .a 文件名与常规命名规则不同，修改一下

```CMake
find_library(COS_LIBRARY libcos_c_sdk_static.a PATHS /usr/local/lib/)
```

---

由于我不知道的原因，静态编译需要把动态编译下不需要关心的依赖的依赖也给加进来，这里主要是 **liburl** 的一些依赖

```CMake

find_library(IDN_LIBRARY idn)
find_library(SSL_LIBRARY ssl)
find_library(C_LIBRARY crypto)
find_library(DL_LIBRARY dl)


target_link_libraries(${LIBRARY_N} ${IDN_LIBRARY} ${SSL_LIBRARY} ${C_LIBRARY} ${DL_LIBRARY} ${THREAD_LIBRARY})

```


Docker镜像可以使用**busybox**，我还调整curl编译参数，去掉一些不需要的功能。最终产物就只有**12.1MB**了，比较完美


## 其他

可以使用github actions来构建docker镜像，并发布到github packages，这里不再赘述







## 参考资料

- [git-lfs](https://github.com/git-lfs/git-lfs)
- [自行构建GIT LFS服务](https://zhuanlan.zhihu.com/p/511750788)
- [https://zhuanlan.zhihu.com/p/437865866](https://zhuanlan.zhihu.com/p/437865866)
