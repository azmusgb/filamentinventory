from pathlib import Path

p = Path("firmware/waveshare-home/WaveshareHome/Services.cpp")
s = p.read_text()
old = '''    s += F("</div><div class='grid'><form method='post' action='/bambu/pause'><button class='muted'>Pause</button></form><form method='post' action='/bambu/resume'><button>Resume</button></form><form method='post' action='/bambu/stop'><input type='hidden' name='confirm' value='STOP'><button class='danger' onclick=\"return confirm('Stop the current print?')\">Stop print</button></form></div>");'''
new = '''    s += F("</div><div class='grid'><form method='post' action='/bambu/pause'><button class='muted'>Pause</button></form><form method='post' action='/bambu/resume'><button>Resume</button></form><form method='post' action='/bambu/stop'><input name='confirm' placeholder='Type STOP to confirm'><button class='danger'>Stop print</button></form></div>");'''
if old not in s:
    raise SystemExit("guarded stop HTML pattern not found")
p.write_text(s.replace(old, new, 1))
print("Guarded Bambu stop HTML fixed")
