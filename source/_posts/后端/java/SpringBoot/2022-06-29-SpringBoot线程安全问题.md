---
title: SpringBoot线程安全问题
date: 2022-06-29 10:17:06
tags: [并发, 多线程, 线程安全]
---

项目中使用到了ThreadLocal，在某次更新中出了问题，本以为只是把ThreadLocal remove就行了，结果却排查出一个线程安全问题

<!-- more -->


## 环境

项目基于 **SpringBoot-2.3.7.RELEASE** 版本构建，其他无关紧要

## 架构


首先介绍一下整体流程。

项目为了区分各个终端的版本，在**header**头里添加了**x-api**用于存储版本号

后端为了便于使用，将版本号写成了一个枚举，采用三位版本号。由于前后端版本号不会同步的原因，前端有时候会升级小版本号，为了后端不发版，就把枚举做了处理，将小版本号用**ThraedLocal**存储


基本代码如下：

```java

public enum Version implements Comparable<Version> {


    DEFAULT(1, 1, 0, true),
    _1_4_0(1, 4, 0, true),
    _2_0_0(2, 0, 0, true),
    ;

    private int high = 1;

    private int mid = 1;

    private int low = 0;


    private static final ThreadLocal<Integer> lowVersion = new ThreadLocal<>();

    Version(int high, int mid, int low, boolean swagger) {
        this.high = high;
        this.mid = mid;
        this.low = low;
        this.swagger = swagger;
    }


    public String value() {
        Integer integer = lowVersion.get();
        return String.format("%d.%d.%d", high, mid, integer == null ? low : integer);
    }

    public boolean swagger() {
        return swagger;
    }

    private static final Logger logger = LoggerFactory.getLogger(Version.class);

    public static Version convert(String api) {
        if (StringUtils.isBlank(api)) {
            return DEFAULT;
        }
        if (Constants.DEFAULT_VERSION.equals(api)) {
            return DEFAULT;
        }
        try {
            Version version = valueOf("_" + api.replaceAll("\\.", "_"));
            return version;
        } catch (IllegalArgumentException e) {

            // 没有对应的版本号，给一个大中版本都匹配的版本
            String[] split = api.split("\\.", 3);

            if (split.length != 3) {
                throw new UnsupportedVersionException(api);
            }
            Version[] values = values();
            for (int i = values.length - 1; i >= 0; i--) {

                if (split[0].equals(String.valueOf(values[i].high)) && split[1].equals(String.valueOf(values[i].mid))) {// 找到一个匹配的中版本，
                    try {
                        lowVersion.set(Integer.valueOf(split[2]));
                        return values[i];
                    } catch (NumberFormatException ex) {
                        throw new UnsupportedVersionException(api);
                    }
                }
            }
            throw new UnsupportedVersionException(api);
        }
    }

}


```


注意，上面使用到的ThreadLocal项我并没有调用remove，并非我忘了，而且我经过**“谨慎”**考虑，认为可以不清除，下次请求会给覆盖掉

开发过程中一切正常，后来上线过程中，有个接口需要获取版本号做判断，这时前端有两个版本，分别是2.0.0和2.0.1。

然后问题出现了，2.0.1的版本号判断正常，但是2.0.0的请求却出现了有时返回了2.0.1的判断逻辑。

就是说，后端有时候把2.0.0当2.0.0本身处理，有时候又给当成2.0.1给处理。

涉及的代码如下

```java

    @PostMapping("/audit_model")
    public R<Boolean> auditModel(HttpServletRequest request) {
        return R.ok(auditModelService.auditModel(getVersion()));
    }


// getVersion() 是其父类中的方法，这里贴出父类的逻辑


    /**
     * request对象
     */
    private HttpServletRequest request;

    /**
     * response对象
     */
    private HttpServletResponse response;

    /**
     * 获取request
     *
     * @return
     */
    public HttpServletRequest getRequest() {
        return request;
    }

    /**
     * 获取response
     *
     * @return
     */
    public HttpServletResponse getResponse() {
        return response;
    }

    @ModelAttribute
    public void setReqAndResp(HttpServletRequest request, HttpServletResponse response) {
        this.request = request;
        this.response = response;
    }


    protected Version getVersion() {
        return Version.convert(request.getHeader("x-api"));
    }

```


## 临时解决


出了问题之后，我一看代码就发现了问题所在。


问题出在 **ThreadLocal** 上，由于小版本号未清除，导致部分线程会保留小版本号，导致将2.0.0识别成2.0.1

立马上线解决方案，涉及接口不使用枚举类，直接使用字符串，问题解决

但是这个解决方案不够优雅，只是治标，只解决了这一个接口。其他接口如果有判断，还是会出错。

