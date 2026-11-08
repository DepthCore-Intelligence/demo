# DepthCore · Enterprise Depth Intelligence

在线查看：https://yuyu61.github.io/silver-chair-nav/

页面分为两大部分：深度展示与下游任务。四种深度输入统一接入操作、导航与空间推理流程。页面采用响应式布局，兼容桌面、平板和移动设备。

## 文件

- `index.html`：页面（无构建步骤、无第三方脚本）
- `media/atlas.mp4`：导航案例的四路画面、深度、俯视图与音轨合成的单一视频，页面用 canvas 切出各区域，保证同步
- `media/spatial/`：空间推理题的点云渲染、原图与场景俯视渲染
- `manipulation.css`、`manipulation.js`：操作案例的样式与回放交互
- `media/manipulation/`：四路 RGB、四路 Spectral_r 深度、海报与筛选后的工具记录，均为相对路径本地资源
- `media/manipulation/atlas.mp4`：操作案例的单路同步回放；四路 RGB 与四路深度由同一解码帧绘制，避免并行播放器的时钟校正

操作部分基于 RoboDojo Precision 任务，导航部分基于 OmniNavBench，空间推理部分基于 GRScenes。四种深度输入统一接入各自的下游评测流程。

## 本地预览

```bash
python3 -m http.server 8767 --bind 127.0.0.1
```

然后打开 http://127.0.0.1:8767/#manipulation 。
