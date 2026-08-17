// Win32 window geometry and z-order, as a long-lived query driver.
//
// WHY THIS EXISTS (Set 113 Session 8)
//
// Session 7 measured that the only Windows backend putting the VS Code
// workbench AND the system cursor in one frame is `ffmpeg gdigrab` reading
// the DESKTOP RECTANGLE the window occupies
// (`s7-cursor-capture-backends.json`). That choice buys the cursor and pays
// for it in two places, and both debts are geometry:
//
//   1. A desktop rectangle is not a window. Anything that comes to the front
//      over that rectangle lands in the frame -- a toast, an alert, another
//      editor. The Session 4 pilot's C2 ("no unrelated desktop pixels") is
//      the criterion that decides whether the backend may be used at all,
//      because these videos are destined for a public URL.
//   2. A desktop rectangle is FIXED and a window can MOVE. A capture that
//      does not notice records a slice of desktop that used to be the
//      product.
//
// Both need the same three facts, repeatedly and cheaply: where the target
// window's client area is in physical screen pixels, which windows are above
// it in z-order, and which of those actually intersect it.
//
// WHY A PERSISTENT DRIVER RATHER THAN A CALL PER QUERY
//
// `Add-Type` compiles C# on first use and takes one to three seconds
// (measured in Session 7, where it produced a calibration that PARTLY
// succeeded -- the worst kind of failure). Paying that per poll would make
// mid-capture occlusion monitoring impossible, so the type is compiled once
// and the process then answers commands on stdin, exactly as
// `pointer.js`'s PS_DRIVER does.
//
// Two Session 7 lessons are carried over verbatim, because both failed
// SILENTLY there:
//
//   - The driver runs as a `-File` script. Piping a script into
//     `powershell -Command -` makes PowerShell read the SCRIPT from stdin --
//     the same pipe the loop then needs for commands. It starts cleanly,
//     answers nothing, and prints no error.
//   - The driver announces itself READY and the caller waits. Commands
//     written during type compilation sit in the pipe.
//
// Output is ASCII-only on the console (Windows cp1252, L-079-1); window
// titles are carried as UTF-8 bytes and decoded once, here, with an explicit
// codec.

"use strict";

const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Windows that are never "unrelated desktop pixels" in the sense C2 means,
// because they are the desktop itself rather than something sitting on it.
// Progman/WorkerW are the wallpaper host; they are below everything by
// construction, and a z-order walk that treats them as occluders reports the
// desktop as occluding the window standing on it.
const DESKTOP_SHELL_CLASSES = new Set(["Progman", "WorkerW"]);

// GetWindow(hwnd, GW_HWNDNEXT) walks z-order downward from the top.
const GW_HWNDNEXT = 2;

const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_NOREDIRECTIONBITMAP = 0x00200000;

