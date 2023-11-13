"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const type_1 = require("./type");
const glob_1 = require("glob");
const colors_1 = require("colors");
const ali_oss_1 = __importDefault(require("ali-oss"));
const utils_1 = require("./utils");
const fs_1 = __importDefault(require("fs"));
/**
 * 需要上传的文件后缀
 */
const fileSuffix = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico', 'bmp', 'webm', 'avi', 'mp4', 'mp3', 'flv', 'mov'];
const assetUploaderPlugin = (options) => {
    const oss = new ali_oss_1.default({
        region: options.region,
        accessKeyId: options.accessKeyId,
        accessKeySecret: options.accessKeySecret,
        bucket: options.bucket
    });
    const { from, dist, deleteOrigin, deleteEmptyDir, setOssPath, timeout, verbose, test, overwrite, version, setVersion } = Object.assign(type_1.defaultOption, options);
    /**
     * 上传文件
     * @param files 所有需要上传的文件的路径列表
     * @param inVite 是否是vite
     * @param outputPath 需要上传的文件目录路径（打包输入目录路径）
     */
    const upload = async (files, inVite, outputPath = '') => {
        // 是否测试模式
        if (test) {
            console.log((0, colors_1.green)(`\n Currently running in test mode. your files won\'t realy be uploaded.\n`));
        }
        else {
            console.log((0, colors_1.green)(`\n Your files will be uploaded very soon.\n`));
        }
        // 设置文件路径信息
        const _files = files.map(file => ({
            path: file,
            fullPath: path.resolve(file)
        }));
        const filesUploaded = []; // 已上传文件列表
        const filesIgnored = []; // 已忽略的文件列表
        const filesErrors = []; // 上传失败文件列表
        const basePath = getBasePath(inVite, outputPath);
        const fileCount = _files.length;
        for (let i = 0; i < fileCount; i++) {
            const file = _files[i];
            const { fullPath: filePath, path: fPath } = file;
            // 为每个文件设置上传的绝对路径
            let ossFilePath = await (0, utils_1.slash)(path.join(dist, (setOssPath && setOssPath(filePath)
                || basePath && filePath.split(basePath)[1]
                || '')));
            // 查看OSS中是否存在该文件
            const fileExists = await getFileExists(ossFilePath);
            console.log((0, colors_1.yellow)(`\n oss中 ${(0, colors_1.underline)(ossFilePath)} ${fileExists ? '已存在' : '不存在'}`));
            // OSS已有该文件且不需覆盖，则将文件加入忽略名单
            if (fileExists && !overwrite) {
                filesIgnored.push(filePath);
                continue;
            }
            // 测试模式
            if (test) {
                console.log((0, colors_1.blue)(fPath), `is ready to upload to ${(0, colors_1.green)(ossFilePath)} \n`);
                continue;
            }
            try {
                verbose && console.log(`\n ${i + 1}/${fileCount} ${(0, colors_1.white)((0, colors_1.underline)(fPath))} uploading...`);
                let result = await oss.put(ossFilePath, filePath, {
                    timeout,
                    headers: !overwrite ? { "Cache-Control": "max-age=31536000", 'x-oss-forbid-overwrite': true } : {}
                });
                result.url = (0, utils_1.normalize)(result.url);
                filesUploaded.push(fPath);
                verbose && console.log(`\n ${i + 1}/${fileCount} ${(0, colors_1.blue)((0, colors_1.underline)(fPath))} successfully uploaded, oss url =>  ${(0, colors_1.green)((0, colors_1.underline)(result.url))}`);
                if (deleteOrigin) {
                    fs_1.default.unlinkSync(filePath);
                    if (deleteEmptyDir && files.every(f => f.indexOf(path.dirname(filePath)) === -1)) {
                        cleanEmptyDir(filePath);
                    }
                }
            }
            catch (err) {
                filesErrors.push({
                    file: fPath,
                    err: { code: err.code, message: err.message, name: err.name }
                });
                const errorMsg = (0, colors_1.red)(`\n Failed to upload ${(0, colors_1.underline)(fPath)}: ${err.name}-${err.code}: ${err.message}`);
                console.log((0, colors_1.red)(errorMsg));
            }
        }
        try {
            if (setVersion && version && !test) {
                await setVersion({ version: version });
                console.log('更新版本号');
            }
        }
        catch (err) {
            console.log((0, colors_1.red)(`更新版本号出错了...`));
        }
    };
    /**
     * 获取文件的绝对路径
     * @param inVite 是否为vite
     * @param outputPath 需要上传的文件目录路径（打包输入目录路径）
     * @returns
     */
    const getBasePath = (inVite, outputPath) => {
        if (setOssPath)
            return '';
        let basePath = '';
        if (inVite) {
            if (path.isAbsolute(outputPath))
                basePath = outputPath;
            else
                basePath = path.resolve(outputPath);
        }
        else {
            const buildRoot = options.buildRoot;
            if (path.isAbsolute(buildRoot))
                basePath = buildRoot;
            else
                basePath = path.resolve(buildRoot);
        }
        return (0, utils_1.slash)(basePath);
    };
    /**
     * 根据文件路径判断OSS中是否存在该文件
     * @param filepath OSS中的文件路径
     * @returns
     */
    const getFileExists = async (filepath) => {
        return oss.get(filepath)
            .then((result) => {
            return result.res.status == 200;
        }).catch((e) => {
            if (e.code == 'NoSuchKey')
                return false;
        });
    };
    /**
     * 清空目录
     * @param filePath 文件路径
     */
    const cleanEmptyDir = (filePath) => {
        let dirname = path.dirname(filePath);
        if (fs_1.default.existsSync(dirname) && fs_1.default.statSync(dirname).isDirectory()) {
            fs_1.default.readdir(dirname, (err, files) => {
                if (err)
                    console.error(err);
                else {
                    if (!files.length) {
                        fs_1.default.rmdir(dirname, (err) => {
                            if (err) {
                                console.log((0, colors_1.red)(err));
                            }
                            else {
                                verbose && console.log((0, colors_1.green)('empty directory deleted'), dirname);
                            }
                        });
                    }
                }
            });
        }
    };
    let outputPath = '';
    return {
        name: 'vite-plugin-oss',
        // 在解析 Vite 配置后调用。使用这个钩子读取和存储最终解析的配置。当插件需要根据运行的命令做一些不同的事情时，它也很有用。
        configResolved: async (config) => {
            // 获取需要上传的文件目录路径
            outputPath = path.resolve((0, utils_1.slash)(config.build.outDir));
        },
        writeBundle: async () => {
            if (options.cdnUrl) {
                const suffix = options.fileSuffix || fileSuffix;
                const url = new URL(options.dist || '', options.cdnUrl);
                const cdnBaseUrl = url.href;
                // console.log(green('cdnUrl:' + cdnBaseUrl))
                const regExp = new RegExp(`(\/assets\/.*?\.(${suffix.join('|')}))`, 'ig');
                // 获取构建后的文件列表
                const fileList = await glob_1.glob.sync('./dist/**/*.{js,css,html}');
                // 遍历文件列表
                fileList.forEach((filePath) => {
                    // 读取文件内容
                    const fileContent = fs_1.default.readFileSync(filePath, 'utf-8');
                    // 查找并替换所有引用的图片路径
                    const newFileContent = fileContent.replace(regExp, `${cdnBaseUrl}$1`);
                    // 写入修改后的文件内容
                    fs_1.default.writeFileSync(filePath, newFileContent, 'utf-8');
                });
            }
        },
        // 打包完成后执行上传
        closeBundle: async () => {
            // 获取需要上传的文件目录路径的所有文件的路径列表
            let files = await glob_1.glob.sync(from);
            console.log('\n');
            if (files.length > 0) {
                console.log((0, colors_1.underline)(`需要更新上传的文件目录${files[0]}`));
            }
            const suffix = options.fileSuffix || fileSuffix;
            const regExp = new RegExp(`\.(${suffix.join('|')})$`);
            // 排除文件夹
            files = files.filter(file => {
                const stats = fs_1.default.statSync(file);
                return stats.isFile() && regExp.test(file);
            });
            if (files.length) {
                try {
                    await upload(files, true, outputPath);
                }
                catch (err) {
                    console.log((0, colors_1.red)(err));
                }
            }
            else {
                verbose && console.log((0, colors_1.red)(`no files to be uploaded`));
            }
        }
    };
};
exports.default = assetUploaderPlugin;
