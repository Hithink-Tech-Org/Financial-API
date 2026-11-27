# 发布 DSH 插件

插件通过 `dsh-finance-ci.yml` 验包，由 `dsh-finance-release.yml` 发布。两条流程使用 `dsh-plugins/hithink-finance/` 作为 npm 项目根。插件标签格式为 `dsh-finance-vX.Y.Z`，版本取自插件的 `package.json`。

## 准备候选版本

1. 核对 `package.json` 和 `package-lock.json` 的版本。若需要配套新版 CLI，先确认所用 npm 源的 `latest` 已指向该版本，再更新锁文件。插件的依赖声明使用 `latest`。

   ```sh
   cd dsh-plugins/hithink-finance
   npm update @hithink-tech/hithink-finance-cli --package-lock-only --ignore-scripts --prefer-online
   npm ci --ignore-scripts
   npm test
   npm run verify:release-package -- ./out/dsh-finance-release
   ```

2. 在适用的 DSH Web 和 Desktop 验证安装及受影响的功能。CI 从 tarball 实际隔离安装并检查 Host 入口、工具和 Skill 注册、随包静态样例、客户端包及许可证。
3. 公开候选提交合入 `main` 后，等待该提交的 DSH CI 推送运行成功，并确认运行已上传 `dsh-finance-release-<SHA>-<attempt>`。该制品包含经过安装验证的 tarball 及校验记录。

## 发布和恢复

在 npm 为 `@hithink-tech/dsh-finance` 配置允许 `npm publish` 的 GitHub Actions Trusted Publisher。GitHub 仓库为 `Hithink-Tech-Org/Financial-API`，工作流为 `dsh-finance-release.yml`，环境为 `npm-production`。确认该环境允许对应插件标签部署。新建的绑定须在 2 天内完成首次成功 OIDC 发布。若已过期，在下一次经授权的发布前删除并重新创建绑定。 [npm Trusted Publisher 到期规则](https://docs.npmjs.com/trusted-publishers/#trusted-publisher-configuration-expiry)

得到授权后，为已通过验收的同一提交创建并推送插件标签。发布工作流校验标签版本及 main 推送运行身份，下载并验证该次运行的 tarball，再通过 OIDC 将原文件发布到 npm。稳定版进入插件 npm 包的 `latest`，预发布版进入 `next`。独立 GitHub Release 使用 `--latest=false` 并附上同一个安装包。

GitHub 制品有效期请求为 14 天。缺失或过期时，运行日志会显示对应的 main CI 运行号。重跑该运行的全部任务后，在原插件标签上重新运行发布工作流。恢复时，npm 版本的完整性须与制品一致。GitHub Release 已有同名附件时会逐字节核对。若上次运行中断，重试前也应核对同一标签的未发布草稿和其中的附件。 [重跑 GitHub Actions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)

最后读回 npm 版本和 dist-tag、GitHub Release 与附件校验值，并使用已发布的版本完成一次隔离安装。