const PS_DRIVER = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -TypeDefinition @\"",
  "using System;",
  "using System.Runtime.InteropServices;",
  "using System.Text;",
  "",
  "public static class DabblerGeom {",
  '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }',
  '  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }',
  '  [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);',
  '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);',
  '  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);',
  '  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);',
  '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);',
  '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);',
  '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
  '  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);',
  '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
  '  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);',
  // Same export, a second signature. Without an explicit EntryPoint the
  // marshaller looks for a `DwmGetWindowAttributeRect` export, which does
  // not exist, and the call fails at runtime rather than at compile time.
  '  [DllImport("dwmapi.dll", EntryPoint = "DwmGetWindowAttribute")] public static extern int DwmGetWindowAttributeRect(IntPtr h, int attr, out RECT val, int size);',
  '  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);',
  '  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();',
  '  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);',
  '  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenProcess(int access, bool inherit, uint pid);',
  '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr h);',
  '  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern bool QueryFullProcessImageNameW(IntPtr h, int flags, StringBuilder buf, ref int size);',
  "",
  // The owning executable's file name. This exists so a window MATCHER can
  // be written once and work against either backend: OBS presents its window
  // list as "<title> [<exe>]", and the recorder's matcher is written to that
  // shape. Without this the same predicate silently matches nothing here,
  // which is the worst available failure -- a capture of no window rather
  // than an error.
  //
  // PROCESS_QUERY_LIMITED_INFORMATION (0x1000), because it succeeds against
  // elevated and protected processes where PROCESS_QUERY_INFORMATION does
  // not. A failure returns empty rather than throwing: plenty of system
  // processes refuse, and a window we cannot name is still a window that can
  // occlude.
  "  public static string Exe(uint pid) {",
  "    IntPtr h = OpenProcess(0x1000, false, pid);",
  "    if (h == IntPtr.Zero) return \"\";",
  "    try {",
  "      StringBuilder sb = new StringBuilder(1024);",
  "      int n = 1024;",
  "      if (QueryFullProcessImageNameW(h, 0, sb, ref n)) {",
  "        string full = sb.ToString();",
  "        int i = full.LastIndexOf('\\\\');",
  "        return (i >= 0 ? full.Substring(i + 1) : full).Replace('|', ' ');",
  "      }",
  "    } finally { CloseHandle(h); }",
  "    return \"\";",
  "  }",
  "",
  // DWMWA_CLOAKED (14). A cloaked window is VISIBLE by IsWindowVisible and
  // draws nothing at all -- every suspended UWP app on the machine is one.
  // Counting them as occluders is how an occlusion guard refuses to record
  // on a perfectly clean desktop.
  "  public static bool Cloaked(IntPtr h) {",
  "    int v = 0;",
  "    try { if (DwmGetWindowAttribute(h, 14, out v, 4) == 0) return v != 0; } catch {}",
  "    return false;",
  "  }",
  "",
  // DWMWA_EXTENDED_FRAME_BOUNDS (9). GetWindowRect includes the invisible
  // DWM resize border -- about 7px per side at 100% scaling -- so two
  // windows that visually do not touch overlap by GetWindowRect. An
  // occlusion test built on it fires on windows that are merely adjacent.
  "  public static RECT VisibleBounds(IntPtr h) {",
  "    RECT r;",
  "    try { if (DwmGetWindowAttributeRect(h, 9, out r, 16) == 0) return r; } catch {}",
  "    GetWindowRect(h, out r);",
  "    return r;",
  "  }",
  "",
  "  public static string Text(IntPtr h) {",
  "    StringBuilder sb = new StringBuilder(512);",
  "    GetWindowTextW(h, sb, 512);",
  "    return sb.ToString().Replace('|', ' ').Replace('\\n', ' ').Replace('\\r', ' ');",
  "  }",
  "",
  "  public static string Cls(IntPtr h) {",
  "    StringBuilder sb = new StringBuilder(256);",
  "    GetClassNameW(h, sb, 256);",
  "    return sb.ToString().Replace('|', ' ');",
  "  }",
  "",
  // The client area in PHYSICAL screen pixels. This -- not the window rect --
  // is what the capture wants: the window rect carries the title bar and the
  // shadow, and a recording of the product should not spend its edges on
  // either.
  "  public static string ClientScreen(IntPtr h) {",
  "    RECT c;",
  "    if (!GetClientRect(h, out c)) return \"\";",
  "    POINT p; p.X = 0; p.Y = 0;",
  "    if (!ClientToScreen(h, ref p)) return \"\";",
  "    return p.X + \"|\" + p.Y + \"|\" + (c.Right - c.Left) + \"|\" + (c.Bottom - c.Top);",
  "  }",
  "",
  "  public static string Dump() {",
  "    StringBuilder o = new StringBuilder();",
  // The VIRTUAL screen, first, on its own marked line. gdigrab's
  // -offset_x/-offset_y are measured from this origin, not from the primary
  // monitor's, and on a multi-monitor desktop with a display placed left of
  // or above the primary the origin is NEGATIVE. A capture rectangle in raw
  // screen coordinates is then wrong by exactly that origin -- and wrong in
  // a way that still produces a plausible video of the wrong pixels.
  "    o.Append(\"#|\");",
  "    o.Append(GetSystemMetrics(76)); o.Append('|');",
  "    o.Append(GetSystemMetrics(77)); o.Append('|');",
  "    o.Append(GetSystemMetrics(78)); o.Append('|');",
  "    o.Append(GetSystemMetrics(79));",
  "    o.Append('\\n');",
  "    IntPtr fg = GetForegroundWindow();",
  "    IntPtr h = GetTopWindow(IntPtr.Zero);",
  "    int z = 0;",
  "    while (h != IntPtr.Zero) {",
  "      bool vis = IsWindowVisible(h);",
  "      bool ico = IsIconic(h);",
  "      bool clo = Cloaked(h);",
  "      uint pid = 0; GetWindowThreadProcessId(h, out pid);",
  "      int ex = GetWindowLong(h, -20);",
  "      RECT vb = VisibleBounds(h);",
  "      string cs = ClientScreen(h);",
  "      o.Append(h.ToInt64()); o.Append('|');",
  "      o.Append(pid); o.Append('|');",
  "      o.Append(z); o.Append('|');",
  "      o.Append(vis ? 1 : 0); o.Append('|');",
  "      o.Append(ico ? 1 : 0); o.Append('|');",
  "      o.Append(clo ? 1 : 0); o.Append('|');",
  "      o.Append(ex); o.Append('|');",
  "      o.Append(h == fg ? 1 : 0); o.Append('|');",
  "      o.Append(vb.Left); o.Append('|');",
  "      o.Append(vb.Top); o.Append('|');",
  "      o.Append(vb.Right - vb.Left); o.Append('|');",
  "      o.Append(vb.Bottom - vb.Top); o.Append('|');",
  "      o.Append(cs.Length > 0 ? cs : \"0|0|0|0\"); o.Append('|');",
  "      o.Append(Exe(pid)); o.Append('|');",
  "      o.Append(Cls(h)); o.Append('|');",
  "      o.Append(Text(h));",
  "      o.Append('\\n');",
  "      z++;",
  "      h = GetWindow(h, 2);",
  "    }",
  "    return o.ToString();",
  "  }",
  "}",
  "\"@",
  // Physical pixels, always. A process that is not DPI aware has every
  // coordinate it reads AND writes silently rescaled by the system on any
  // display above 100%, which lands a capture rectangle plausibly close to
  // the window and not on it.
  "try { [void][DabblerGeom]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch { try { [void][DabblerGeom]::SetProcessDPIAware() } catch {} }",
  // UTF-8 out, decoded once by the consumer (L-079-1). Window titles carry
  // arbitrary text and the console's default codec is cp1252.
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
  "[Console]::Out.WriteLine('ready')",
  "[Console]::Out.Flush()",
  "while ($true) {",
  "  $line = [Console]::In.ReadLine()",
  "  if ($null -eq $line) { break }",
  "  $line = $line.Trim()",
  "  if ($line -eq 'quit') { break }",
  "  if ($line -eq 'dump') {",
  "    [Console]::Out.Write([DabblerGeom]::Dump())",
  "    [Console]::Out.WriteLine('--end--')",
  "    [Console]::Out.Flush()",
  "  }",
  "}",
].join("\n");

