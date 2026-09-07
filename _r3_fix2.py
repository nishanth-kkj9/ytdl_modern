import io

p = r"d:/my_projects/ytdl_modern/python-engine/engine.py"
with io.open(p, "r", encoding="utf-8", newline="") as f:
    data = f.read()

dq = chr(34) * 2
seg = "    warnings:         str   = "

idx = data.find(seg)
print("before:", repr(data[idx: idx + 30]))
data = data[: idx + len(seg)] + dq + data[idx + len(seg):]

with io.open(p, "w", encoding="utf-8", newline="") as f:
    f.write(data)
print("done")