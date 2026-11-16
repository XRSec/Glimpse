use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

const GITHUB_REPO: &str = "XRSec/Glimpse";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_name: String,
    pub release_notes: String,
    pub release_url: String,
    pub published_at: String,
    pub asset_name: Option<String>,
    pub asset_download_url: Option<String>,
    pub asset_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percent: f64,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    #[serde(default)]
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

fn parse_version_components(v: &str) -> Vec<u64> {
    let clean = v.trim().trim_start_matches(|c| c == 'v' || c == 'V');
    let core = clean.split(['-', '+']).next().unwrap_or(clean);
    core.split('.').filter_map(|s| s.parse::<u64>().ok()).collect()
}

pub fn is_newer_version(latest: &str, current: &str) -> bool {
    let v_latest = parse_version_components(latest);
    let v_current = parse_version_components(current);
    let max_len = v_latest.len().max(v_current.len());

    for i in 0..max_len {
        let l = v_latest.get(i).copied().unwrap_or(0);
        let c = v_current.get(i).copied().unwrap_or(0);
        if l > c {
            return true;
        }
        if l < c {
            return false;
        }
    }
    false
}

fn match_best_asset(assets: &[GithubAsset]) -> Option<&GithubAsset> {
    let dmgs: Vec<&GithubAsset> = assets.iter().filter(|a| a.name.ends_with(".dmg")).collect();
    let arch = std::env::consts::ARCH;

    if arch == "aarch64" {
        if let Some(a) = dmgs.iter().find(|a| a.name.contains("aarch64") || a.name.contains("arm64")) {
            return Some(a);
        }
    } else if let Some(a) = dmgs.iter().find(|a| a.name.contains("x64") || a.name.contains("x86_64")) {
        return Some(a);
    }

    if let Some(a) = dmgs.iter().find(|a| a.name.contains("universal")) {
        return Some(a);
    }
    dmgs.first().copied()
}

pub async fn check_github_update() -> Result<UpdateInfo, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    match check_via_github_api(&client, &current_version).await {
        Ok(info) => Ok(info),
        Err(api_err) => {
            log::warn!("GitHub API 检查更新失败，切换至 Atom Feed 通道: {}", api_err);
            check_via_github_feed(&client, &current_version)
                .await
                .map_err(|feed_err| format!("检查更新失败: {} / {}", api_err, feed_err))
        }
    }
}

async fn check_via_github_api(client: &reqwest::Client, current_version: &str) -> Result<UpdateInfo, String> {
    let url = format!("https://api.github.com/repos/{}/releases/latest", GITHUB_REPO);
    let resp = client
        .get(&url)
        .header("User-Agent", format!("Glimpse-Updater/{}", current_version))
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("请求 GitHub Release 接口失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API 响应异常: HTTP {}", resp.status()));
    }

    let release = resp
        .json::<GithubRelease>()
        .await
        .map_err(|e| format!("解析 Release 数据失败: {}", e))?;

    let latest_version = release.tag_name.trim().trim_start_matches(['v', 'V']).to_string();
    let has_update = is_newer_version(&latest_version, current_version);
    let matched_asset = match_best_asset(&release.assets);

    Ok(UpdateInfo {
        has_update,
        current_version: current_version.to_string(),
        latest_version,
        release_name: release.name.unwrap_or_else(|| release.tag_name.clone()),
        release_notes: release.body.unwrap_or_default(),
        release_url: release.html_url,
        published_at: release.published_at.unwrap_or_default(),
        asset_name: matched_asset.map(|a| a.name.clone()),
        asset_download_url: matched_asset.map(|a| a.browser_download_url.clone()),
        asset_size: matched_asset.map(|a| a.size),
    })
}

