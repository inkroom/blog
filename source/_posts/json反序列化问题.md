---
title: json反序列化问题
date: 2020-03-12 16:37:38
tags: [java, json, 后端, 序列化]
---



使用fastjson反序列化数据不全；没想到设计上居然不报错



<!-- more -->



## 背景

 fastjson 在反序列化一段json数据是总会丢失某个属性。

 ## json数据

 ```json
 {
	"time":1,
	"contract":{
		"name":"1212",
		"notifyUrl":"http://localhost:20001",
		"userId":"1976220424287027200"
	}
	
}
 ```

## java

```java
public class NotifyMqMsg {

    private Contract contract;

    // 这是第几次通知，从0开始
    private int time;

    public NotifyMqMsg(Contract contract) {
        this.contract = contract;
    }

    public Contract getContract() {
        return contract;
    }

    public void setContract(Contract contract) {
        this.contract = contract;
    }

    public int getTime() {
        return time;
    }

    public void setTime(int time) {
        this.time = time;
    }

    @Override
    public String toString() {
        return JSON.toJSONString(this);
    }
}
```

每次反序列化的时候 **time** 属性始终为0.

## 解决

问题原因是 `NotifyMqMsg` 构造方法有问题，没有默认构造方法。但是fastjson居然不报错，jackson就会报错。大概是采用的方案不同