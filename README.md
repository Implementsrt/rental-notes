# 看房手记

三个阶段的简明看房指导、每套房的指标记录，以及2至4套房并排对比。适合个人使用，支持手机和电脑。

[在线使用看房手记](https://implementsrt.github.io/rental-notes/)。当前在线版保存在各设备的浏览器中；从本机预览迁移已有记录，请先导出JSON备份，再到在线版导入。

## 已包含

- 快速筛房、仔细验房、签约确认，指导和记录共用指标。
- 指导说明直接显示在项目下方，手机无需逐项展开。
- 可选择已记录的小区或填写新小区；同一小区的房源可另填楼栋、房号或标识。
- 核对项默认显示选项按钮，选择“其他”后显示备注输入框；切换选项保留备注内容。
- 备注可从已记录房源的同一核对项中下拉选择历史内容，填充后继续手动编辑；综合备注也支持复用，历史内容按最近更新时间去重。
- 15项硬性、20项软性、13项合同责任。未确认与不符合严格分开。
- 硬性确认是否已通天然气；软性评估阳台对隔壁邻居的隐私、配套车位在中间还是靠边，以及空调能耗等级。具体等级、位置等可选“其他”记录。
- 软性记录小区出入口数量及门禁方式、租房大门锁具、人车分流与一楼小车通行、电车入口及充电位置。
- 签约指导和记录页提示核实中介后续是否负责、由公司还是个人负责，以及合同或中介服务条款是否写明。
- 覆盖阳台、朝向、封闭厨房、配套、水压、马桶、排水、手机信号、自带洗衣机安装条件、中介费等要求。
- 维修进屋、工期、施工清洁、卫生间停用、临时住宿、反复维修退出等责任单独记录。
- 月固定费用、一次性费用和押金分开。未知费用留空，明确免费再填0；月固定费用不含水电气用量费用。
- 自动保存本机草稿；连接后端并登录后同步，编辑窗口关闭后发送修改。离线修改下次联网时重试。
- 其他设备更新同一房源时保留本机副本，不静默覆盖；过期的删除不覆盖更新后的记录。
- JSON导出、校验和导入。导入不覆盖同ID不同内容，改为副本。
- 示例模式与真实数据分开，示例不会保存或同步。

## 项目内容

仓库提供源码、自动化测试和部署模板。个人账号、运行配置和房源数据由各自的运行环境保存。开发交接见HANDOFF.md，发布前检查见PUBLICATION_REVIEW.md。

服务器安装脚本默认只监听127.0.0.1:8877，供SSH隧道调试；公网访问需按部署环境配置域名、证书及平台接入。

## 1. 直接预览前端

无需Node构建，也无需安装Python依赖。在项目目录执行：

```bash
python -m http.server 8766 --bind 127.0.0.1 --directory web
```

打开 http://127.0.0.1:8766 。默认只保存到该浏览器，可导出备份。在“我的房源”空白页可进入示例模式。

## 2. 阿里云Ubuntu 24.04安装与调试

适用于Ubuntu 24.04 x86_64环境。服务器运行使用Python和SQLite，无需Node、Docker或独立数据库服务；资源需求取决于并发与数据规模。

安装脚本会：安装python3-venv；创建rental-notes系统用户；把程序放到/opt/rental-notes；数据放到/var/lib/rental-notes；安装Flask、Gunicorn；设置个人密码；启用systemd服务与每日数据库备份。安全组及Nginx站点配置由部署环境管理。8877被其他服务占用时停止安装。

先在本机打包：

```bash
python package.py
```

Windows用户可在项目目录的PowerShell中执行上传和安装助手：

```powershell
& .\deploy\windows-install.ps1
```

按提示在自己的终端填写公网IPv4、SSH用户名和SSH密码，无需把密码贴到聊天。安装时再设置看房工具的个人登录密码（至少12个字符）。助手会调用系统scp和ssh；若SSH需要私钥，先配置本机SSH登录，再运行助手。若PowerShell阻止脚本执行，使用下面的手动方式，无需更改执行策略。

手动方式：用scp或已有文件传输工具把rental-notes.zip放到服务器的登录目录；在服务器终端执行：

```bash
python3 -m zipfile -e rental-notes.zip rental-notes-upload
cd rental-notes-upload
sudo bash deploy/install.sh
```

从自己的电脑打开SSH隧道（替换用户名和IP），保持终端打开：

```bash
ssh -N -L 8877:127.0.0.1:8877 用户名@服务器公网IP
```

然后在本机浏览器访问 http://127.0.0.1:8877 。点击“数据与同步”，用刚设置的密码登录。此阶段是本机通过SSH调试；**手机直接打开GitHub Pages时还不能连接此回环地址**。

查看服务：

```bash
sudo systemctl status rental-notes --no-pager
sudo journalctl -u rental-notes -n 50 --no-pager
```

服务使用1个进程、2个线程。数据库启用WAL并为每次请求使用独立连接。数据保留在程序目录之外，更新安装不覆盖已有密码或数据库。

## 3. GitHub Pages前端＋阿里云后端

前端web目录可以独立部署到Pages，已有.github/workflows/pages.yml。上传项目到自己的GitHub仓库，默认分支使用main，在Settings → Pages中选择GitHub Actions。首次上线不设API地址时仍能作为本地保存版使用。

在正式同步前完成：

1. 为阿里云API确定可公开访问的HTTPS地址。GitHub Pages的HTTPS页面无法直接连接普通HTTP API；自签名证书不适合作为常规浏览器访问方案。
2. 参考deploy/nginx.example.conf添加独立站点。保留Gunicorn的回环监听，在/etc/rental-notes.env中设置RENT_TRUST_PROXY=1。证书申请、续期和安全组配置需按实际访问地址处理，本项目未自动执行。
3. 在/etc/rental-notes.env中设置RENT_ALLOWED_ORIGINS=https://你的用户名.github.io。这里填前端的**源地址**，不包含仓库路径；多个源用英文逗号分隔。随后重启rental-notes服务。
4. GitHub仓库Settings → Secrets and variables → Actions → Variables中添加RENT_API_BASE，值为HTTPS后端地址（不要以/api结尾）。重新运行Pages工作流。
5. 在手机和电脑上打开同一Pages站点，分别登录“数据与同步”。数据保存在阿里云SQLite中，各浏览器另保留自己的草稿。登录凭据仅保留在当前标签页会话中。

不同服务地址的数据分开存放。如从本地版换到云端版，先导出本地备份，再在云端版导入并登录同步。

中国内地公网Web服务的域名、证书及接入要求请参阅阿里云文档。Let's Encrypt目前支持IP地址证书，但证书约6天有效，需要可靠的自动续期，且证书不替代云平台接入要求。

- [阿里云搭建网站说明](https://help.aliyun.com/zh/ecs/user-guide/build-a-website/)
- [Let's Encrypt IP证书说明](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)
- [浏览器混合内容限制](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content)

## 本地后端开发

```bash
python -m venv .venv
# Windows: .venv\Scripts\python -m pip install -r requirements.txt
# Linux:
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py init-admin
.venv/bin/python server.py serve
```

serve仅用于本机开发；Ubuntu正式服务使用Gunicorn。服务器直接提供前端时，/config.js自动选择同源API。

## 备份与密码重设

前端的“数据与同步”可手动导出完整JSON。服务器的每日备份保存在/var/lib/rental-notes/backups，保留最近14份；定时器使用服务器的本地时区。备份仍在同一服务器，建议另下载到自己的电脑。

手动创建一致性数据库备份：

```bash
sudo -u rental-notes env RENT_DATA_DIR=/var/lib/rental-notes /opt/rental-notes/.venv/bin/python /opt/rental-notes/server.py backup --output /var/lib/rental-notes/backups/manual.sqlite3
```

恢复前停止服务，另备份当前数据库和admin.json；将备份数据库恢复为rental.sqlite3，并在服务停止状态下移开旧的rental.sqlite3-wal和rental.sqlite3-shm。确保数据属主仍为rental-notes，再启动服务。完整备份数据库含会话记录，恢复后可重设密码以撤销所有旧会话。

重设密码：

```bash
sudo -u rental-notes env RENT_DATA_DIR=/var/lib/rental-notes /opt/rental-notes/.venv/bin/python /opt/rental-notes/server.py init-admin
sudo systemctl restart rental-notes
```

## 验证

```bash
python -m unittest discover -s tests -v
node --test tests/model.test.js
```

Python检查需使用已安装Flask的虚拟环境。Node仅用于本地模型检查，服务器运行不需要。范围包括身份认证、跨域、版本冲突、删除冲突、持久化、金额校验、备份、未知值处理、历史备注和发布文件检查。发布前执行python publication.py；打包执行python package.py。

第一版保存文字、数值和备注，不含照片上传、多人账户、自定义检查项编辑或自动排名。静态资源没有外部字体、CDN脚本或运行时前端依赖。