async fn check_via_github_feed(client: &reqwest::Client, current_version: &str) -> Result<UpdateInfo, String> {
    let atom_url = format!("https://github.com/{}/releases.atom", GITHUB_REPO);
    let resp = client
        .get(&atom_url)
        .header("User-Agent", format!("Glimpse-Updater/{}", current_version))
        .send()
        .await
        .map_err(|e| format!("获取 Release Feed 失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Release Feed 响应异常: HTTP {}", resp.status()));
    }

    let xml = resp.text().await.map_err(|e| format!("读取 Release Feed 失败: {}", e))?;
    let entry_start = xml.find("<entry>").ok_or_else(|| "未找到 Release 记录".to_string())?;
    let entry_end = xml[entry_start..].find("</entry>").map(|i| entry_start + i).unwrap_or(xml.len());
    let entry_str = &xml[entry_start..entry_end];

    let tag = extract_between(entry_str, "/releases/tag/", "\"").ok_or_else(|| "无法提取 Release Tag".to_string())?;
    let title = extract_between(entry_str, "<title>", "</title>").unwrap_or_else(|| tag.clone());
    let updated = extract_between(entry_str, "<updated>", "</updated>").unwrap_or_default();
    let notes = extract_between(entry_str, "<content type=\"html\">", "</content>")
        .map(|raw| clean_html_text(&raw))
        .unwrap_or_default();

    let release_url = format!("https://github.com/{}/releases/tag/{}", GITHUB_REPO, tag);
    let assets_url = format!("https://github.com/{}/releases/expanded_assets/{}", GITHUB_REPO, tag);
    let mut assets = Vec::new();

    if let Ok(assets_resp) = client.get(&assets_url).send().await {
        if assets_resp.status().is_success() {
            if let Ok(html) = assets_resp.text().await {
                let prefix = format!("/{}/releases/download/{}/", GITHUB_REPO, tag);
                let mut idx = 0;
                while let Some(pos) = html[idx..].find(&prefix) {
                    let start = idx + pos + prefix.len();
                    let end = html[start..].find('"').map(|i| start + i).unwrap_or(start);
                    let file_name = &html[start..end];
                    if !file_name.is_empty() && !assets.iter().any(|a: &GithubAsset| a.name == file_name) {
                        assets.push(GithubAsset {
                            name: file_name.to_string(),
                            browser_download_url: format!("https://github.com/{}/releases/download/{}/{}", GITHUB_REPO, tag, file_name),
                            size: 0,
                        });
                    }
                    idx = end;
                }
            }
        }
    }

    let latest_version = tag.trim().trim_start_matches(['v', 'V']).to_string();
    let has_update = is_newer_version(&latest_version, current_version);
    let matched_asset = match_best_asset(&assets);

    Ok(UpdateInfo {
        has_update,
        current_version: current_version.to_string(),
        latest_version,
        release_name: title,
        release_notes: notes,
        release_url,
        published_at: updated,
        asset_name: matched_asset.map(|a| a.name.clone()),
        asset_download_url: matched_asset.map(|a| a.browser_download_url.clone()),
        asset_size: None,
    })
}

fn extract_between(text: &str, start_pat: &str, end_pat: &str) -> Option<String> {
    let pos = text.find(start_pat)?;
    let after = &text[pos + start_pat.len()..];
    let end = after.find(end_pat).unwrap_or(after.len());
    Some(after[..end].trim().to_string())
}

fn clean_html_text(raw: &str) -> String {
    let formatted = raw
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("<p>", "")
        .replace("</p>", "\n\n")
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("<li>", "• ")
        .replace("</li>", "\n");

    let mut result = String::new();
    let mut in_tag = false;
    for c in formatted.chars() {
        if c == '<' {
            in_tag = true;
        } else if c == '>' {
            in_tag = false;
        } else if !in_tag {
            result.push(c);
        }
    }
    result.trim().to_string()
}

