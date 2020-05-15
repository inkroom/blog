---
title: vue纯数字input
date: 2020-05-13 16:34:36
tags: [前端, vue]
---



vue实现只能输入数字



<!-- more -->



最近项目中需要实现一个元和分的转换，要求存储使用分，显示使用元。意外发现了一个实现input 只能输入纯数字的方案

---
``` vue
 computed: {
    money: {
      //pay-content组件金额以分为单位，当前组件以元为单位，因此需要转换
      get() {
        //返回元为单位
        return this.payData.totalAmount / 100;
      },
      set(value) {
        this.payData.totalAmount = parseFloat(value) * 100;
        console.log(
          `money set ${value} ${parseFloat(value)} this.total=${
            this.payData.totalAmount
          }`
        );
        // if(value.endsWith('.')){
        //   this.payData.totalAmount = parseFloat(value.substring()) * 100;
        // }
      }
    }
  },
```