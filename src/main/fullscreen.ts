import { spawn, type ChildProcess } from 'node:child_process'

/*
 * Windows only. One long-lived PowerShell process polls SHQueryUserNotificationState — the same
 * signal Windows uses to suppress its own toasts during games, full-screen video and presentations —
 * plus whether a Zoom meeting window host (CptHost) is running. Our own foreground windows are ignored. No native Node modules needed.
 * States: 2 = busy/full-screen, 3 = D3D full-screen, 4 = presentation mode.
 */
const SCRIPT = `
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class Q { [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int s); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p); }'
while ($true) {
  $s = 0; [void][Q]::SHQueryUserNotificationState([ref]$s)
  $fp = [uint32]0; [void][Q]::GetWindowThreadProcessId([Q]::GetForegroundWindow(), [ref]$fp)
  if ($fp -eq $env:SIPPAL_PID) { $s = 0 } # our own windows never count
  $m = [bool](Get-Process -Name CptHost -ErrorAction SilentlyContinue)
  [Console]::Out.WriteLine("$s $m"); [Console]::Out.Flush()
  Start-Sleep -Seconds 3
}`

let proc: ChildProcess | null = null

export function watchFullscreen(onChange: (busy: boolean) => void): void {
  if (process.platform !== 'win32' || proc) return
  let last: boolean | null = null
  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], {
    windowsHide: true,
    env: { ...process.env, SIPPAL_PID: String(process.pid) },
    stdio: ['ignore', 'pipe', 'ignore']
  })
  proc.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
    const line = chunk.trim().split(/\r?\n/).pop() ?? ''
    const [state, meeting] = line.split(' ')
    const busy = ['2', '3', '4'].includes(state) || meeting === 'True'
    if (busy !== last) onChange((last = busy))
  })
  proc.on('exit', () => (proc = null))
}

export function stopFullscreenWatch(): void {
  proc?.kill()
  proc = null
}
