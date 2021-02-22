---
title: SpringBoot对于配置项的读取和设置
date: 2020-10-16 16:12:18
tags: [SpringBoot, 配置项读取, 源码]
---

项目中需要对配置文件中的配置项进行加密，因此研究一下SpringBoot的配置项处理



<!-- more -->



## 前人栽树

搜索了一下，常用的配置项加密方案是**[jasypt](https://github.com/ulisesbocchio/jasypt-spring-boot)**；

这是一个已经完善的方案，基本上直接引入就可以用了。但是项目中要求的加解密算法比较特殊，不能用这个项目，因此需要研究一下。

## 配置项读取

SpringBoot中配置项读取是使用`ConfigFileApplicationListener`实现了，最终会将配置项封装到`PropertySource`的实现类里。

## 配置项使用

读取到配置项后，需要把值给到各个bean。其中主要负责是通过`PropertySouurcesPropertyResolver`实现的，其中这个类负责提供配置项，同时还需要处理占位符等。

----

现在找到了读取和设置，但是还是不清楚其中的数据是如何流动的。

通过对`PropertySourcesPropertyResolver`的构造方法进行debug，发现其在`AbstractEnviorment`、`LoggingSystemProperties`、`PropertSourcesPlaceholderConfiurer`被创建了实例。

环境类中创建的**Resolver** ，没有给存储了配置项的`PropertySource`

```java
package org.springframework.core.env;
public abstract class AbstractEnvironment implements ConfigurableEnvironment {
		private final ConfigurablePropertyResolver propertyResolver =
			new PropertySourcesPropertyResolver(this.propertySources);  
}
```



所以没有多大意义。



另外两个类给传入的参数都是基本一致的，从类名推测，重点研究对象应该是`PropertSourcesPlaceholderConfiurer`

### `PropertySourcesPlaceholderConfiurer



重点方法如下



```java
/**
	 * Processing occurs by replacing ${...} placeholders in bean definitions by resolving each
	 * against this configurer's set of {@link PropertySources}, which includes:
	 * <ul>
	 * <li>all {@linkplain org.springframework.core.env.ConfigurableEnvironment#getPropertySources
	 * environment property sources}, if an {@code Environment} {@linkplain #setEnvironment is present}
	 * <li>{@linkplain #mergeProperties merged local properties}, if {@linkplain #setLocation any}
	 * {@linkplain #setLocations have} {@linkplain #setProperties been}
	 * {@linkplain #setPropertiesArray specified}
	 * <li>any property sources set by calling {@link #setPropertySources}
	 * </ul>
	 * <p>If {@link #setPropertySources} is called, <strong>environment and local properties will be
	 * ignored</strong>. This method is designed to give the user fine-grained control over property
	 * sources, and once set, the configurer makes no assumptions about adding additional sources.
	 */
	@Override
	public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
		if (this.propertySources == null) {
			this.propertySources = new MutablePropertySources();
			if (this.environment != null) {
				this.propertySources.addLast(
					new PropertySource<Environment>(ENVIRONMENT_PROPERTIES_PROPERTY_SOURCE_NAME, this.environment) {
						@Override
						@Nullable
						public String getProperty(String key) {
							return this.source.getProperty(key);
						}
					}
				);
			}
			try {
				PropertySource<?> localPropertySource =
						new PropertiesPropertySource(LOCAL_PROPERTIES_PROPERTY_SOURCE_NAME, mergeProperties());
				if (this.localOverride) {
					this.propertySources.addFirst(localPropertySource);
				}
				else {
					this.propertySources.addLast(localPropertySource);
				}
			}
			catch (IOException ex) {
				throw new BeanInitializationException("Could not load properties", ex);
			}
		}

		processProperties(beanFactory, new PropertySourcesPropertyResolver(this.propertySources));
		this.appliedPropertySources = this.propertySources;
	}
/**
	 * Visit each bean definition in the given bean factory and attempt to replace ${...} property
	 * placeholders with values from the given properties.
	 */
	protected void processProperties(ConfigurableListableBeanFactory beanFactoryToProcess,
			final ConfigurablePropertyResolver propertyResolver) throws BeansException {

		propertyResolver.setPlaceholderPrefix(this.placeholderPrefix);
		propertyResolver.setPlaceholderSuffix(this.placeholderSuffix);
		propertyResolver.setValueSeparator(this.valueSeparator);

		StringValueResolver valueResolver = strVal -> {
			String resolved = (this.ignoreUnresolvablePlaceholders ?
					propertyResolver.resolvePlaceholders(strVal) :
					propertyResolver.resolveRequiredPlaceholders(strVal));
			if (this.trimValues) {
				resolved = resolved.trim();
			}
			return (resolved.equals(this.nullValue) ? null : resolved);
		};
// 将对象实例注入到Spring容器中
		doProcessProperties(beanFactoryToProcess, valueResolver);
	}

protected void doProcessProperties(ConfigurableListableBeanFactory beanFactoryToProcess,
			StringValueResolver valueResolver) {

		BeanDefinitionVisitor visitor = new BeanDefinitionVisitor(valueResolver);

		String[] beanNames = beanFactoryToProcess.getBeanDefinitionNames();
		for (String curName : beanNames) {
			// Check that we're not parsing our own bean definition,
			// to avoid failing on unresolvable placeholders in properties file locations.
			if (!(curName.equals(this.beanName) && beanFactoryToProcess.equals(this.beanFactory))) {
				BeanDefinition bd = beanFactoryToProcess.getBeanDefinition(curName);
				try {
					visitor.visitBeanDefinition(bd);
				}
				catch (Exception ex) {
					throw new BeanDefinitionStoreException(bd.getResourceDescription(), curName, ex.getMessage(), ex);
				}
			}
		}

		// New in Spring 2.5: resolve placeholders in alias target names and aliases as well.
		beanFactoryToProcess.resolveAliases(valueResolver);

		// New in Spring 3.0: resolve placeholders in embedded values such as annotation attributes.
		beanFactoryToProcess.addEmbeddedValueResolver(valueResolver);
	}
```



在`PropertySourcesPlaceholderConfigurer`中，有两个重要属性：`MutablePropertySources propertySources`、`Environment environment`

其中`environment`就存储了配置项，而`propertySources`在方法刚执行时是null。在方法中还涉及到配置来源优先级覆盖的问题

---

从代码中可以看出来，实际上注入容器的是`StringValueResolver`的匿名子类，原本的类反倒没有直接注入。



## 实现一

很容易可以看出，我们可以从第二个方法，也就是`protected void processProperties(ConfigurableListableBeanFactory beanFactoryToProcess,
			final ConfigurablePropertyResolver propertyResolver) throws BeansException `下手。



编写相关代码如下

```java

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.support.PropertySourcesPlaceholderConfigurer;
import org.springframework.core.env.ConfigurablePropertyResolver;
import org.springframework.util.StringValueResolver;

public class EncryptPropertySourcesPlaceholderConfigurer extends PropertySourcesPlaceholderConfigurer {

    private Logger logger = LoggerFactory.getLogger(getClass());

    @Override
    protected void processProperties(ConfigurableListableBeanFactory beanFactoryToProcess, ConfigurablePropertyResolver propertyResolver) throws BeansException {

        logger.debug("生成自定义注释");


        propertyResolver.setPlaceholderPrefix(this.placeholderPrefix);
        propertyResolver.setPlaceholderSuffix(this.placeholderSuffix);
        propertyResolver.setValueSeparator(this.valueSeparator);

        StringValueResolver valueResolver = strVal -> {

            String resolved = (this.ignoreUnresolvablePlaceholders ?
                    propertyResolver.resolvePlaceholders(strVal) :
                    propertyResolver.resolveRequiredPlaceholders(strVal));
            if (this.trimValues) {
                resolved = resolved.trim();
            }
            String s = (resolved.equals(this.nullValue) ? null : resolved);
            logger.debug("key={},v={}", strVal,resolved);

            if (s != null && s.startsWith("enc")) {
               //修改
                return "jsdofasudfawpjtwuit8";
            }
            return s;
        };

        doProcessProperties(beanFactoryToProcess, valueResolver);


//        super.processProperties(beanFactoryToProcess, propertyResolver);
    }
}
```



注入

```java
@Bean("propertySourcesPlaceholderConfigurer")
    public static PropertySourcesPlaceholderConfigurer propertySourcesPlaceholderConfigurer() {
        return new EncryptPropertySourcesPlaceholderConfigurer();
    }
```

Spring通过`StringValueResolver`来实现配置项的注入。

要特别注意，这个类实际负责的范围很广。除了注入配置项，还有uri，beanName之类的也在处理

可以从输出日志中看出来

```text
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=singleton,v=singleton
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=org.springframework.boot.autoconfigure.web.embedded.EmbeddedWebServerFactoryCustomizerAutoConfiguration$TomcatWebServerFactoryCustomizerConfiguration,v=org.springframework.boot.autoconfigure.web.embedded.EmbeddedWebServerFactoryCustomizerAutoConfiguration$TomcatWebServerFactoryCustomizerConfiguration
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=tomcatWebServerFactoryCustomizer,v=tomcatWebServerFactoryCustomizer
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=org.springframework.boot.autoconfigure.web.servlet.MultipartAutoConfiguration,v=org.springframework.boot.autoconfigure.web.servlet.MultipartAutoConfiguration
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=multipartResolver,v=multipartResolver
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=,v=
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=org.springframework.boot.autoconfigure.web.servlet.MultipartProperties,v=org.springframework.boot.autoconfigure.web.servlet.MultipartProperties
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=,v=
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=taskExecutor,v=taskExecutor
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=applicationTaskExecutor,v=applicationTaskExecutor
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=${seal.header.vid},v=HNCA
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=${hn.unit.unify},v=false
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=#{ @environment['shiro.loginUrl'] ?: '/login.jsp' },v=#{ @environment['shiro.loginUrl'] ?: '/login.jsp' }
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=#{ @environment['shiro.successUrl'] ?: '/' },v=#{ @environment['shiro.successUrl'] ?: '/' }
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=#{ @environment['shiro.unauthorizedUrl'] ?: null },v=#{ @environment['shiro.unauthorizedUrl'] ?: null }
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=${sms.max.send-time},v=5
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=${seal.root-data-path},v=/Users/apple\seal\temp
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=/bind/certificate,v=/bind/certificate
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=/search/list,v=/search/list
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=/swagger-resources,v=/swagger-resources
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=${server.error.path:${error.path:/error}},v=/error
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=${server.error.path:${error.path:/error}},v=/error
[EncryptPropertySourcesPlaceholderConfigurer:lambda$processProperties$0:34] [DEBUG] - key=/v2/api-docs,v=/v2/api-docs
```

----

当然，这个方案也有一定的缺点。

首先，由于解密是在获取配置项之后，因此，如果明文中使用了占位符，就无法获取对应的数据。

其次，由于Spring的机制问题，这种方案更适用于 `@Value`注入参数的配置项，对于像 jdbc 这类配置就完全不可行。











