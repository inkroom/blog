---
title: sm2签章
date: 2019-10-19 16:36:03
tags: java,pdf,加密,签名,sm2
---

使用itext7 实现对pdf文件的**sm2**签章和验证



<!-- more -->



####　流程

－首先获取签名dir，再往里面填一些自定义的数据，其中很重要的是签名的公钥
- 使用sm3对数据进行hash，sm2做签名后填充到预先位置，在此需要特别注意生成的签名的大小
- 验证时通过byteRange获取实际被签章的的内容，做hash运算
- 获取签名值，与上述的hash和获取的公钥进行验证操作


#### 签名

核心结构`IExternalSignatureContainer`
----
其中`modifySigningDictionary`方法用于存储自定的数据，itext要求必须设置`PdfName#Filter`、`PdfName#SubFilter`,

一般如下填充即可
```java

public void modifySigningDictionary(PdfDictionary signDic) {

   signDic.put(PdfName.Filter, PdfName.Adobe_PPKLite);

   signDic.put(PdfName.SubFilter, PdfName.Adbe_pkcs7_detached);
}
```

其他自定义数据也可以放进去

----
`sign` 方法实际签章，参数是要签名的数据；返回签名字节，在这里面进行hash，签名操作

#### 验证

**获取要签名的内容**

具体内容在PdfName.ByteRange中，该数据格式为[0 330387 346781 229585 ],
实际保密的内容是0-330387和346781-229585，中间的部分为签名数据，可以不用理会。

特别注意长度，如果签名不够是会进行**补0**的，所以长度可能会超过实际签名出来的长度

----
**获取签名**
签名内容在PdfName.Content中，直接获取即可

```java
PdfReader pdfReader = new PdfReader(new ByteArrayInputStream(FileUtils.read("new.pdf")));
PdfDocument pdfDocument = new PdfDocument(pdfReader);
SignatureUtil signatureUtil = new SignatureUtil(pdfDocument);
List<String> signedNames = signatureUtil.getSignatureNames();
byte[] pdfData = IOUtils.toByteArray(new FileInputStream(""));
PdfDictionary signatureDictionary = signatureUtil.getSignatureDictionary(signedNames.get(0));
byte[] content = signatureDictionary.getAsString(PdfName.Contents).getValueBytes();
```