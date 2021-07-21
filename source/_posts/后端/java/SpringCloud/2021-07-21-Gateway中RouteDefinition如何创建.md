---
title: Gateway中RouteDefinition如何创建
date: 2021-07-21 21:40:01
tags: [java,SpringCloud,Gateway,动态路由]
---

在Gateway中实现动态路由需要使用到一个RouteDefinition类，本文将探讨这个类该如何填充数据

<!-- more -->

## 序

**RouteDefinition**是Gateway中用于存储路由元数据的类，其内可分为三部分：

- 路由本身
- 断言
- 过滤器

## 路由

路由本身有三个数据：

- `String id` 路由id，gateway中没有要求id唯一，只是一个便于定位和查看的标志
- `URI uri` 要代理的url，支持服务发现就写成**lb://appName**
- `int order` 顺序

## 断言

断言是存放在`ist<PredicateDefinition>`中，再查看`PredicateDefinition`的属性

- `String name` 断言的名称，在内置的断言中，例如`HostRoutePredicate`，其name就**Host**
- `Map<String, String> args` 这里是断言可能存在的参数，这里较为复杂，后续和过滤器一并解释

## 过滤器

过滤器存放在`List<FilterDefinition> filters`中，再查看`FilterDefinition`的属性

- `String name` 过滤器的名称，在内置的过滤器中，例如`RemoveCachedBodyFilter`，其name就**RemoveCachedBody**
- `Map<String, String> args` 这里是断言可能存在的参数，这里较为复杂，后续和过滤器一并解释

注意，这里没有**order**属性，可见不支持排序

## 参数注入

在断言和过滤器中传递的参数解析涉及一个`org.springframework.cloud.gateway.support.ShortcutConfigurable.ShortcutType`的枚举类，其不同的枚举值代表不同的解析方式。

比如`ShortcutType.GATHER_LIST`，其源码如下
```java
GATHER_LIST {
    @Override
    public Map<String, Object> normalize(Map<String, String> args,
            ShortcutConfigurable shortcutConf, SpelExpressionParser parser,
            BeanFactory beanFactory) {
        Map<String, Object> map = new HashMap<>();
        // field order should be of size 1
        List<String> fieldOrder = shortcutConf.shortcutFieldOrder();
        Assert.isTrue(fieldOrder != null && fieldOrder.size() == 1,
                "Shortcut Configuration Type GATHER_LIST must have shortcutFieldOrder of size 1");
        String fieldName = fieldOrder.get(0);
        map.put(fieldName,
                args.values().stream()
                        .map(value -> getValue(parser, beanFactory, value))
                        .collect(Collectors.toList()));
        return map;
    }
},
```

可以看出这里不关心map中的key值，只把value值给转成一个list。

gateway中断言和过滤器基本都是通过工程模式创建的，所以假设我需要找`HostRoutePredicate`的参数解析方式，那么就需要去看`HostRoutePredicateFactory`中的`public ShortcutType shortcutType()`方法


除了查看枚举类以外，工厂类里面都有一个`Config`内部类，里面存放的就是解析完成的参数。此处以`RewritePathFilter`为例，查看复合参数应该怎么写。

```java
public static final String REGEXP_KEY = "regexp";
public static final String REPLACEMENT_KEY = "replacement";

public RewritePathGatewayFilterFactory() {
    super(Config.class);
}

@Override
public List<String> shortcutFieldOrder() {
    return Arrays.asList(REGEXP_KEY, REPLACEMENT_KEY);
}

public static class Config {
    private String regexp;
    private String replacement;

}

```

注意`shortcutFieldOrder()`方法返回了一个包含参数key的list，我本以为这里代表args里的key，实际上只表示了将`FilterDefinition.arg`中的value对应key给替换掉，实际效果就是

> _genkey_0=regex 替换后 regex=regex
> _genkey_0=replacement 替换后 replacement=replacement


所以我们只需要关心key的顺序就可以了。

简单理解一下，虽然args是一个map，但是在实际用于构造前都是在当成一个List使用。

----

以下再提供一个样例

```json

[
	{
		"id": "admin-server",
		"predicates": [{
				"name": "Path",
				"args": {
					"patterns": "/admin-server/**"
				}
			},
			{
				"name": "Host",
				"args": {
					"1": "yapi.bcyunqian.com",
					"2": "yq.pre.bcyunqian.com",
					"3": "www.bcyunqian.com"
				}
			}
		],
		"filters": [{
				"name": "PreserveHostHeader",
				"args": {}
			},
			{
				"name": "StripPrefix",
				"args": {
					"1": "1"
				}
			}
		],
		"uri": "lb://admin-server",
		"order": 0
	},
]

```


