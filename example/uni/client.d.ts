/**
 * 引入插件为虚拟模块 `mp-weixin-back-helper` 提供的类型声明。
 *
 * 正常情况下这个文件来自已安装的 `mp-weixin-back` 包的 `./client` 子路径
 * （`package.json` 里 `"./client": { "types": "./client.d.ts" }`），
 * 用户按文档写 `/// <reference types="mp-weixin-back/client" />` 即可。
 *
 * 但本工程**没有把插件装进 node_modules**（直接从源码加载，见 vite.config.ts），
 * 所以那条 reference 解析不到，`import onPageBack from 'mp-weixin-back-helper'`
 * 会报 TS2307。这里用相对路径指到仓库根的 client.d.ts —— 类型只有一份，不会漂移。
 */
/// <reference path="../../client.d.ts" />
