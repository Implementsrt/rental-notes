# 看房手记

网上筛房提示、现场验房与签约记录，以及2至4套房并排对比。适合个人使用，支持手机和电脑。

[在线使用看房手记](https://implementsrt.github.io/rental-notes/)。GitHub Pages持续保留，`main`共用同一套前后端代码。普通链接默认把房源保存在当前浏览器；也可用私有链接指定自己的HTTPS后端，确认地址并登录后跨设备同步。

点击右上角“数据与同步 → 导出备份”，可下载包含全部房源信息、费用、检查结果和备注的 JSON 文件。更换设备或浏览器时，可通过“导入备份”恢复。房源 ID 相同且备份中的更新时间更晚时，确认导入后会替换现有记录。备份没有列出的房源继续保留。导出的个人房源文件请自行保存，不提交到源码仓库。

点击“数据与同步 → 分享备份”，可把完整备份作为 `.txt` 文件交给系统分享面板。面板里有微信时，可选择微信好友或文件传输助手。如果手机浏览器无法分享文件，可以点“下载 .txt 备份”，再在微信聊天里点“＋ → 文件”选择下载的备份，或在手机的文件管理中选择该文件并点“分享”。“导入备份”支持 `.json` 和 `.txt` 文件。

## 已包含

- 网上筛房仅作手机浏览、询问时的提示，不填写检查结果。房源描述可能不实，到场后再按仔细验房逐项核实记录；现场检查包含网上提示的全部项目。
- 指导说明直接显示在项目下方，手机无需逐项展开。
- 小区名称使用可输入的下拉框，内置恒大·悦龙台、中铁·天地明珠、启迪亮、龙光玖珑台、万科·金域滨江，并合并已记录名称；默认选中恒大·悦龙台，仍可直接填写新小区。
- 房源信息精简为小区、房型（两房/三房/四房）、楼层、卫生间（一卫/两卫）和选填面积。新房源默认三房、两卫。旧记录的标识、位置、链接、联系人和看房日期继续保留在备份和同步数据中。
- 核对项直接显示检查说明和选项按钮，选择“其他”后显示备注输入框；切换选项保留备注内容。楼层偏好为8楼以上，两卫马桶逐一检查。
- 备注可从已记录房源的同一核对项中下拉选择历史内容，填充后继续手动编辑；综合备注也支持复用，历史内容按最近更新时间去重。
- 22项硬性、23项软性、13项合同责任。未确认与不符合严格分开。
- 硬性分别核实冰箱、消毒柜、抽油烟机、天然气热水器及是否已通天然气；软性评估阳台对隔壁邻居的隐私、配套车位在中间还是靠边，以及空调能耗等级。具体等级、位置等可选“其他”记录。
- 软性记录小区出入口数量及门禁方式、租房大门锁具、人车分流与一楼小车通行、电车入口及充电位置。
- 硬性核对餐桌和沙发齐全、主卧配一米八床、禁止迷你马桶、最多两梯五户。软性查看电视、床数和主卧窗帘遮光效果，床数可选“其他”填入实际张数。
- 签约指导和记录页提示核实中介后续是否负责、由公司还是个人负责，以及合同或中介服务条款是否写明。
- 覆盖阳台、朝向、封闭厨房、配套、水压、马桶、排水、手机信号、自带洗衣机安装条件、中介费等要求。
- 维修进屋、工期、施工清洁、卫生间停用、临时住宿、反复维修退出等责任单独记录。
- 月固定费用、一次性费用和押金分开。新房源的物业费单位为元/m²·月，单价可填小数。物业月费按单价×面积自动计算并四舍五入到整数元；面积可不填，此时物业月费保持待确认。旧物业费按原元/月单位保留，不自动换算为单价。未知费用留空，明确免费再填0；月固定费用不含水电气用量费用及自行办理的宽带费。旧备份中的宽带金额仍可读取和保留。
- 按元填写的费用使用整数。押金下拉为押一/押二/押三，付费方式为付一/付二/付三，默认押一付一；中介费为无/一半/全额，默认半个月房租。押金和中介费随月租及选项联动，中介费按整数元四舍五入。新房源停车费默认300元/月、退租清洁费默认200元，不再提供入住清洁费输入。
- 新默认值仅用于新建房源。旧押金、中介费和小数金额继续保留，不推断押付方式；仍按整数输入的旧小数金额在编辑时显示原值，可明确替换为整数或清空。旧入住清洁费及原家电整体检查结果保留在备份和同步数据中，四项独立家电结果保持未确认。
- 对比可切换“差异项”，仅隐藏全部房源都为符合、满意或已明确的核对项；未确认、未评估、不符合、一般、欠佳及其他结果始终保留，费用和综合备注仍显示。
- 自动保存本机草稿；连接后端并登录后同步，编辑窗口关闭后发送修改。离线修改下次联网时重试。
- 其他设备更新同一房源时保留本机副本，不静默覆盖；过期的删除不覆盖更新后的记录。
- 每套房源有固定的 UUID，随备份一起传递。已有本机记录缺少 ID 时，优先复用有效的存储键，否则生成并保存新 ID。旧备份中缺少 ID 的房源会作为新记录导入，导入后重新导出即可带上 ID。
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

## 3. 命令行连接与私有配置

优先使用Workbench CLI执行远程命令和传输文件。由用户在自己的终端执行`workbench config`完成云凭证配置；默认文件为`%USERPROFILE%\.workbench\config.json`，实例地域、实例ID及其他私有部署信息也保存在仓库外。它支持有公网IP或无公网IP的Linux实例，连接前需核对云助手状态和RAM权限。此通道用于运维，网站访问仍需单独配置公网入口。

Windows官方安装脚本若因写入`C:\Program Files\workbench`被拒绝，可将官方Windows发行包通过SHA256校验后安装到`%LOCALAPPDATA%\Programs\workbench`并添加到用户PATH，无需更改系统目录权限。用户目录安装后，当前终端尚未更新PATH时，可直接执行：

```powershell
& "$env:LOCALAPPDATA\Programs\workbench\workbench.exe" version
& "$env:LOCALAPPDATA\Programs\workbench\workbench.exe" config
```

参考[Workbench CLI安装与凭证配置](https://help.aliyun.com/zh/ecs/user-guide/install-and-configure-workbench-cli-credentials)及[实例管理命令](https://help.aliyun.com/zh/ecs/user-guide/use-workbench-cli-to-manage-ecs-instances)。代理后续先做只读检查，再按实际服务器状态部署；不读取或输出凭据文件内容。

备用的SSH远程操作使用本机OpenSSH的`ssh`和`scp`。实际连接配置、私钥和部署笔记保存在仓库外；公开仓库只保留以下占位模板。直接SSH连接需要服务器地址、SSH端口、系统用户名和对应的登录凭据，无需为此提供阿里云AccessKey。服务器安全组和防火墙需允许当前客户端访问实际SSH端口。

在Windows的`%USERPROFILE%\.ssh\config`中添加下列配置；该文件名没有扩展名。将占位符替换为真实值，端口按实际环境填写，`IdentityFile`指向仓库外的私钥文件：

```sshconfig
Host rental-notes-prod
    HostName YOUR_SERVER_IP
    User YOUR_SSH_USER
    Port 22
    IdentityFile ~/.ssh/rental-notes-prod
    IdentitiesOnly yes
    ForwardAgent no
    ConnectTimeout 10
```

该私钥对应的公钥需要已配置到服务器相应用户。已有密钥时直接使用其实际文件路径，不覆盖现有密钥。用户先在自己的终端执行`ssh rental-notes-prod`，通过阿里云控制台等独立渠道核对主机指纹后接受并保存到本机`known_hosts`，同时自行处理密码、密钥口令或其他交互认证。不要通过关闭主机密钥检查绕过首次核验。

如果私钥设有口令，可由用户在本机将其加载到Windows的`ssh-agent`，让后续命令复用认证。尚未启用代理服务时，先在管理员PowerShell执行：

```powershell
Set-Service -Name ssh-agent -StartupType Manual
Start-Service ssh-agent
```

再在当前Windows用户的普通终端中执行，并自行输入密钥口令：

```powershell
ssh-add "$env:USERPROFILE\.ssh\rental-notes-prod"
```

`Manual`表示重启后可能需要重新启动服务。若使用其他私钥路径，调整上述命令。用户在单独终端完成一次密码登录，并不会让代理的后续独立命令自动获得登录状态；后续需要可用的密钥或SSH代理。仅有密码登录时，用户可先自行配置公钥认证。

认证就绪后，可在项目目录用下列命令验证非交互连接、上传公开安装包；上传不执行安装：

```powershell
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes rental-notes-prod "echo connected"
python package.py
scp -o BatchMode=yes -o StrictHostKeyChecking=yes rental-notes.zip rental-notes-prod:rental-notes.zip
```

`BatchMode=yes`会在需要交互认证时直接失败，不等待输入密码或口令。若连接配置放在其他仓库外位置，可给`ssh`和`scp`加`-F "配置文件绝对路径"`。提供本地配置路径及主机别名即可继续操作，不必在聊天中提供凭据内容。现有`deploy/windows-install.ps1`仍按IPv4与用户名交互安装；使用主机别名时直接采用上述`ssh`、`scp`命令。

连通后先只读核对Linux版本、当前用户及sudo权限、端口占用、已有Nginx站点和服务、目标目录是否已有数据，再按实际状态制定部署步骤。sudo、应用初始密码等交互由用户在自己的终端处理，或者使用已具备相应权限的部署账户；不将密码写进命令、源码或日志。生产环境配置和数据库继续分别保存在`/etc/rental-notes.env`与`/var/lib/rental-notes/`。

连接方式参考[阿里云OpenSSH连接说明](https://help.aliyun.com/zh/ecs/user-guide/connect-to-an-instance-by-using-third-party-client-tools/)、[Windows OpenSSH配置](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh-server-configuration)和[Windows密钥与ssh-agent管理](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement)。

## 4. Pages与服务器部署

现有GitHub Pages继续保留，普通链接默认使用浏览器本地保存。`.github/workflows/pages.yml`仅从`main`发布`web/`，固定生成`apiBase: null`，不读取`RENT_API_BASE`等服务器地址变量。公开源码及Pages产物不包含真实后端地址。

需要同步时，将自己的后端地址放在URL片段的`api`参数中，例如下面的保留示例IP（不是可连接的服务器）：

```text
https://implementsrt.github.io/rental-notes/#homes?api=https%3A%2F%2F203.0.113.10
```

`#`后的内容由浏览器读取，不随页面请求发给GitHub。首次在当前标签页选择该服务器时，会先显示完整地址；确认前不连接、不发送密码或令牌。确认后可在“数据与同步”查看目标并登录，或返回本地模式。导航、刷新及同一标签页内的页面切换会保留后端地址；改为其他地址时重新核对目标。普通`?api=`查询参数不会启用同步。

链接只能提供完整的HTTPS源地址（协议、主机和可选端口），不接受账号密码、路径、查询串或额外片段。HTTP仅允许本机HTTP页面连接本机回环地址以便开发。后端必须提供浏览器信任的证书；不要依赖关闭证书校验或浏览器安全限制。

后端设置`RENT_ALLOWED_ORIGINS=https://implementsrt.github.io`，允许该Pages来源的跨域请求；来源不包含仓库路径。密码和令牌不放进链接。带真实IP的书签、本地配置和部署笔记放在仓库外；获得链接的人仍然能看到目标地址，服务器仍需鉴权。

纯本地模式与不同服务器的草稿分别保存在原有独立存储键中，不自动复制或覆盖。迁移已有记录前先导出JSON，再在目标模式导入；原有冲突副本与版本校验继续保留。

服务器开发与部署直接在`main`继续，不要求新建服务器分支；共用同一套前端和已有Flask/SQLite后端，避免重复维护。Pages与服务器通过运行环境和显式链接选择配置：Pages默认本地保存，私有链接可指定后端；服务器直接提供页面时使用同源API。仓库中的安装脚本、systemd服务、备份及Nginx示例作为部署基础；实际运行状态与接入信息记录在仓库外，不能根据源码存在推断公网可用。修改部署代码时继续保留现有Pages用途，实际连接资料与运行凭据始终放在仓库外。

后续整站部署可由Nginx统一提供HTTPS入口，转发到仅监听回环地址的Gunicorn；服务器直接提供页面时，`/config.js`自动选择同源API。启用代理时需按实际环境配置`RENT_TRUST_PROXY`，保留已有无关服务。不同服务地址的数据分开存放，迁移前先导出本地JSON备份。

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

Python检查需使用已安装Flask的虚拟环境。Node仅用于本地模型与连接参数检查，服务器运行不需要。范围包括默认本地模式、片段路由与地址校验、身份认证、跨域、版本冲突、删除冲突、持久化、金额校验、备份、未知值处理、历史备注和发布文件检查。发布前执行python publication.py；打包执行python package.py，安装包中的Bash脚本统一使用LF换行以兼容Ubuntu。

第一版保存文字、数值和备注，不含照片上传、多人账户、自定义检查项编辑或自动排名。静态资源没有外部字体、CDN脚本或运行时前端依赖。
