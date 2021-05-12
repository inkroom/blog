---
title: SpringBoot是如何解析yaml文件的
date: 2021-05-12 21:51:26
tags: [java, yaml, SpringBoot, snakeyaml]
---



本文旨在探寻SpringBoot解析**yaml**文件原理，掌握这一知识可以用于设计自己的配置文件格式



<!-- more -->

### 类库

首先，SpringBoot是通过**PropertySourceLoader**来实现各种配置文件的加载，针对**yaml**则是**YamlPropertySourceLoader**

```java
@Override
	public List<PropertySource<?>> load(String name, Resource resource) throws IOException {
		if (!ClassUtils.isPresent("org.yaml.snakeyaml.Yaml", null)) {
			throw new IllegalStateException(
					"Attempted to load " + name + " but snakeyaml was not found on the classpath");
		}
		List<Map<String, Object>> loaded = new OriginTrackedYamlLoader(resource).load();
		if (loaded.isEmpty()) {
			return Collections.emptyList();
		}
		List<PropertySource<?>> propertySources = new ArrayList<>(loaded.size());
		for (int i = 0; i < loaded.size(); i++) {
			String documentNumber = (loaded.size() != 1) ? " (document #" + i + ")" : "";
			propertySources.add(new OriginTrackedMapPropertySource(name + documentNumber, loaded.get(i)));
		}
		return propertySources;
	}

```

跟着路径一路追踪，来到`org.yaml.snakeyaml.Yaml`第536行

```java

 public Iterable<Object> loadAll(Reader yaml) {
        Composer composer = new Composer(new ParserImpl(new StreamReader(yaml)), resolver);
        constructor.setComposer(composer);
        Iterator<Object> result = new Iterator<Object>() {
            @Override
            public boolean hasNext() {
                return constructor.checkData();
            }

            @Override
            public Object next() {
                return constructor.getData();
            }

            @Override
            public void remove() {
                throw new UnsupportedOperationException();
            }
        };
        return new YamlIterable(result);
    }
    
```

这里出现了几个类，其中

- StreamReader  负责数据读取
- ParserImpl  负责数据转换
- Composer 有点类似于一个对外的封装，负责触发读取事件
- ScannerImpl 应该是负责数据扫描，将读取到的数据，按照规则组成有意义的单位

### 读取

来看数据读取这一部分，就是`StreamReader`

首先是初始化

```java
public StreamReader(Reader reader) {
    this.name = "'reader'";
    this.dataWindow = new int[0];//数据窗口，应该一次读取一定的数据
    this.dataLength = 0;//已经读取到的数据长度
    this.stream = reader;// 数据流
    this.eof = false;// 文件是否读取完标志
    this.buffer = new char[BUFFER_SIZE];// 缓冲
}
```

初始化完成后，就应该要读取文件了

文件读取是对流的操作，那么只要一路跟踪**this.stream**的调用就行了。但是这只适用于简单的类

可以看出，这里只有`private void update()` 才有流的操作，那么在这里打断点

这是刚开始的情况

--插入图片

```java
private void update() {
        try {
            int read = stream.read(buffer, 0, BUFFER_SIZE - 1);
            if (read > 0) {
                int cpIndex = (dataLength - pointer);//这里是获取本次读取在dataWindow中的起始点，从这以后的数据，就是本次读取到的数据
                dataWindow = Arrays.copyOfRange(dataWindow, pointer, dataLength + read);//重新构建一个数组，其他目的待定

                if (Character.isHighSurrogate(buffer[read - 1])) {//判断最后一个字符是否是HighSurrogate，这是unicode编码中的概念，此时需要再多读取一个字符。这里不太明白，可能需要在去学习编码知识才行
                    if (stream.read(buffer, read, 1) == -1) {
                        eof = true;
                    } else {
                        read++;
                    }
                }

                int nonPrintable = ' ';
                for (int i = 0; i < read; cpIndex++) {
                    int codePoint = Character.codePointAt(buffer, i);
                    dataWindow[cpIndex] = codePoint;//赋值
                    if (isPrintable(codePoint)) {//判断这个字符是否可打印，或者说可见，如果可见则继续读取
                        i += Character.charCount(codePoint);
                    } else {//不可见则读写结束，避怕有不可见字符导致出bug
                        nonPrintable = codePoint;
                        i = read;
                    }
                }

                dataLength = cpIndex;
                pointer = 0;//当前数据指针归零
                if (nonPrintable != ' ') {
                    throw new ReaderException(name, cpIndex - 1, nonPrintable,
                            "special characters are not allowed");
                }
            } else {
                eof = true;
            }
        } catch (IOException ioe) {
            throw new YAMLException(ioe);
        }
    }

```



