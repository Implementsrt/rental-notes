# 看房手记交接

更新日期：2026-11-18。

## 目标与范围

个人租房工具：快速看房指导、逐套房源记录、2至4套房并排对比。界面以手机使用为重点，兼容桌面。QQ登录、QQ官方机器人、中转GPT和远程Agent只讨论过，没有实现。

## 已实现的交互

1. 三阶段：快速筛房、仔细验房、签约责任确认。指导说明直接显示在项目下方。
2. 15项硬性、20项软性、13项责任。硬性包含天然气接通情况；软性包含阳台对隔壁邻居的隐私、配套车位位置（中间/靠边）、空调能耗等级、小区出入口数量及门禁、租房大门锁具、人车分流与一楼小车通行、电车入口及充电位置。核对项直接显示检查说明，选择“其他”后才显示备注区；旧房源未填写的新项保持未确认/未评估。楼层说明为尽量8楼以上；两卫马桶逐一检查。
3. 小区名称独立保存，可选择已记录的小区或填写新小区；`name`用于选填房号、楼栋或房源标识。旧记录缺少`community`时仍可读取。
4. 备注历史从当前可用房源的同一核对项汇总、去重，按房源更新时间排序；综合备注单独汇总。它不是逐次输入版本日志。有历史时显示下拉，选择后填入可继续编辑的文本框。
5. 月固定支出、一次性费用和押金分开。空金额表示待确认，0表示确认免费。宽带为自行办理，不显示费用选项或参与月支出；旧草稿/备份和API中的`internet`金额保留兼容。其他/未确认都不计为硬性通过或失败。
6. 本机自动保存，JSON导出/导入；示例模式不保存或同步。
7. 配置API后可登录同步。编辑窗口关闭后上传草稿，定期拉取；冲突保留副本，过期删除不覆盖新修改。
8. 签约指导与记录页直接显示中介后续责任核实提示：成交后是否继续负责、责任主体是公司还是个人、合同或中介服务条款是否写明。提示由`STAGES`的`reminder`共用，不计入检查项数量。
9. 对比支持“全部项目/差异项”。差异项仅隐藏所有所选房源均为`pass`（硬性/责任）或`good`（软性）的核对项，任何未知、一般、欠佳、不符合或其他结果均保留；基本信息、费用及综合备注不隐藏。分组标题与核对项名称使用同一固定左列，纵向滚动允许继续滚动页面，避免末行被手机导航遮挡。

## 文件地图

| 路径 | 职责 |
| --- | --- |
| `web/index.html`、`web/app.css` | 页面框架与响应式样式 |
| `web/app.js` | 指导、房源编辑、对比、备份、登录与同步 |
| `web/checklist.js` | 阶段、检查项、选项和费用定义 |
| `web/model.js` | 数据规范化、费用与硬性统计、小区/历史备注汇总 |
| `web/store.js` | 乐观并发与冲突副本处理 |
| `web/config.js` | 静态版API地址；默认`null`仅本机保存 |
| `server.py` | Flask API、SQLite、鉴权、静态页面、密码与备份CLI |
| `deploy/` | Ubuntu安装、systemd、备份、Nginx示例和Windows上传助手 |
| `.github/workflows/pages.yml` | Pages发布；可使用`RENT_API_BASE`仓库变量 |
| `publication.py`、`package.py` | 公开文件清单、敏感内容检查与打包 |
| `tests/` | 前端模型、API与发布检查测试 |

## 运行与检查

在项目根目录创建本地环境并安装依赖：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

前端预览：

```powershell
python -m http.server 8766 --bind 127.0.0.1 --directory web
```

打开 `http://127.0.0.1:8766/#guide`。浏览器数据依赖源地址，移动源码不会迁移或清除浏览器记录。更换端口、主机名或浏览器会使用不同的存储；转移记录应先导出再导入。

验证与打包：

```powershell
node --test tests/model.test.js
.\.venv\Scripts\python.exe -W error::ResourceWarning -m unittest discover -s tests -v
python publication.py
python package.py
```

后端本地开发先运行虚拟环境Python的`server.py init-admin`设置自己的密码，再运行`server.py serve`。后端开发端口默认8765；Ubuntu正式服务默认仅监听`127.0.0.1:8877`。

## 部署状态及后续

公开源码仓库为 https://github.com/Implementsrt/rental-notes 。GitHub Pages已配置为GitHub Actions发布，推送`main`会触发`.github/workflows/pages.yml`；网站地址为 https://implementsrt.github.io/rental-notes/ ，部署结果以仓库Actions记录为准。提交仅包含`publication.py`的公开清单，使用GitHub no-reply提交邮箱。

当前Pages不设置`RENT_API_BASE`，为浏览器本机保存版，各设备数据独立。本机预览与Pages属于不同来源，已有房源需先导出JSON，再在Pages导入。没有实际连接阿里云服务器执行安装，也没有完成后端公网HTTPS/域名接入；新会话应检查实际环境，不能把安装脚本当成已部署事实。

个人服务器配置及本次迁移的私有运行产物放在项目外的单独交接目录，不在公开源码或安装包中。后续根据用户要求继续开发或部署；纯静态本机保存模式已经可用。

## 实现边界

- 不包含照片上传、多人账户、检查项管理和自动排名。
- 登录凭据只保留在当前标签页会话；不同API地址使用不同的本机存储键。
- 历史备注来自仍保留的房源记录，删除房源后不再提供它的备注建议。
- SQLite API使用逐条房源版本校验、删除墓碑和冲突副本。不要用无条件整库覆盖替代。
- `web/`内的文件应全部适合公开；密钥只放后端运行环境。
- 安装包不含虚拟环境或个人数据。发布前阅读`PUBLICATION_REVIEW.md`并重新运行检查。
