---
title: CAS与VarHandle
date: 2021-06-13 21:26:09
tags: [java,并发, 多线程]
---

现在java中多使用cas来实现无锁化

<!-- more -->


## 定义

CAS(Compare and Swap)，如果原始值和给定值相同，则修改为新值，否则失败

## 使用

借助java9推出的**VarHandle**实现cas操作

`VarHandle`通过以下方法获取
```java
MethodHandles.lookup().findVarHandle(CASExample.class, "x", int.class)
```

三个参数依次代表:

- CASExample.class 需要操作的变量所在的类
- x 变量的名字，在此处就是变量在CASExample中的名字
- int.class 变量的类型

调用如下:
```java
Varhandle.compareAndSet(example, 0, 1)
```

第一个参数是`CASEXample`的实例，第二次参数是期望值，第三个参数就想要设置的新值




样例如下

```java
public class CASExample {

    private volatile int x = 0;

    public static void main(String[] args) {
        try {
            VarHandle xVarhandle = MethodHandles.lookup().findVarHandle(CASExample.class, "x", int.class);

            CyclicBarrier barrier = new CyclicBarrier(2);

            CASExample example = new CASExample();


            for (int i = 0; i < 2; i++) {
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            barrier.await();
                            while (true) {
                                if (xVarhandle.compareAndSet(example, 0, 1)) {
                                    break;
                                }
                            }
                            System.out.println(Thread.currentThread().getName() + "设置完成" + example.x);
                        } catch (InterruptedException e) {
                            e.printStackTrace();
                        } catch (BrokenBarrierException e) {
                            e.printStackTrace();
                        }


                    }
                }).start();
            }


        } catch (NoSuchFieldException e) {
            e.printStackTrace();
        } catch (IllegalAccessException e) {
            e.printStackTrace();
        }

    }

}
```

输出一个1,同时cpu占有率开始上升，很明显是另一个线程死循环导致的


---


注意，我用的是**openjdk11**，jdk中存在两个Unsafe，分别是**sun.misc.Unsafe**和**jdk.internal.misc.Unsafe**，这里使用第二个


### 原子类
写一个原子类试一下

```java

public class AtomicInt {

    private volatile int value;
    private VarHandle handle;

    public AtomicInt() {
        try {
            value = 0;
            handle = MethodHandles.lookup().findVarHandle(AtomicInt.class, "value", int.class);
        } catch (NoSuchFieldException e) {
            e.printStackTrace();
        } catch (IllegalAccessException e) {
            e.printStackTrace();
        }

    }


    public boolean add() {
        while (true) {
            int v = value;
            if (handle.compareAndSet(this, v, v + 1)) {
                return true;
            }
        }
    }

    public static void main(String[] args) {
        int threadCount = 100;
        int count = 1000;
        CountDownLatch latch = new CountDownLatch(threadCount);

        AtomicInt atomicInt = new AtomicInt();

        for (int i = 0; i < threadCount; i++) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    for (int j = 0; j < count; j++) {
                        atomicInt.add();
                    }
                    latch.countDown();
                }
            }).start();
        }
        try {
            latch.await();
        } catch (InterruptedException e) {
            e.printStackTrace();
        }

        System.out.println(atomicInt.value);
    }

}
```



结果是100000，正确



### ABA问题

ABA是指数据由A->B->A的转换，CAS会误以为没有变化。JDK提供了`AtomicStampedReference`和`AtomicMarkableReference`来解决。


