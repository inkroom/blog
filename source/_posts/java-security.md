---
title: java security
date: 2020-05-13 16:36:53
tags: java,后端,加密
---



**该博文有问题，请无视**





<!-- more -->



## 背景

项目上需要使用证书做pdf签章，引入了bc库。在单元测试时，签章正常通过，tomcat运行时，加载证书失败

## 出错位置追溯

问题出现在一下代码第二行中
``` java
    protected void loadKeyStore(InputStream pfx, String password) throws Exception {
        keyStore = KeyStore.getInstance("PKCS12");
        keyStore.load(pfx, password.toCharArray());
        this.loadKeyStore(keyStore, password);
    }

```

---

分别的单元测试环境、Tomcat环境中debug后发现，`keyStore`这个变量中有个成员变量`keyStoreSpi` 对应的具体实现不同。

在单元测试中是 `sun.security.pkcs12.PKCS12KeyStore`，而在tomcat中是一个bc库中的实现。

那么原因可能找到了，对应的实现不同导致的。

---

问题是：为什么这个变量会经常换？

## 源码debug



查看`KeyStore#getInstance` 方法，其内部依次调用了 `Security.getImpl`、`Providers.getProviderList()`

具体如下

```java

 public static GetInstance.Instance getInstance(String var0, Class<?> var1, String var2) throws NoSuchAlgorithmException {
        ProviderList var3 = Providers.getProviderList();
        Service var4 = var3.getService(var0, var2);
        if (var4 == null) {
            throw new NoSuchAlgorithmException(var2 + " " + var0 + " not available");
        } else {
            try {
                return getInstance(var4, var1);
            } catch (NoSuchAlgorithmException var10) {
                NoSuchAlgorithmException var5 = var10;
                Iterator var6 = var3.getServices(var0, var2).iterator();

                while(true) {
                    Service var7;
                    do {
                        if (!var6.hasNext()) {
                            throw var5;
                        }

                        var7 = (Service)var6.next();
                    } while(var7 == var4);

                    try {
                        return getInstance(var7, var1);
                    } catch (NoSuchAlgorithmException var9) {
                        var5 = var9;
                    }
                }
            }
        }
    }


```

注意其中的第二行，`var3.getService(var0,var1)`，这里是需要获取一个`KeyStore`实现，其中的var0=KeyStore，var2=PKCS12


最后返回了一个`java.security.Provider$Service`，这个会生成一个`PKCS12KeyStore`，从而正确签章


## 解决思路

查看了`KeyStore`源码后，发现其`getInstance`支持如下重载
```java
public static KeyStore getInstance(String type, Provider provider)
        throws KeyStoreException, NoSuchProviderException;
```


那么重点就在于其第二个参数，如果能够传入生成`PKCS12KeyStore`的值，问题不就解决了？



## 解决方案

现在需要获取一个`Provider`实现，

根据debug的结果，其寻找 Provider 在于`ProviderList`的的userList属性。


debug之后发现，其在单元测试环境下，userList数据如下

```


providers size=11
provider=SUN version 1.8
provider=SunRsaSign version 1.8
provider=SunEC version 1.8
provider=SunJSSE version 1.8
provider=SunJCE version 1.8
provider=SunJGSS version 1.8
provider=SunSASL version 1.8
provider=XMLDSig version 1.8
provider=SunPCSC version 1.8
provider=SunMSCAPI version 1.8
provider=BC version 1.6

```

tomcat环境下如下

```
providers size=11
provider=SUN version 1.8
provider=BC version 1.6
provider=SunRsaSign version 1.8
provider=SunEC version 1.8
provider=SunJSSE version 1.8
provider=SunJCE version 1.8
provider=SunJGSS version 1.8
provider=SunSASL version 1.8
provider=XMLDSig version 1.8
provider=SunPCSC version 1.8
provider=SunMSCAPI version 1.8

```

很明显可以看出 bc 库的顺序不对，这个大概就是根源了。

---

单元测试下需要对应的索引为**3**，即为**SunJSSE**，这是`Provider`的name属性




**解决失败**

虽然确实换了spi 属性，但是tomcat下依然失败