第一次读写结束，跟着debug发现，这是被`private boolean ensureEnoughData(int size)`调用

数据读取没有什么特别的地方，总体结果就是读取了一定长度的数据



### 扫描

数据读取后，需要在组织成有意义的数据单位，这就是由 `ScannerImpl` 负责的内容

上面的数据读取是有`ScannerImpl`的`private void scanToNextToken()`方法调用的。

这个方法的作用在于，定位到有实际意义的字符开头，跳过一些特殊字符和注释

```java
private void scanToNextToken() {
        // If there is a byte order mark (BOM) at the beginning of the stream,
        // forward past it.
        if (reader.getIndex() == 0 && reader.peek() == 0xFEFF) {//跳过文件开头可能存在的bom头
            reader.forward();
        }
        boolean found = false;
        while (!found) {
            int ff = 0;
            // Peek ahead until we find the first non-space character, then
            // move forward directly to that character.
            while (reader.peek(ff) == ' ') {
                ff++;
            }
            if (ff > 0) {
                reader.forward(ff);
            }
            // If the character we have skipped forward to is a comment (#),
            // then peek ahead until we find the next end of line. YAML
            // comments are from a # to the next new-line. We then forward
            // past the comment.
            if (reader.peek() == '#') {//这一行被注释，直接跳过
                ff = 0;
                while (Constant.NULL_OR_LINEBR.hasNo(reader.peek(ff))) {//跳过一些字符，具体为什么还没弄明白
                    ff++;
                }
                if (ff > 0) {
                    reader.forward(ff);
                }
            }
            // If we scanned a line break, then (depending on flow level),
            // simple keys may be allowed.
            if (scanLineBreak().length() != 0) {// found a line-break 处理各种情况的换行符，这里涉及到\u2029之类的特殊字符编码，需要去学习
                if (this.flowLevel == 0) {
                    // Simple keys are allowed at flow-level 0 after a line
                    // break
                    this.allowSimpleKey = true;
                }
            } else {
                found = true;
            }
        }
    }

```

----



回到上级调用——`private void fetchMoreTokens()`