pub async fn download_and_install(app: AppHandle, download_url: String, file_name: String) -> Result<(), String> {
    if file_name.contains("..") || file_name.contains('/') || file_name.contains('\\') {
        return Err("无效的文件名格式".to_string());
    }
    if !file_name.to_lowercase().ends_with(".dmg") {
        return Err("仅支持 .dmg 安装包自更新".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| format!("创建下载客户端失败: {}", e))?;

    let current_version = env!("CARGO_PKG_VERSION");
    let resp = client
        .get(&download_url)
        .header("User-Agent", format!("Glimpse-Updater/{}", current_version))
        .send()
        .await
        .map_err(|e| format!("开始下载安装包失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("下载安装包失败: HTTP {}", resp.status()));
    }

    let total_size = resp.content_length().unwrap_or(0);
    let dest_path: PathBuf = std::env::temp_dir().join(&file_name);
    if dest_path.exists() {
        let _ = tokio::fs::remove_file(&dest_path).await;
    }

    let mut file = tokio::fs::File::create(&dest_path)
        .await
        .map_err(|e| format!("创建本地下载文件失败: {}", e))?;

    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit_percent = -1.0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("下载数据流中断: {}", e))?;
        file.write_all(&chunk).await.map_err(|e| format!("写入文件失败: {}", e))?;
        downloaded += chunk.len() as u64;

        let percent = if total_size > 0 {
            ((downloaded as f64 / total_size as f64) * 100.0 * 10.0).round() / 10.0
        } else {
            0.0
        };

        if (percent - last_emit_percent).abs() >= 0.5 || downloaded == total_size {
            last_emit_percent = percent;
            let _ = app.emit("update-download-progress", DownloadProgress { downloaded, total: total_size, percent });
        }
    }

    file.flush().await.map_err(|e| format!("刷新文件缓存失败: {}", e))?;
    drop(file);

    crate::cua_driver::stop();
    launch_dmg_installer_and_exit(app, dest_path).await
}

async fn launch_dmg_installer_and_exit(app: AppHandle, dest_path: PathBuf) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    use std::os::unix::process::CommandExt;

    let pid = std::process::id();
    let target_app = get_target_app_bundle();
    let dmg_path_str = dest_path.to_string_lossy().to_string();
    let target_app_str = target_app.to_string_lossy().to_string();

    let script = r#"#!/bin/sh
exec >> /tmp/glimpse_updater.log 2>&1
echo "=== $(date): Glimpse updater started ==="
PID="$1"
DMG="$2"
TARGET="$3"

COUNT=0
while kill -0 "$PID" 2>/dev/null && [ "$COUNT" -lt 150 ]; do
    sleep 0.1
    COUNT=$((COUNT + 1))
done
if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" 2>/dev/null || true
fi

MOUNT_DIR=$(mktemp -d /tmp/glimpse_mount.XXXXXX)
hdiutil attach "$DMG" -nobrowse -noautoopen -mountpoint "$MOUNT_DIR" -quiet -noverify

APP_SRC=$(find "$MOUNT_DIR" -maxdepth 1 -type d -name "*.app" | head -n 1)
[ -L "$APP_SRC" ] && exit 1

if [ -n "$APP_SRC" ] && [ -d "$APP_SRC" ]; then
    rm -rf "$TARGET"
    ditto "$APP_SRC" "$TARGET"
    xattr -rd com.apple.quarantine "$TARGET" 2>/dev/null || true
    hdiutil detach "$MOUNT_DIR" -force -quiet || true
    rm -rf "$MOUNT_DIR"
    rm -f "$DMG"
    sleep 0.5
    open "$TARGET"
else
    hdiutil detach "$MOUNT_DIR" -force -quiet || true
    rm -rf "$MOUNT_DIR"
    open "$DMG"
fi
"#;

    let script_path = std::env::temp_dir().join("glimpse_updater.sh");
    if let Err(e) = std::fs::write(&script_path, script) {
        let _ = std::process::Command::new("open").arg(&dest_path).spawn();
        return Err(format!("写入更新脚本失败: {}", e));
    }
    let _ = std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o755));

    let mut cmd = std::process::Command::new("/bin/sh");
    cmd.arg(&script_path)
        .arg(pid.to_string())
        .arg(&dmg_path_str)
        .arg(&target_app_str)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .process_group(0);

    if let Err(e) = cmd.spawn() {
        let _ = std::process::Command::new("open").arg(&dest_path).spawn();
        return Err(format!("启动自动更新脚本失败: {}", e));
    }

    tokio::time::sleep(Duration::from_millis(300)).await;
    app.exit(0);
    std::process::exit(0);
}

fn get_target_app_bundle() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        let mut cur = exe.parent();
        while let Some(dir) = cur {
            if dir.extension().and_then(|e| e.to_str()) == Some("app") {
                return dir.to_path_buf();
            }
            cur = dir.parent();
        }
    }
    PathBuf::from("/Applications/Glimpse 灵眸.app")
}
