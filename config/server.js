let path = require('path')
var chokidar = require('chokidar');
let fs = require('fs-extra')

let org = path.join(__dirname, '../hexo-encrypt-category')


function targetPath(p) {
    return path.join(path.resolve(__dirname, '../'), 'node_modules', p.replace(path.resolve(__dirname, '../'), ''));
}


var watcher = chokidar.watch(org, {

    ignored: /[\/\\]\./, persistent: true

});


//往package.json中



var log = console.log.bind(console);

watcher
    .on('add', function (p) {
        log(`add ${p} to ${targetPath(p)}`);
        fs.copyFile(p, targetPath(p))
    })
    .on('addDir', function (p) {
        log(`addDir ${p} to ${targetPath(p)}`)
        p = targetPath(p);
        if (!fs.existsSync(p)) {
            log(`change ${p} to ${targetPath(p)}`);

            fs.mkdirSync((p))
        }
    })
    .on('change', function (p) {
        let p2 = targetPath(p);
        log(`change ${p} to ${p2}`);

        fs.copyFile(p, (p2))

    })
    .on('error', function (error) { log('Error happened', error); })
    .on('ready', function () {
        //复制文件夹
        //   fs.copy(org, path.join(__dirname, '../node_modules'))

        require('hexo-cli')();
    })



// 启动程序
// child_process.exec('npm run server', (err, stdout, stderr) => {
//     if (err){
//         console.log(err);
//         console.warn(new Date(),' API文档编译命令执行失败');
//     } else {
//         console.log(stdout);
//         console.warn(new Date(),' API文档编译命令执行成功');
//     }
// });






