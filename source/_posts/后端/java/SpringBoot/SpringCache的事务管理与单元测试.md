---
title: SpringCache的事务管理与单元测试
date: 2020-03-08 16:37:24
tags: [java, 后端, 事务, cache]
---



在某个项目中，使用了SpringCache redis作为缓存解决方案，jpa作为orm

在单元测试时，在执行某步操作时，需要往缓存中放入数据，之后启用断言判断对应的缓存是否存在，结果全部报缓存不存在



<!-- more -->



## 项目背景

在某个项目中，使用了SpringCache redis作为缓存解决方案，jpa作为orm

在单元测试时，在执行某步操作时，需要往缓存中放入数据，之后启用断言判断对应的缓存是否存在，结果全部报缓存不存在



## 项目配置

### springCache

```java
 @Bean
    public CacheManager cacheManager(RedisConnectionFactory factory, RedisSerializer serializer) {
        log.info("[缓存配置] - 注入缓存管理器");
        return RedisCacheManager.builder(factory)
                //默认缓存时间
                .cacheDefaults(
                        getRedisCacheConfigurationWithTtl(300)
                                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(serializer))
                )

                .transactionAware()//注意，这里是开启了redis 事务
                //自定义缓存时间
                .withInitialCacheConfigurations(getRedisCacheConfigurationMap())
                .build();
    }

```

### 单元测试

```java 
@RunWith(SpringJUnit4ClassRunner.class)
@Transactional //这里和下一行代表测试用例结束后自动回滚
@Rollback
@SpringBootTest
public abstract class BasicMockControllerTest {
}
```

### 缓存调用

```java

   @CachePut(key = "#result.id")
    @Override
    public User update(User user) {
        user = userRepository.save(user);
        return user;
    }
```

## 相关源码

### springCache事务管理逻辑

在`org.springframework.cache.transaction.AbstractTransactionSupportingCacheManager#decorateCache` 中

```java
    public boolean isTransactionAware() {
		return this.transactionAware;
	}

	@Override
	protected Cache decorateCache(Cache cache) {
		return (isTransactionAware() ? new TransactionAwareCacheDecorator(cache) : cache);
	}

```

其中`this.transactionAware`来自 之前配置的 `transactionAware()`方法，对应值为true

因此，这里会创建一个有事务管理的Cache实现

---

在`TransactionAwareCacheDecorator`中，核心方法 put 中，会根据配置了事务决定逻辑

代码如下
```java 
	@Override
	public void put(final Object key, @Nullable final Object value) {
		if (TransactionSynchronizationManager.isSynchronizationActive()) {
			TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronizationAdapter() {
				@Override
				public void afterCommit() {
					TransactionAwareCacheDecorator.this.targetCache.put(key, value);
				}
			});
		}
		else {
			this.targetCache.put(key, value);
		}
	}
```

---

### 事务何时提交

根据测试，redis事务提交时机同jdbc事务；即jdbc事务结束，提交时，redis也一起提交，相反则一起回滚


在Spring中，redis事务总是和jdbc事务相关联。

而我在单元测试中，配置了事务回滚，因此在写缓存断言的时候，事务尚未结束，redis 还不能决定提交还是回滚，此时缓存中肯定没有数据。当测试用例结束后，事务自动回滚，redis也回滚，所以手动去redis查看时，也没有数据