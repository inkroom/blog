---
title: hashMap和ConcurrentHashMap
date: 2021-06-11 10:48:52
tags: [java, HashMap, 并发]
---

<!-- more -->

### ConcurrentHashMap

1.7 的并发安全是通过**Segment**分段加锁实现的。1.8则使用了CAS+synchronized来实现

直接看put方法
```java
    final V putVal(K key, V value, boolean onlyIfAbsent) {
        if (key == null || value == null) throw new NullPointerException();
        int hash = spread(key.hashCode());
        int binCount = 0;
        for (Node<K,V>[] tab = table;;) {
            Node<K,V> f; int n, i, fh; K fk; V fv;
            if (tab == null || (n = tab.length) == 0)
                tab = initTable();
            else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
                if (casTabAt(tab, i, null, new Node<K,V>(hash, key, value)))
                    break;                   // no lock when adding to empty bin
            }
            else if ((fh = f.hash) == MOVED)
                tab = helpTransfer(tab, f);
            else if (onlyIfAbsent // check first node without acquiring lock
                     && fh == hash
                     && ((fk = f.key) == key || (fk != null && key.equals(fk)))
                     && (fv = f.val) != null)
                return fv;
            else {
                V oldVal = null;
                synchronized (f) {
                    if (tabAt(tab, i) == f) {
                        if (fh >= 0) {
                            binCount = 1;
                            for (Node<K,V> e = f;; ++binCount) {
                                K ek;
                                if (e.hash == hash &&
                                    ((ek = e.key) == key ||
                                     (ek != null && key.equals(ek)))) {
                                    oldVal = e.val;
                                    if (!onlyIfAbsent)
                                        e.val = value;
                                    break;
                                }
                                Node<K,V> pred = e;
                                if ((e = e.next) == null) {
                                    pred.next = new Node<K,V>(hash, key, value);
                                    break;
                                }
                            }
                        }
                        else if (f instanceof TreeBin) {
                            Node<K,V> p;
                            binCount = 2;
                            if ((p = ((TreeBin<K,V>)f).putTreeVal(hash, key,
                                                           value)) != null) {
                                oldVal = p.val;
                                if (!onlyIfAbsent)
                                    p.val = value;
                            }
                        }
                        else if (f instanceof ReservationNode)
                            throw new IllegalStateException("Recursive update");
                    }
                }
                if (binCount != 0) {
                    if (binCount >= TREEIFY_THRESHOLD)
                        treeifyBin(tab, i);
                    if (oldVal != null)
                        return oldVal;
                    break;
                }
            }
        }
        addCount(1L, binCount);
        return null;
    }
```

基本遵循以下逻辑

- 计算hash，开始循环
- 如果现在没有数据，则初始化一个table
- 如果此时对应位置上没有数据，那么就尝试cas设置新值。设置不成功则开始自旋设置，直到当前线程设置成功，或者别的线程设置成功，则当前线程判断有值，不再进行cas
- 有个**onlyIfAbsent**暂时不知道干嘛的，但是一般这个参数都为false，相应分支不会执行
- 当当前位置有值，则开始追加数据，此时对这个节点加锁。这样加锁粒度比**HashTable**加在整个对象上要更小
- 循环结束后，增加总数。这边也是CAS+自旋逻辑

---

ConcurrentHashMap中有个非常重要的变量`sizeCtl`

```java
private transient volatile int sizeCtl;
```
当这个值为负数时，代表正在进行初始化或者扩容操作。-1代表初始化，-(1+参与扩容的线程数)代表正在扩容

初始化

初始化操作仅允许一个线程进行。在方法`initTable`中，如果发现`sizeCtl`是-1，则使用`Thread.yield()`让出cpu时间。注意：这种让渡是提示性的，而非强制，所以此处可能也会进行自旋等待初始化线程结束初始化，当前线程直接判断table不为null





---

总结：如果节点位置没有值，就用cas设置；有值，就对节点加锁。抛弃了Segment，但是相关的类还保留在源代码里，不知道为什么不删

