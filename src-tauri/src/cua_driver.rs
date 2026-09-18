use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write as IoWrite};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

static CUA_PROCESS: Mutex<Option<CuaMcpProcess>> = Mutex::new(None);

struct CuaMcpProcess {
    child: Child,
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
    msg_id: AtomicU64,
}

fn send_rpc(proc: &mut CuaMcpProcess, method: &str, params: Value) -> Result<Value, String> {
    let id = proc.msg_id.fetch_add(1, Ordering::SeqCst) + 1;
    let msg = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params
    });
    let line = format!("{}\n", msg);

    proc.stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    proc.stdin.flush().map_err(|e| e.to_string())?;

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        if std::time::Instant::now() > deadline {
            return Err("cua-driver RPC timeout".into());
        }
        let mut buf = String::new();
        match proc.reader.read_line(&mut buf) {
            Ok(0) => return Err("EOF from cua-driver".into()),
            Ok(_) => {
                let trimmed = buf.trim();
                if trimmed.is_empty() { continue; }
                if let Ok(resp) = serde_json::from_str::<Value>(trimmed) {
                    if resp.get("id").and_then(|v| v.as_u64()) == Some(id) {
                        return Ok(resp);
                    }
                }
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

fn call_tool(proc: &mut CuaMcpProcess, tool: &str, args: Value) -> Result<Value, String> {
    let resp = send_rpc(proc, "tools/call", json!({
        "name": tool,
        "arguments": args
    }))?;

    let contents = resp.pointer("/result/content")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    for c in &contents {
        if c.get("type").and_then(|v| v.as_str()) == Some("text") {
            if let Some(text) = c.get("text").and_then(|v| v.as_str()) {
                if let Ok(parsed) = serde_json::from_str::<Value>(text) {
                    return Ok(parsed);
                }
                return Ok(json!(text));
            }
        }
    }
    Ok(resp.get("result").cloned().unwrap_or(json!(null)))
}

pub fn start() -> Result<(), String> {
    let mut guard = CUA_PROCESS.lock().map_err(|e| e.to_string())?;
    if guard.is_some() { return Ok(()); }

    let mut child = Command::new("cua-driver")
        .arg("mcp")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn cua-driver: {}", e))?;

    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let reader = BufReader::new(stdout);

    let mut proc = CuaMcpProcess {
        child,
        stdin,
        reader,
        msg_id: AtomicU64::new(0),
    };

    send_rpc(&mut proc, "initialize", json!({
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": { "name": "Glimpse", "version": "1.0" }
    }))?;

    *guard = Some(proc);
    Ok(())
}

pub fn stop() {
    if let Ok(mut guard) = CUA_PROCESS.lock() {
        if let Some(mut proc) = guard.take() {
            let _ = proc.child.kill();
            let _ = proc.child.wait();
        }
    }
}

pub fn is_ready() -> bool {
    CUA_PROCESS.lock().map(|g| g.is_some()).unwrap_or(false)
}

pub fn click(pid: i64, x: i64, y: i64, button: &str) -> Result<Value, String> {
    let mut guard = CUA_PROCESS.lock().map_err(|e| e.to_string())?;
    let proc = guard.as_mut().ok_or("cua-driver not started")?;
    let tool = match button {
        "right" => "right_click",
        "double" => "double_click",
        _ => "click",
    };
    call_tool(proc, tool, json!({ "pid": pid, "x": x, "y": y }))
}

pub fn drag(pid: i64, from_x: i64, from_y: i64, to_x: i64, to_y: i64) -> Result<Value, String> {
    let mut guard = CUA_PROCESS.lock().map_err(|e| e.to_string())?;
    let proc = guard.as_mut().ok_or("cua-driver not started")?;
    call_tool(proc, "drag", json!({
        "pid": pid,
        "from_x": from_x, "from_y": from_y,
        "to_x": to_x, "to_y": to_y
    }))
}

pub fn scroll(pid: i64, x: i64, y: i64, direction: &str, amount: i64) -> Result<Value, String> {
    let mut guard = CUA_PROCESS.lock().map_err(|e| e.to_string())?;
    let proc = guard.as_mut().ok_or("cua-driver not started")?;
    call_tool(proc, "scroll", json!({
        "pid": pid,
        "x": x, "y": y,
        "direction": direction,
        "amount": amount
    }))
}

pub fn type_text(pid: i64, text: &str) -> Result<Value, String> {
    let mut guard = CUA_PROCESS.lock().map_err(|e| e.to_string())?;
    let proc = guard.as_mut().ok_or("cua-driver not started")?;
    call_tool(proc, "type_text", json!({ "pid": pid, "text": text }))
}

pub fn press_key(pid: i64, key: &str) -> Result<Value, String> {
    let mut guard = CUA_PROCESS.lock().map_err(|e| e.to_string())?;
    let proc = guard.as_mut().ok_or("cua-driver not started")?;
    call_tool(proc, "press_key", json!({ "pid": pid, "key": key }))
}

pub fn hotkey(pid: i64, keys: Vec<String>) -> Result<Value, String> {
    let mut guard = CUA_PROCESS.lock().map_err(|e| e.to_string())?;
    let proc = guard.as_mut().ok_or("cua-driver not started")?;
    call_tool(proc, "hotkey", json!({ "pid": pid, "keys": keys }))
}
