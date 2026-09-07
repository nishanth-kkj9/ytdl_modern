import io

p = r"d:/my_projects/ytdl_modern/python-engine/engine.py"
with io.open(p, "r", encoding="utf-8", newline="") as f:
    data = f.read()

old = """    # F-07/11: honest human-readable notes appended to the result message
    # ("file already existed — not re-downloaded", "no FFmpeg — progressive").
    warnings:         str   ="""
new = """    # F-07/11: honest human-readable notes appended to the result message
    # ("file already existed — not re-downloaded", "no FFmpeg — progressive").
    warnings:         str   = """""

for o, n in [(old, new), (old.replace("\n", "\r\n"), new.replace("\n", "\r\n"))]:
    if data.count(o) == 1:
        data = data.replace(o, n)
        with io.open(p, "w", encoding="utf-8", newline="") as f:
            f.write(data)
        print("warnings field fixed")
        break
else:
    raise SystemExit("anchor not found")