```java
private void fetchMoreTokens() {
        // Eat whitespaces and comments until we reach the next token.
        scanToNextToken();
        // Remove obsolete possible simple keys. 删除一些不再使用的 simple keys，不能理解这个simple keys是什么，在debug中，这个方法实际没有具体执行内容
        stalePossibleSimpleKeys();
        // Compare the current indentation and column. It may add some tokens
        // and decrease the current indentation level.  根据当前数据指针所在列，确定缩进级别；这里有个flowLevel决定要不要处理缩进；这个方法里有一些细节，建议先看下文解析；只处理缩进减小是因为如果缩进会增大，那么在下面的判断第一个字符获取token的时候就会重新定位缩进
         unwindIndent(reader.getColumn());
        // Peek the next code point, to decide what the next group of tokens
        // will look like.
        int c = reader.peek();//此时拿到的应该是一行数据第一个有意义的字符
        switch (c) { //接下来首先要判断是不是一些关键字
        case '\0'
            // Is it the end of stream? 可能读取到了一行回车，或者只有空白字符的数据
            fetchStreamEnd();
            return;
        case '%':
            // Is it a directive? 指令
            if (checkDirective()) {
                fetchDirective();
                return;
            }
            break;
        case '-':
            // Is it the document start?
            if (checkDocumentStart()) {
                fetchDocumentStart();
                return;
                // Is it the block entry indicator?
            } else if (checkBlockEntry()) {
                fetchBlockEntry();
                return;
            }
            break;
        case '.':
            // Is it the document end?
            if (checkDocumentEnd()) {
                fetchDocumentEnd();
                return;
            }
            break;
        // TODO support for BOM within a stream. (not implemented in PyYAML)
        case '[':
            // Is it the flow sequence start indicator?
            fetchFlowSequenceStart();
            return;
        case '{':
            // Is it the flow mapping start indicator?
            fetchFlowMappingStart();
            return;
        case ']':
            // Is it the flow sequence end indicator?
            fetchFlowSequenceEnd();
            return;
        case '}':
            // Is it the flow mapping end indicator?
            fetchFlowMappingEnd();
            return;
        case ',':
            // Is it the flow entry indicator?
            fetchFlowEntry();
            return;
            // see block entry indicator above
        case '?':
            // Is it the key indicator?
            if (checkKey()) {
                fetchKey();
                return;
            }
            break;
        case ':':
            // Is it the value indicator?
            if (checkValue()) {
                fetchValue();
                return;
            }
            break;
        case '*':
            // Is it an alias?
            fetchAlias();
            return;
        case '&':
            // Is it an anchor?
            fetchAnchor();
            return;
        case '!':
            // Is it a tag?
            fetchTag();
            return;
        case '|':
            // Is it a literal scalar?
            if (this.flowLevel == 0) {
                fetchLiteral();
                return;
            }
            break;
        case '>':
            // Is it a folded scalar?
            if (this.flowLevel == 0) {
                fetchFolded();
                return;
            }
            break;
        case '\'':
            // Is it a single quoted scalar?
            fetchSingle();
            return;
        case '"':
            // Is it a double quoted scalar?
            fetchDouble();
            return;
        }
        // It must be a plain scalar then. 此时是一个普通字符
        if (checkPlain()) {
            fetchPlain();
            return;
        }
        // No? It's an error. Let's produce a nice error message.We do this by
        // converting escaped characters into their escape sequences. This is a
        // backwards use of the ESCAPE_REPLACEMENTS map.
        String chRepresentation = String.valueOf(Character.toChars(c));
        for (Character s : ESCAPE_REPLACEMENTS.keySet()) {
            String v = ESCAPE_REPLACEMENTS.get(s);
            if (v.equals(chRepresentation)) {
                chRepresentation = "\\" + s;// ' ' -> '\t'
                break;
            }
        }
        if (c == '\t')
            chRepresentation += "(TAB)";
        String text = String
                .format("found character '%s' that cannot start any token. (Do not use %s for indentation)",
                        chRepresentation, chRepresentation);
        throw new ScannerException("while scanning for the next token", null, text,
                reader.getMark());
    }

    // Simple keys treatment.

    /**
     * Return the number of the nearest possible simple key. Actually we don't
     * need to loop through the whole dictionary.
     */
    private int nextPossibleSimpleKey() {
        /*
         * the implementation is not as in PyYAML. Because
         * this.possibleSimpleKeys is ordered we can simply take the first key
         */
        if (!this.possibleSimpleKeys.isEmpty()) {
            return this.possibleSimpleKeys.values().iterator().next().getTokenNumber();
        }
        return -1;
    }
```



#### 看一下如何决定缩进级别的

```java
 private void unwindIndent(int col) {
        // In the flow context, indentation is ignored. We make the scanner less
        // restrictive then specification requires.
        if (this.flowLevel != 0) {
            return;
        }

        // In block context, we may need to issue the BLOCK-END tokens.
        while (this.indent > col) {//确定当前有没有必要减小缩进；一个缩进减小代表结束了一个block(代码块)
            Mark mark = reader.getMark();//这里mark相当于对当前数据状态的一个快照
            this.indent = this.indents.pop();//这里使用了一个栈来记录经历的缩进级别变化，此处出栈来确定当前应该有的缩进级别
            this.tokens.add(new BlockEndToken(mark, mark));//代码块结束，而且可能不止结束一个
        }
    }
```



----

`fetchMoreToken`执行完成后，此时应该增加了一个Token

### 转换

此时调用来到了`PraseImpl`的第195行，此时处在一个内部类中`private class ParseImplicitDocumentStart implements Production`

这里有个接口`Production`，注释说明这个接口用于语法转换。我的理解就是用来处理Token的

此外还有一个`Event`，这个类就是一个基本单元，表明现在处于读写的什么状态上，这里面会存放数据快照

```java
 private class ParseImplicitDocumentStart implements Production {
        public Event produce() {
            // Parse an implicit document.
            if (!scanner.checkToken(Token.ID.Directive, Token.ID.DocumentStart, Token.ID.StreamEnd)) {//只要不是这三种Token，那么代表文件是有数据的
                directives = new VersionTagsTuple(null, DEFAULT_TAGS);
                Token token = scanner.peekToken();
                Mark startMark = token.getStartMark();
                Mark endMark = startMark;
                Event event = new DocumentStartEvent(startMark, endMark, false, null, null);
                // Prepare the next state.
                states.push(new ParseDocumentEnd());//保底操作
                state = new ParseBlockNode();
                return event;
            } else {
                Production p = new ParseDocumentStart();
                return p.produce();
            }
        }
    }
```

---

继续回退之后，这些还只是在 `checkData`，还没有去获取数据

