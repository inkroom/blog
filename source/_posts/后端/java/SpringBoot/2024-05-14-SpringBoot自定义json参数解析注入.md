---
title: SpringBoot自定义json参数解析注入
date: 2024-05-14 07:33:53
tags: [java, Spring]
---

自定义请求参数注入逻辑，允许将json解析到多个参数

<!-- more -->

## 背景

SpringBoot中接收json参数一般使用`@RequestBody`注解，基本样式如下

```java
public Result<String> batchAdd(@RequestBody List<Product> data) 
```

但是这样有个问题，那就是 `@RequestBody` 只能出现一次，也就是所有json参数必须封装到一个bean里，大多数情况下这都不是什么问题，但是如果接口很多，每个接口参数都不同的话，就会有很多个类，外带我个人不怎么喜欢使用单个类来接收参数，我更习惯使用多个参数，这样接口需要的参数更加明确


## 原理

Spring中实现参数注入使用的是`org.springframework.web.method.support.HandlerMethodArgumentResolver`类，只需要实现该类即可

## 实现

最早我找了一篇博客，地址找不到了，总之内容是使用fastjson手动获取内容并转换类型，较为繁琐，而且对于容器类参数没有兼容，所以我参照 `org.springframework.web.servlet.mvc.method.annotation.AbstractMessageConverterMethodArgumentResolver#readWithMessageConverters`的逻辑重写了一份。

另外我还兼容了 query 传参，参数不再仅限于http body里的json格式，k=v形式一样能获取

代码如下

