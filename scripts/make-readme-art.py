"""Generates the animated SVGs used in README.md (.github/assets). Run: python scripts/make-readme-art.py"""
import math

BODY = "M50 4 C62 22 86 42 86 68 C86 90 70 104 50 104 C30 104 14 90 14 68 C14 42 38 22 50 4 Z"
FONT = "'Outfit','Segoe UI',Inter,system-ui,-apple-system,sans-serif"
THEMES = {
    "aqua": ("#9BE7FF", "#00C8FF", "#0369a1"),
    "mint": ("#99f6e4", "#14b8a6", "#0f766e"),
    "lavender": ("#ddd6fe", "#8b5cf6", "#6d28d9"),
    "peach": ("#fed7aa", "#fb923c", "#c2410c"),
}

EYES = {
    "open": '<g class="blink"><ellipse cx="38" cy="64" rx="6.5" ry="8" fill="#1e293b"/><ellipse cx="62" cy="64" rx="6.5" ry="8" fill="#1e293b"/>'
    '<circle cx="40.5" cy="60.5" r="2.4" fill="#fff"/><circle cx="64.5" cy="60.5" r="2.4" fill="#fff"/></g>',
    "happy": '<g stroke="#1e293b" stroke-width="3.5" stroke-linecap="round" fill="none"><path d="M32 67 q6 -8 12 0"/><path d="M56 67 q6 -8 12 0"/></g>',
    "closed": '<g stroke="#1e293b" stroke-width="3" stroke-linecap="round" fill="none"><path d="M32 66 q6 5 12 0"/><path d="M56 66 q6 5 12 0"/></g>',
}
MOUTHS = {
    "smile": '<path d="M44 77 q6 6 12 0" stroke="#1e293b" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    "open": '<path d="M42 78 q8 10 16 0 Z" fill="#7f1d1d"/>',
    "o": '<ellipse cx="50" cy="80" rx="4" ry="4.5" fill="#7f1d1d"/>',
    "sleep": '<path d="M46 80 q4 2 8 0" stroke="#1e293b" stroke-width="2" fill="none" stroke-linecap="round"/>',
}


def droplet(theme, gid, eyes="open", mouth="smile", extra=""):
    """Same 100x110 droplet the app draws (src/renderer/pet/DropletRenderer.tsx)."""
    light, mid, dark = THEMES[theme]
    return (
        f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{light}"/>'
        f'<stop offset="1" stop-color="{mid}"/></linearGradient></defs>'
        f'<ellipse cx="38" cy="104" rx="8" ry="4.5" fill="{dark}"/><ellipse cx="62" cy="104" rx="8" ry="4.5" fill="{dark}"/>'
        f'<path d="{BODY}" fill="url(#{gid})" stroke="{dark}" stroke-width="2"/>'
        '<ellipse cx="34" cy="40" rx="6" ry="9" fill="#fff" opacity="0.55" transform="rotate(25 34 40)"/>'
        '<circle cx="28" cy="76" r="5" fill="#fb7185" opacity="0.35"/><circle cx="72" cy="76" r="5" fill="#fb7185" opacity="0.35"/>'
        f"{EYES[eyes]}{MOUTHS[mouth]}{extra}"
    )


def wave_path(width, y, amp, period):
    pts = [f"M0 {y}"] + [f"L{x} {y + amp * math.sin(2 * math.pi * x / period):.1f}" for x in range(0, width + 1, 10)]
    return " ".join(pts) + f" L{width} 460 L0 460 Z"


BANNER_CSS = """
  .bob { animation: bob 2.6s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
  @keyframes bob { 0%,100% { transform: translateY(0) scale(1,1); } 45% { transform: translateY(-22px) scale(0.97,1.04); } 90% { transform: translateY(0) scale(1.06,0.94); } }
  .shadow { animation: shadow 2.6s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 50%; }
  @keyframes shadow { 45% { transform: scaleX(0.7); opacity: 0.2; } }
  .blink { animation: blink 4.2s infinite; transform-box: fill-box; transform-origin: 50% 50%; }
  @keyframes blink { 0%,90%,100% { transform: scaleY(1); } 94% { transform: scaleY(0.1); } }
  .bubble { animation-name: rise; animation-timing-function: linear; animation-iteration-count: infinite; }
  @keyframes rise { 0% { transform: translateY(0); opacity: 0; } 12% { opacity: 1; } 100% { transform: translateY(-470px); opacity: 0; } }
  .wave1 { animation: drift 9s linear infinite; }
  .wave2 { animation: drift 14s linear infinite reverse; }
  @keyframes drift { to { transform: translateX(-640px); } }
  .glow { animation: pulse 3.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.45; } }

  @keyframes fade { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  .drip { animation: drip 2.6s ease-in infinite; }
  @keyframes drip { 0%,55% { transform: translateY(0); opacity: 0; } 60% { opacity: 1; } 100% { transform: translateY(46px); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
"""