class WindowGeometryUnavailableError extends Error {}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Do two screen rectangles overlap, and by how much of the FIRST one? */
function overlap(target, other) {
  const x = Math.max(target.x, other.x);
  const y = Math.max(target.y, other.y);
  const right = Math.min(target.x + target.width, other.x + other.width);
  const bottom = Math.min(target.y + target.height, other.y + other.height);
  if (right <= x || bottom <= y) {
    return { intersects: false, area: 0, fractionOfTarget: 0, rect: null };
  }
  const area = (right - x) * (bottom - y);
  const targetArea = Math.max(1, target.width * target.height);
  return {
    intersects: true,
    area,
    fractionOfTarget: area / targetArea,
    rect: { x, y, width: right - x, height: bottom - y },
  };
}

/**
 * A live handle on the window list.
 *
 * `open()` spawns the driver, `waitUntilReady()` blocks until it is actually
 * reading, and `close()` is safe to call twice and never throws -- it runs
 * from `finally` blocks whose job is to run after something else has already
 * gone wrong.
 */
class WindowGeometry {
  constructor(logger) {
    this.log = logger || function () {};
    this.proc = null;
    this.ready = false;
    this.closed = false;
    this.stderr = "";
    this._buffer = Buffer.alloc(0);
    this._waiters = [];
  }

  static shell() {
    return process.env.DABBLER_POWERSHELL || "powershell.exe";
  }