另一个治本的方法是增加枚举类，把小版本号写上，但是这就违背了我的初衷。



## 摸索治本方案

首先为了测试bug是否给修复，我使用了一个jmeter脚本，方案是启动多个线程，每个线程内首先以**2.0.1**去多次请求接口，保证把线程的**ThreadLocal**小版本号给覆盖，然后以**2.0.0**去请求接口，确定是否会出现版本识别出错问题。多个线程并发，且都执行多次


接着回滚临时解决方案，使用上面的脚本做测试，果然bug很轻易的就复现了，证明脚本逻辑正确。



然后在**Version.convert**开头首先清理掉**ThreadLocal**，为了以防万一，再在拦截器的后置处理器里清理一遍。


启动脚本，果然，bug很轻易地就解.....嗯？怎么还在？？


缺了大德了，为什么没解决呢？？？

算了，先打日志吧。

我在接口里将获取到的版本号给输出给前端。代码如下

```java
    public R<Boolean> auditModel(HttpServletRequest request) {
        return R.ok(data, MDC.get("traceId") + "  " + Thread.currentThread().getName() + "  " + request.getHeader("x-api") + " " + version.value() + " " + version);
    }
```

另外为了确定请求来源，还使用了 **MDC** 来输出一个UUID来标记请求。这里不多赘述



输出的错误情况就像这样

```json
{
    "msg": "d78d8911-a5d8-4451-84d1-894338b22959  http-nio-6784-exec-4  2.0.0 2.0.1 _latest",
    "other": null,
    "code": 200,
    "data": true
}
```

可以看出，获取到的版本号还是不一致，明明已经清理了**ThreadLocal**。


继续加日志，这次加在**Version.convert**方法里，记录一下传入的字符串类型版本号是多少


结果出乎意料

```

d78d8911-a5d8-4451-84d1-894338b22959 -19830284- 2022-06-29 10:14:44.539 [http-nio-6784-exec-4] INFO  com.ruoyi.common.core.enums.Version - [convert,70] - 给的 api=2.0.0,结果= 2.0.0 _2_0_0

d78d8911-a5d8-4451-84d1-894338b22959 -19830284- 2022-06-29 10:14:44.540 [http-nio-6784-exec-4] INFO  com.ruoyi.common.core.enums.Version - [convert,70] - 给的 api=2.0.0,结果= 2.0.0 _2_0_0
d78d8911-a5d8-4451-84d1-894338b22959 -19830284- 2022-06-29 10:14:44.548 [http-nio-6784-exec-4] INFO  com.ruoyi.common.core.enums.Version - [convert,87] - 给的 api=2.0.1,结果= 2.0.1 _latest
d78d8911-a5d8-4451-84d1-894338b22959 -19830284- 2022-06-29 10:14:44.548 [http-nio-6784-exec-4] DEBUG com.zfjs.app.mapper.AuditModelMapper.auditModel - [debug,137] - ==>  Preparing: select state from audit_model where version = ?
d78d8911-a5d8-4451-84d1-894338b22959 -19830284- 2022-06-29 10:14:44.549 [http-nio-6784-exec-4] DEBUG com.zfjs.app.mapper.AuditModelMapper.auditModel - [debug,137] - ==> Parameters: 2.0.1(String)
d78d8911-a5d8-4451-84d1-894338b22959 -19830284- 2022-06-29 10:14:44.552 [http-nio-6784-exec-4] DEBUG com.zfjs.app.mapper.AuditModelMapper.auditModel - [debug,137] - <==      Total: 1
```


枚举在同一个线程里接收到了**不同**的版本号，排查所有调用了**convert**方法的地方，最终怀疑是接口调用的**getVersion**方法内有问题


调整接口如下:

```java
    public R<Boolean> auditModel(HttpServletRequest request) {
        logger.info("req = {} -{}",request.getHeader("x-api"),getRequest().getHeader("x-api"));
        Version version = (getVersion());
        Boolean data = auditModelService.auditModel(version);
        return R.ok(data, MDC.get("traceId") + "  " + Thread.currentThread().getName() + "  " + request.getHeader("x-api") + " " + version.value() + " " + version);
    }

```


结果出现了关键性日志

```
d78d8911-a5d8-4451-84d1-894338b22959 -19830284- 2022-06-29 10:14:44.546 [http-nio-6784-exec-4] INFO  com.zfjs.app.controller.app.v1.AppVersionController - [auditModel,49] - req = 2.0.0 -2.0.1
```

两个地方获取的版本号不一致，从最上面贴出的代码可以发现，**getVersion**里调用的**request**是通过**@ModelAttribute**注入的，是不是这个注解不是线程安全的？

总之先替换掉**getVersion**方法之后，果然一切正常了。

