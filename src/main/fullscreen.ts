import { spawn, type ChildProcess } from 'node:child_process'

/*
 * Windows only. One long-lived hidden PowerShell process checks every 2 s whether the user is in a
 * full-screen app or a meeting. No native Node modules needed.
 *
 * "Full-screen" = the foreground window covers its whole monitor, has no title bar and is not
 * merely maximized (games, F11 browsers, video players), or Windows reports exclusive D3D (3) /
 * presentation mode (4), or a Zoom meeting host (CptHost) is running.
 * Deliberately NOT used: SHQueryUserNotificationState's "busy" (2). With an auto-hidden taskbar it
 * flips on and off for ordinary maximized windows, which made the pet flicker and vanish.
 * Desktop/shell windows (incl. Alt+Tab, Start, Search) and SipPal's own windows never count.
 */
const SCRIPT = `
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class F {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int cb; public RECT mon; public RECT work; public int flags; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, int f);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MI i);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int s);
}
'@
$shell = @('Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'XamlExplorerHostIslandWindow')
# Alt+Tab, Start, Search, lock screen etc. are borderless full-monitor windows too.
$shellProcs = @('explorer', 'StartMenuExperienceHost', 'ShellExperienceHost', 'SearchHost', 'SearchApp', 'LockApp', 'TextInputHost')
while ($true) {
  $busy = $false
  $q = 0; [void][F]::SHQueryUserNotificationState([ref]$q)
  if ($q -eq 3 -or $q -eq 4) { $busy = $true }
  $h = [F]::GetForegroundWindow()
  $p = [uint32]0; [void][F]::GetWindowThreadProcessId($h, [ref]$p)
  $cls = New-Object Text.StringBuilder 64; [void][F]::GetClassName($h, $cls, 64)
  $pn = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName
  if ($h -ne [IntPtr]::Zero -and $p -ne [uint32]$env:SIPPAL_PID -and $shell -notcontains $cls.ToString() -and $shellProcs -notcontains $pn -and -not [F]::IsZoomed($h)) {
    $r = New-Object F+RECT; [void][F]::GetWindowRect($h, [ref]$r)
    $mi = New-Object F+MI; $mi.cb = [Runtime.InteropServices.Marshal]::SizeOf($mi)
    [void][F]::GetMonitorInfo([F]::MonitorFromWindow($h, 2), [ref]$mi)
    $covers = $r.L -le $mi.mon.L -and $r.T -le $mi.mon.T -and $r.R -ge $mi.mon.R -and $r.B -ge $mi.mon.B
    $caption = ([F]::GetWindowLong($h, -16) -band 0xC00000) -eq 0xC00000
    if ($covers -and -not $caption) { $busy = $true }
  }
  if (Get-Process -Name CptHost -ErrorAction SilentlyContinue) { $busy = $true }
  [Console]::Out.WriteLine([int]$busy); [Console]::Out.Flush()
  Start-Sleep -Seconds 2
}`

let proc: ChildProcess | null = null

export function watchFullscreen(onChange: (busy: boolean) => void): void {
  if (process.platform !== 'win32' || proc) return
  let last: boolean | null = null
  let busyStreak = 0
  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], {
    windowsHide: true,
    env: { ...process.env, SIPPAL_PID: String(process.pid) },
    stdio: ['ignore', 'pipe', 'ignore']
  })
  proc.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
    const busy = (chunk.trim().split(/\r?\n/).pop() ?? '0') === '1'
    // Debounce: hide only after two busy readings in a row (~4 s); come back on the first clear one.
    busyStreak = busy ? busyStreak + 1 : 0
    const hide = busyStreak >= 2
    if (hide !== last) onChange((last = hide))
  })
  proc.on('exit', () => (proc = null))
}

export function stopFullscreenWatch(): void {
  proc?.kill()
  proc = null
}