  open() {
    if (process.platform !== "win32") {
      throw new WindowGeometryUnavailableError(
        "window geometry is Windows-only; this is " + process.platform
      );
    }
    this.scriptPath = path.join(
      os.tmpdir(),
      "dabbler-geom-" + process.pid + "-" + Date.now() + ".ps1"
    );
    fs.writeFileSync(this.scriptPath, PS_DRIVER, "utf8");
    this.proc = cp.spawn(
      WindowGeometry.shell(),
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", this.scriptPath],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    // Kept, not discarded. A driver whose P/Invoke types fail to compile
    // exits without answering anything, and without this the only symptom is
    // a query that times out for no stated reason.
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    // BYTES end-to-end, decoded once below (L-079-1). Setting an encoding on
    // the stream would decode as cp1252 and mangle every non-ASCII title.
    this.proc.stdout.on("data", (chunk) => {
      this._buffer = Buffer.concat([this._buffer, chunk]);
      this._drain();
    });
    this.proc.on("error", () => {
      this.proc = null;
    });
    return this;
  }

  _drain() {
    const text = this._buffer.toString("utf8");
    if (!this.ready) {
      const at = text.indexOf("ready");
      if (at >= 0) {
        this.ready = true;
        this._buffer = Buffer.from(text.slice(at + "ready".length), "utf8");
      }
      return;
    }
    const marker = text.indexOf("--end--");
    if (marker < 0) return;
    const payload = text.slice(0, marker);
    this._buffer = Buffer.from(
      text.slice(marker + "--end--".length),
      "utf8"
    );
    const waiter = this._waiters.shift();
    if (waiter) waiter(payload);
  }

  async waitUntilReady(timeoutMs) {
    const budget = timeoutMs || 20000;
    const deadline = Date.now() + budget;
    while (Date.now() < deadline) {
      if (this.ready) return this;
      if (!this.proc) break;
      await sleep(50);
    }
    throw new WindowGeometryUnavailableError(
      "the window-geometry driver did not report itself ready within " +
        budget +
        "ms" +
        (this.driverError() ? " (it said: " + this.driverError() + ")" : "") +
        ", so every query it was given would have returned nothing"
    );
  }

  driverError() {
    return (this.stderr || "").trim().split("\n").slice(0, 3).join(" ");
  }

  /**
   * Every top-level window, TOP OF Z-ORDER FIRST.
   *
   * `z` is the position in that walk, so `a.z < b.z` means a is in front of
   * b. That ordering is the whole reason this uses GetTopWindow/GetWindow
   * rather than EnumWindows with a callback: it is the cheap, allocation-free
   * way to get z-order out of PowerShell, and z-order is what "occluding"
   * means.
   */
  async list(timeoutMs) {
    if (!this.proc) {
      throw new WindowGeometryUnavailableError(
        "the window-geometry driver is not running"
      );
    }
    const budget = timeoutMs || 10000;
    const payload = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const at = this._waiters.indexOf(resolve);
        if (at >= 0) this._waiters.splice(at, 1);
        reject(
          new WindowGeometryUnavailableError(
            "the window-geometry driver did not answer within " + budget + "ms"
          )
        );
      }, budget);
      this._waiters.push((text) => {
        clearTimeout(timer);
        resolve(text);
      });
      this.proc.stdin.write("dump\n");
    });

    const windows = [];
    for (const line of payload.split("\n")) {
      const row = line.trim();
      if (!row) continue;
      if (row.startsWith("#|")) {
        const m = row.split("|");
        this.virtualScreen = {
          x: Number(m[1]),
          y: Number(m[2]),
          width: Number(m[3]),
          height: Number(m[4]),
        };
        continue;
      }
      const parts = row.split("|");
      // hwnd,pid,z,vis,ico,cloaked,exStyle,fg (0-7); visible bounds (8-11);
      // client x,y,w,h (12-15); exe (16); class (17); title (18+, and a
      // title is the only field allowed to contain the delimiter, which is
      // why it is last and is re-joined rather than indexed).
      if (parts.length < 19) continue;
      const title = parts.slice(18).join("|");
      const exe = parts[16];
      windows.push({
        hwnd: Number(parts[0]),
        pid: Number(parts[1]),
        z: Number(parts[2]),
        visible: parts[3] === "1",
        minimized: parts[4] === "1",
        cloaked: parts[5] === "1",
        exStyle: Number(parts[6]),
        foreground: parts[7] === "1",
        // The DWM-visible frame, not GetWindowRect's padded one.
        bounds: {
          x: Number(parts[8]),
          y: Number(parts[9]),
          width: Number(parts[10]),
          height: Number(parts[11]),
        },
        client: {
          x: Number(parts[12]),
          y: Number(parts[13]),
          width: Number(parts[14]),
          height: Number(parts[15]),
        },
        className: parts[17],
        exe,
        title,
        // The shape OBS presents its window list in, so a matcher written
        // once works against either backend.
        name: exe ? title + " [" + exe + "]" : title,
      });
    }
    return windows;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.proc && this.proc.stdin.writable) this.proc.stdin.write("quit\n");
    } catch (err) {
      /* the driver is already gone, which is the state we wanted */
    }
    try {
      if (this.proc) this.proc.kill();
    } catch (err) {
      /* likewise */
    }
    try {
      if (this.scriptPath && fs.existsSync(this.scriptPath)) {
        fs.unlinkSync(this.scriptPath);
      }
    } catch (err) {
      /* a temp file in %TEMP% is not worth failing a cleanup over */
    }
    this.proc = null;
  }
}

module.exports = {
  WindowGeometry,
  WindowGeometryUnavailableError,
  overlap,
  DESKTOP_SHELL_CLASSES,
  GW_HWNDNEXT,
  GWL_EXSTYLE,
  WS_EX_TOOLWINDOW,
  WS_EX_NOREDIRECTIONBITMAP,
};