MOODS_CSS = """
  .idle, .thirsty, .celebrate, .sleep, .zzz, .blink, .hand { transform-box: fill-box; }
  .idle { animation: breathe 3s ease-in-out infinite; transform-origin: 50% 100%; }
  @keyframes breathe { 50% { transform: scale(1.03, 0.96); } }
  .blink { animation: blink 3.6s infinite; transform-origin: 50% 50%; }
  @keyframes blink { 0%,90%,100% { transform: scaleY(1); } 94% { transform: scaleY(0.1); } }
  .thirsty { animation: hop 0.7s ease-in-out infinite; transform-origin: 50% 100%; }
  @keyframes hop { 50% { transform: translateY(-12px); } }
  .hand { animation: wave 0.9s ease-in-out infinite alternate; transform-origin: 0% 100%; }
  @keyframes wave { to { transform: rotate(-12deg); } }
  .celebrate { animation: jump 1.1s cubic-bezier(.3,0,.3,1) infinite; transform-origin: 50% 100%; }
  @keyframes jump { 35% { transform: translateY(-30px) scale(.95,1.06); } 70% { transform: translateY(0) scale(1.08,.92); } 100% { transform: none; } }
  .conf { animation: fall 1.8s linear infinite; }
  @keyframes fall { from { transform: translateY(0) rotate(0); opacity: 1; } to { transform: translateY(150px) rotate(540deg); opacity: 0; } }
  .sleep { animation: breathe 4.5s ease-in-out infinite; transform-origin: 50% 100%; }
  .zzz { animation: float 2.4s ease-in-out infinite; transform-origin: 50% 50%; }
  @keyframes float { 50% { transform: translate(4px, -8px); opacity: .5; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
"""


def banner():
    bubbles = "".join(
        f'<circle class="bubble" cx="{x}" cy="440" r="{r}" fill="#00C8FF" fill-opacity="0.12" stroke="#72C7FF" '
        f'stroke-opacity="0.55" style="animation-duration:{dur}s;animation-delay:-{delay}s"/>'
        for x, r, dur, delay in [(90, 6, 7, 0), (300, 4, 9, 2), (520, 8, 8, 4), (700, 5, 10, 1), (860, 7, 7.5, 3),
                                 (1010, 4, 9.5, 5), (1150, 9, 8.5, 0.5), (1230, 5, 7, 6), (420, 3, 6.5, 2.5), (620, 6, 11, 7)]
    )
    chips, x = [], 470
    for i, label in enumerate(["💧 Water reminders", "⏰ Alarms", "📅 Schedule", "✨ Gemini AI", "♞ Chess"]):
        w = 18 + len(label) * 9.2
        chips.append(
            f'<g class="fade" style="animation-delay:{0.9 + i * 0.12:.2f}s"><rect x="{x:.0f}" y="268" width="{w:.0f}" height="34" rx="17" '
            f'fill="#0E2A44" stroke="#00C8FF" stroke-opacity="0.45"/><text x="{x + w / 2:.0f}" y="290" text-anchor="middle" '
            f'font-size="15" fill="#D7DEE9">{label}</text></g>'
        )
        x += w + 10
    grid = "".join(f'<path d="M{gx} 0 V420"/>' for gx in range(0, 1281, 40)) + "".join(f'<path d="M0 {gy} H1280"/>' for gy in range(0, 421, 40))
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 420" width="1280" height="420" font-family="{FONT}" role="img" aria-label="SipPal, your desktop hydration buddy. Built by Qubtic Labs.">
<defs>
  <radialGradient id="bg" cx="22%" cy="55%" r="85%"><stop offset="0" stop-color="#0E2A44"/><stop offset="0.55" stop-color="#090D15"/><stop offset="1" stop-color="#05070C"/></radialGradient>
  <linearGradient id="title" x1="0" x2="1"><stop offset="0" stop-color="#F7F9FC"/><stop offset="1" stop-color="#72C7FF"/></linearGradient>
  <linearGradient id="waveg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00C8FF" stop-opacity="0.22"/><stop offset="1" stop-color="#4A90D9" stop-opacity="0.02"/></linearGradient>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>
  <clipPath id="frame"><rect width="1280" height="420" rx="24"/></clipPath>
