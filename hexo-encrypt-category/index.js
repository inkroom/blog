let ejs = require('ejs');
let path = require('path')
let fs = require('fs-extra');

hexo.log.info("注入");
hexo.log.info(fs.readFileSync(path.join(__dirname,'./lib/index.ejs')).toString())
hexo.log.info(ejs.render(fs.readFileSync(path.join(__dirname,'./lib/index.ejs')).toString(),{}, function (err, result) {
    if (err) console.log(err);
    return result;
  }));

hexo.extend.injector.register('body_end', ()=>{
    return  ejs.render(fs.readFileSync(path.join(__dirname,'./lib/index.ejs')).toString(),{}, function (err, result) {
        if (err) console.log(err);
        return result;
      });
    }, 'category'); 