```java
import cn.hutool.core.io.IoUtil;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.MethodParameter;
import org.springframework.core.convert.ConversionService;
import org.springframework.core.convert.TypeDescriptor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.MediaType;
import org.springframework.http.converter.GenericHttpMessageConverter;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.Assert;
import org.springframework.util.StringUtils;
import org.springframework.validation.DataBinder;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 参数解析器，支持将json body注入到不同参数中，同时支持普通的form、query传参
 *
 * @author 明明如月
 * @date 2018/08/27
 */
@Component
public class MultiRequestBodyArgumentResolver implements HandlerMethodArgumentResolver {

    private static final String JSONBODY_ATTRIBUTE = "JSON_REQUEST_BODY";
    protected final List<HttpMessageConverter<?>> messageConverters;

    public MultiRequestBodyArgumentResolver(List<HttpMessageConverter<?>> messageConverters) {
        this.messageConverters = messageConverters;
    }

    /**
     * 设置支持的方法参数类型
     *
     * @param parameter 方法参数
     * @return 支持的类型
     */
    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        // 支持带@MultiRequestBody注解的参数
        return parameter.hasParameterAnnotation(MultiRequestBody.class);
    }

    private Type getHttpEntityType(MethodParameter parameter) {
        return parameter.nestedIfOptional().getNestedGenericParameterType();
    }

    /**
     * 驼峰转下划线
     *
     * @param input
     * @return
     */
    private static String humpToUnderline(String input) {
        if (input == null) return null; // garbage in, garbage out
        int length = input.length();
        StringBuilder result = new StringBuilder(length * 2);
        int resultLength = 0;
        boolean wasPrevTranslated = false;
        for (int i = 0; i < length; i++) {
            char c = input.charAt(i);
            if (i > 0 || c != '_') // skip first starting underscore
            {
                if (Character.isUpperCase(c)) {
                    if (!wasPrevTranslated && resultLength > 0 && result.charAt(resultLength - 1) != '_') {
                        result.append('_');
                        resultLength++;
                    }
                    c = Character.toLowerCase(c);
                    wasPrevTranslated = true;
                } else {
                    wasPrevTranslated = false;
                }
                result.append(c);
                resultLength++;
            }
        }
        return resultLength > 0 ? result.toString() : input;
    }

    private String getParameterName(MethodParameter parameter, MultiRequestBody parameterAnnotation) {
        //注解的value是JSON的key
        String key = parameterAnnotation.value();
        // 如果@MultiRequestBody注解没有设置value，则取参数名FrameworkServlet作为json解析的key
        if (!StringUtils.hasText(key)) {
            // 注解为设置value则用参数名当做json的key
            key = parameter.getParameterName();
            // 由于整体使用下划线法，所以参数名也要转换
            key = humpToUnderline(key);
        }
        return key;
    }

    @SuppressWarnings({"all"})
    public <T> Object doResolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer, NativeWebRequest webRequest, WebDataBinderFactory binderFactory) throws Exception {

        HttpServletRequest servletRequest = webRequest.getNativeRequest(HttpServletRequest.class);
        Assert.state(servletRequest != null, "No HttpServletRequest");
        ServletServerHttpRequest inputMessage = new ServletServerHttpRequest(servletRequest);
        MediaType contentType = inputMessage.getHeaders().getContentType();

        MultiRequestBody parameterAnnotation = parameter.getParameterAnnotation(MultiRequestBody.class);
        String key = getParameterName(parameter, parameterAnnotation);

        Object body = null;
        if (contentType.toString().contains("application/x-www-form-urlencoded") || contentType.toString().contains("multipart")) {
            body = getFromQuery(key, mavContainer, servletRequest, binderFactory, parameter, webRequest);
        } else {
            Type targetType = getHttpEntityType(parameter);
            Class<T> targetClass = (targetType instanceof Class clazz ? clazz : null);
            Class<?> contextClass = parameter.getContainingClass();

            StringHttpInputMessage message = null;

            String jsonBody = getRequestBody(webRequest);
            String v = null;
            if (jsonBody.startsWith("[") && jsonBody.endsWith("]")) {
                // 此时为一个 array，因此不支持 key，只能整个传入
                v = jsonBody;
            } else if ("".equals(jsonBody)) {
                v = null;
            } else {
                JSONObject jsonObject = JSON.parseObject(jsonBody);
                if (jsonObject == null) {
                    v = null;
                } else
                    // 注明了 key 的取特定json值，否则使用整个json字符串
                    v = "".equals(key) ? jsonBody : jsonObject.get(key).toString();
            }
            if (v != null) {
                message = new StringHttpInputMessage(inputMessage.getHeaders(), v);
                body = convertValue(targetClass, targetType, contextClass, contentType, message);
            }
        }

        if (body == null) {
            if (parameterAnnotation.required())
                throw new IllegalArgumentException("require " + key);

        }
        return body;
    }

    @SuppressWarnings({"all"})
    public <T> Object convertValue(Class<T> targetClass, Type targetType, Class<?> contextClass, MediaType contentType, StringHttpInputMessage msgToUse) throws IOException {
        Object body = null;
        for (HttpMessageConverter<?> converter : this.messageConverters) {
            GenericHttpMessageConverter<?> genericConverter =
                    (converter instanceof GenericHttpMessageConverter ghmc ? ghmc : null);
            if (genericConverter != null ? genericConverter.canRead(targetType, contextClass, contentType) :
                    (targetClass != null && converter.canRead(targetClass, contentType))) {
                if (msgToUse.hasBody()) {
                    body = (genericConverter != null ? genericConverter.read(targetType, contextClass, msgToUse) :
                            ((HttpMessageConverter<T>) converter).read(targetClass, msgToUse));
                }
                break;
            }
        }
        return body;
    }


    @Override
    @SuppressWarnings({"all"})
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer, NativeWebRequest webRequest, WebDataBinderFactory binderFactory) throws Exception {
        return doResolveArgument(parameter, mavContainer, webRequest, binderFactory);
    }

    @SuppressWarnings({"all"})
    private static class StringHttpInputMessage implements HttpInputMessage {

        private final HttpHeaders headers;
        private final String json;

        public StringHttpInputMessage(HttpHeaders headers, String json) {
            this.headers = headers;
            this.json = json;
        }

        public boolean hasBody() {
            return this.json != null;
        }

        @Override
        public InputStream getBody() throws IOException {
            return json == null ? InputStream.nullInputStream() : new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8));
        }

        @Override
        public HttpHeaders getHeaders() {
            return headers;
        }
    }

    private <T> Object getFromQuery(String key,
                                    ModelAndViewContainer mavContainer, HttpServletRequest servletRequest,
                                    WebDataBinderFactory binderFactory, MethodParameter parameter, NativeWebRequest webRequest) throws Exception {

        Object v = null;
        if (mavContainer.containsAttribute(key)) {
            v = mavContainer.getModel().get(key);
        } else {
            v = servletRequest.getParameter(key);
        }
        if (v == null) {
            return null;
        }
        DataBinder binder = binderFactory.createBinder(webRequest, null, key);

        ConversionService conversionService = binder.getConversionService();
        if (conversionService != null) {
            TypeDescriptor source = TypeDescriptor.valueOf(String.class);
            TypeDescriptor target = new TypeDescriptor(parameter);
            if (conversionService.canConvert(source, target)) {
                return binder.convertIfNecessary(v, parameter.getParameterType(), parameter);
            }
        }
        return null;
    }


    /**
     * 获取请求体JSON字符串
     */
    private String getRequestBody(NativeWebRequest webRequest) throws IOException {
        HttpServletRequest servletRequest = ((HttpServletRequest) webRequest.getNativeRequest());

        // 有就直接获取
        String jsonBody = (String) webRequest.getAttribute(JSONBODY_ATTRIBUTE, NativeWebRequest.SCOPE_REQUEST);
        // 没有就从请求中读取
        if (jsonBody == null) {
            jsonBody = IoUtil.read(servletRequest.getReader());
            webRequest.setAttribute(JSONBODY_ATTRIBUTE, jsonBody, NativeWebRequest.SCOPE_REQUEST);
        }
        return jsonBody;
    }
}
```

注解定义
```java
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface MultiRequestBody {
    /**
     * 是否必须出现的参数
     */
    boolean required() default true;

    /**
     * 参数名称，默认为参数名的下划线形式，如appId -> app_id
     */
    String value() default "";
}
```

## 使用

只需要对参数使用`@MultiRequestBody`注解，样例如下

```java
public Result<PageVO<ProductVO>> list(@MultiRequestBody PageRequest request
            , @MultiRequestBody(value = "app_id", required = false) Long appId
    );
```
