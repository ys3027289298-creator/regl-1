# AVIF 贴图解码接入 regl 纹理创建 — 交付说明

## 用法

```javascript
// data 为 AVIF 文件字节（Uint8Array / ArrayBuffer / 任意 ArrayBufferView）
const tex = regl.texture({ data: avifBytes, decode: 'avif' })
// 同一入口同样覆盖：regl.cube({ data, decode: 'avif' })、
// tex.subimage({ data, decode: 'avif' }, x, y)
```

解码为同步进行，输出 RGBA uint8 并走既有 texImage2D 上传路径；宽高从图像推断。

## 改动（几处小改 + 公共层，未复制既有路径）

- `lib/util/decode-error.js`（新增）：`TextureDecodeError`，携带稳定 `code`
  （`ERR_TEXTURE_DECODE_FORMAT / DATA / UNSUPPORTED / FAILED`），与 regl 通用
  校验错误可区分。
- `lib/util/avif.js`（新增）：AVIF 后端。ftyp 品牌嗅探（只读头部，不整文件扫描）；
  Node 下经 ffprobe/ffmpeg 同步解码（`REGL_AVIF_FFMPEG`/`REGL_AVIF_FFPROBE` 可覆盖
  路径）；无后端时报 `ERR_TEXTURE_DECODE_UNSUPPORTED`；子进程 stderr 汇入错误
  消息，保证可诊断。`child_process` 经 `module.require` 间接引用，rollup/browserify
  浏览器构建不受影响（已验证 checked/unchecked/min 三种产物）。
- `lib/util/image-decode.js`（新增）：公共解码层。格式分派；把
  ArrayBuffer/视图归一成 Uint8Array **视图**——整份文件零额外拷贝，编码字节以
  stdin 流式送入解码器。
- `lib/texture.js`（修改）：
  - `parseImage` 增加 `decode` 分支（唯一挂载点，texture2d/cube/subimage 全部
    复用，未复制路径）；解码产物走既有 `image.data` 上传通道。
  - `createTexture2D`/`createTextureCube` 初始上传失败时 `destroy(texture)`：
    删除 GL 纹理、移出 textureSet、回退 stats。
  - `reglTexture2D`/`reglTextureCube`/两处 `subimage` 解析段包 try/catch，
    失败时 `freeMipMap`/`freeImage` 归还池化缓冲。
  - `destroy` 按 target 分别回退 `textureCount`/`cubeCount`（修复 cube 计数
    会被失败清理路径搞乱的问题）。
- `regl.d.ts`：`Texture2DOptions.decode?: 'avif'`。
- `API.md` / `CHANGES.md`：文档与变更说明。
- `test/texture-avif.js` + `test/fixtures/`（新增）：39 条断言；fixture 由
  `test/fixtures/gen_avif_fixtures.py` 生成（pillow-avif），附 `.rgba` 真值。

## 验收对照

- 解码等价 / 逐像素误差有界：4:4:4 高质量 fixture，实测最大通道误差 ≤ 2，
  alpha 完全一致；测试容差取 8（`test/texture-avif.js` 中 `checkPixels`）。
- 颜色与 alpha 正确：RGBA 渐变 fixture 同时校验颜色通道与 alpha 通道；
  不透明图像 alpha 解码为 255。
- 错误可诊断：非 AVIF 字节→`ERR_TEXTURE_DECODE_DATA`；截断文件→
  `ERR_TEXTURE_DECODE_FAILED`（消息含 ffmpeg 诊断）；未知格式→
  `ERR_TEXTURE_DECODE_FORMAT`；缺 data→`ERR_TEXTURE_DECODE_DATA`。
  均为 `TextureDecodeError`（`instanceof Error`），非通用异常。
- 无资源泄漏：失败前后 `regl.stats.textureCount`/`cubeCount` 不变；
  失败后上下文可继续正常建纹理、渲染。
- 旧路径零回归：仓库自带入口 `npm test`（standard + tape 全量）
  39503 条断言全部通过；raw Uint8Array 像素路径逐像素 0 误差。
- 内存无额外全量拷贝：offset 视图（`subarray(13, ...)`）输入解码正确，
  证明未按 `.buffer` 整体误用/复制；ArrayBuffer 输入为零拷贝视图。

## 录屏（分段带标题，asciinema v3）

- `output/01-lint.cast` — "AVIF 1/4: lint (standard)"：`standard | snazzy` 通过
- `output/02-avif-tests.cast` — "AVIF 2/4: AVIF decode tests"：39/39 通过
- `output/03-full-suite.cast` — "AVIF 3/4: full repo test suite (npm test)"：
  39503 assertions 全部通过
- `output/04-build.cast` — "AVIF 4/4: bundle builds (checked + min)"：
  rollup checked/unchecked/min 构建通过

回放：`asciinema play output/0X-*.cast`

## 环境备注

- 运行时需要 `ffmpeg`/`ffprobe`（本环境 `~/.local/bin`，ffmpeg 7.0.2 + dav1d）。
- `npm run test-typescript` 与 `npm run lint-docs` 在干净 HEAD 上即失败
  （`@types/estree` 与 TS2.7 不兼容、remark/remark-cli 安装冲突），为既有问题，
  与本次改动无关；`regl.d.ts` 本身 0 报错。
