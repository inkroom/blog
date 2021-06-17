---
title: HashMap和ConcurrentHashMap
date: 2021-06-11 10:48:52
tags: [java, HashMap, 并发]
---

<!-- more -->

### HashMap

`HashMap`基本结构是数组+单向链表/红黑树。

map有几个比较重要的变量

- DEFAULT_INITIAL_CAPACITY 默认初始容量，16
- DEFAULT_LOAD_FACTOR 默认负载因子0.75，用在扩容上
- TREEIFY_THRESHOLD 转换成红黑树的链表长度 8
- UNTREEIFY_THRESHOLD 由树转换成链表的长度，6
- MIN_TREEIFY_CAPACITY 转换成红黑树的数组的最小长度 64，如果某链表长度大于8，但是此时数组长度不够，则只会扩容，不会转换

贴出openjdk11里的put方法
```java
  final V putVal(int hash, K key, V value, boolean onlyIfAbsent,
                   boolean evict) {
        Node<K,V>[] tab; Node<K,V> p; int n, i;
        if ((tab = table) == null || (n = tab.length) == 0)//当前数组未创建
            n = (tab = resize()).length;
        if ((p = tab[i = (n - 1) & hash]) == null)//对应的节点不存在
            tab[i] = newNode(hash, key, value, null);
        else {
            Node<K,V> e; K k;
            if (p.hash == hash &&
                ((k = p.key) == key || (key != null && key.equals(k))))//hash碰撞，且当前的key和数组对应位置相同
                e = p;
            else if (p instanceof TreeNode)//当前节点是一颗树
                e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
            else {//链表结构，则遍历到尾结点
                for (int binCount = 0; ; ++binCount) {
                    if ((e = p.next) == null) {
                        p.next = newNode(hash, key, value, null);
                        if (binCount >= TREEIFY_THRESHOLD - 1) // -1 for 1st
                            treeifyBin(tab, hash);//节点过长，转换成红黑树，注意，方法内部还判断了当前数组长度要大于MIN_TREEIFY_CAPACITY
                        break;
                    }
                    if (e.hash == hash &&
                        ((k = e.key) == key || (key != null && key.equals(k))))
                        break;
                    p = e;
                }
            }
            if (e != null) { // existing mapping for key
                V oldValue = e.value;
                if (!onlyIfAbsent || oldValue == null)
                    e.value = value;
                afterNodeAccess(e);
                return oldValue;
            }
        }
        ++modCount;
        if (++size > threshold)//扩容
            resize();
        afterNodeInsertion(evict);
        return null;
    }
```

---

再看扩容算法

```java

final Node<K,V>[] resize() {
        Node<K,V>[] oldTab = table;
        int oldCap = (oldTab == null) ? 0 : oldTab.length;
        int oldThr = threshold;
        int newCap, newThr = 0;
        if (oldCap > 0) {
            if (oldCap >= MAXIMUM_CAPACITY) {
                threshold = Integer.MAX_VALUE;
                return oldTab;
            }
            else if ((newCap = oldCap << 1) < MAXIMUM_CAPACITY &&
                     oldCap >= DEFAULT_INITIAL_CAPACITY)
                     // 直接扩充一倍，为原有容量的两倍，同时阈值也变成两倍
                newThr = oldThr << 1; // double threshold
        }
        else if (oldThr > 0) // initial capacity was placed in threshold
            newCap = oldThr;
        else {               // zero initial threshold signifies using defaults
            newCap = DEFAULT_INITIAL_CAPACITY;
            newThr = (int)(DEFAULT_LOAD_FACTOR * DEFAULT_INITIAL_CAPACITY);
        }
        if (newThr == 0) {
            float ft = (float)newCap * loadFactor;
            newThr = (newCap < MAXIMUM_CAPACITY && ft < (float)MAXIMUM_CAPACITY ?
                      (int)ft : Integer.MAX_VALUE);
        }
        threshold = newThr;
        @SuppressWarnings({"rawtypes","unchecked"})
        Node<K,V>[] newTab = (Node<K,V>[])new Node[newCap];
        table = newTab;
        if (oldTab != null) {
            for (int j = 0; j < oldCap; ++j) {
                Node<K,V> e;
                if ((e = oldTab[j]) != null) {
                    oldTab[j] = null;
                    if (e.next == null)//没有链表或者树结构.尽量保持索引不变
                        newTab[e.hash & (newCap - 1)] = e;
                    else if (e instanceof TreeNode)
                        ((TreeNode<K,V>)e).split(this, newTab, j, oldCap);
                    else { // preserve order 把链表中的元素给重新散列到数组里
                        Node<K,V> loHead = null, loTail = null;
                        Node<K,V> hiHead = null, hiTail = null;
                        Node<K,V> next;
                        do {
                            next = e.next;
                            if ((e.hash & oldCap) == 0) {//新的坐标不变
                                if (loTail == null)
                                    loHead = e;
                                else
                                    loTail.next = e;
                                loTail = e;
                            }
                            else {//新的坐标为原有坐标+原table长度
                                if (hiTail == null)
                                    hiHead = e;
                                else
                                    hiTail.next = e;
                                hiTail = e;
                            }
                        } while ((e = next) != null);
                        if (loTail != null) {
                            loTail.next = null;
                            newTab[j] = loHead;
                        }
                        if (hiTail != null) {//将原本的尾结点给散列到新的数组中去，不再作为链表中的节点
                            hiTail.next = null;
                            newTab[j + oldCap] = hiHead;
                        }
                    }
                }
            }
        }
        return newTab;
    }
```

---

此外还有一些细节

- 初始容量不为2的n次幂的，会向上调整为最近的2次幂，同时由于扩容都是翻两倍，所以容量始终的2的n次幂

- 扩容的阈值=容量*负载因子。只要当前数据量大于这个值就会触发扩容。假设现在有1000个数据，容量应该是2048，因为1024*0.75=768触发扩容，但是这样会浪费很多空间，可以通过吧负载因子设置为1来避免，

- HashMap线程不安全体现在会造成死循环、数据丢失、数据覆盖这些问题。其中死循环和数据丢失是在JDK1.7中出现的问题，在JDK1.8中已经得到解决，然而1.8中仍会有数据覆盖这样的问题
    > 在扩容时，先将数组设置为两倍大小的空数组，这时线程挂起，同时其他线程插入数据，再回来继续散列，数据可能就被覆盖了

### ConcurrentHashMap

1.7 的并发安全是通过**Segment**分段加锁实现的。1.8则使用了CAS+synchronized来实现

以下是openjdk11里的代码

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