</defs>
<style>{BANNER_CSS}</style>
<g clip-path="url(#frame)">
  <rect width="1280" height="420" fill="url(#bg)"/>
  <g opacity="0.07" stroke="#72C7FF">{grid}</g>
  {bubbles}
  <g class="wave2"><path d="{wave_path(1920, 372, 9, 320)}" fill="url(#waveg)"/></g>
  <g class="wave1"><path d="{wave_path(1920, 386, 7, 160)}" fill="url(#waveg)"/></g>
  <circle class="glow" cx="250" cy="240" r="120" fill="#00C8FF" opacity="0.35" filter="url(#glow)"/>
  <ellipse class="shadow" cx="250" cy="356" rx="80" ry="12" fill="#00C8FF" opacity="0.35"/>
  <g class="bob"><g transform="translate(140 110) scale(2.2)">{droplet("aqua", "hero")}</g></g>
  <path class="drip" d="M396 120 C400 128 404 132 404 137 a8 8 0 0 1 -16 0 C388 132 392 128 396 120 Z" fill="#72C7FF"/>
  <text class="fade" x="470" y="118" font-size="15" letter-spacing="6" fill="#00C8FF" style="animation-delay:.1s">QUBTIC LABS PRESENTS</text>
  <text class="fade" x="466" y="200" font-size="92" font-weight="800" fill="url(#title)" style="animation-delay:.25s">SipPal</text>
  <text class="fade" x="470" y="244" font-size="23" fill="#A8B8C8" style="animation-delay:.5s">Your desktop hydration buddy: a pet that reminds, schedules, chats &amp; plays.</text>
  {"".join(chips)}
  <text x="1248" y="402" text-anchor="end" font-size="14" fill="#8A96A8">Built by <tspan fill="#00C8FF" font-weight="700">Qubtic Labs</tspan> · qubticlabs.studio</text>
</g>
</svg>"""


def moods():
    glass = ('<g class="hand"><path d="M84 70 q8 -4 10 -12" stroke="#0f766e" stroke-width="3" fill="none" stroke-linecap="round"/>'
             '<path d="M88 36 h16 l-2 22 h-12 Z" fill="#e0f2fe" fill-opacity="0.75" stroke="#64748b" stroke-width="1.8"/>'
             '<path d="M90 52 h12 l-0.6 6 h-10.8 Z" fill="#14b8a6" opacity="0.6"/></g>')
    confetti = "".join(
        f'<rect class="conf" x="{cx}" y="-6" width="5" height="8" rx="1.5" fill="{c}" style="animation-delay:-{d}s"/>'
        for cx, c, d in [(8, "#38bdf8", 0), (30, "#f472b6", .4), (52, "#facc15", .9), (74, "#34d399", .2), (92, "#a78bfa", .6), (18, "#facc15", 1.1), (64, "#38bdf8", 1.4)]
    )
    zzz = '<g class="zzz" fill="#c2410c" font-weight="700"><text x="78" y="20" font-size="14">Z</text><text x="90" y="6" font-size="11">z</text><text x="99" y="-6" font-size="8">z</text></g>'
    tiles = [
        ("idle", "Idle", "breathes &amp; blinks", droplet("aqua", "m1")),
        ("thirsty", "Thirsty", "time to drink! 💧", droplet("mint", "m2", mouth="o", extra=glass)),
        ("celebrate", "Celebrate", "goal reached 🎉", droplet("lavender", "m3", eyes="happy", mouth="open")),
        ("sleep", "Sleepy", "quiet hours 💤", droplet("peach", "m4", eyes="closed", mouth="sleep", extra=zzz)),
    ]
    out = []
    for i, (cls, name, sub, art) in enumerate(tiles):
        x = i * 250
        conf = f'<g transform="translate({x + 75} 40)">{confetti}</g>' if cls == "celebrate" else ""
        out.append(
            f'<rect x="{x + 10}" y="10" width="230" height="280" rx="20" fill="#0E1521" stroke="#1f2b3d"/>'
            f'<ellipse cx="{x + 125}" cy="216" rx="42" ry="7" fill="#000" opacity="0.35"/>{conf}'
            f'<g class="{cls}"><g transform="translate({x + 75} 100)">{art}</g></g>'
            f'<text x="{x + 125}" y="252" text-anchor="middle" font-size="20" font-weight="700" fill="#F7F9FC">{name}</text>'
            f'<text x="{x + 125}" y="276" text-anchor="middle" font-size="14" fill="#8A96A8">{sub}</text>'
        )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300" width="1000" height="300" font-family="{FONT}" role="img" aria-label="Sip's moods: idle, thirsty, celebrating and sleepy, in four colour themes">
<style>{MOODS_CSS}</style>
{"".join(out)}
</svg>"""


for name, svg in [("banner.svg", banner()), ("sip-moods.svg", moods())]:
    with open(f".github/assets/{name}", "w", encoding="utf-8") as f:
        f.write(svg)
    print("wrote", name, len(svg), "bytes")
