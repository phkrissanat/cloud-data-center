paths = ["github-pages/style.css", "laptop-backend/frontend/style.css"]

old = "body:has(#workspace:not([hidden])):has(nav[hidden]) #demo-note { display:inline-block !important; order:5; color:#fff; background:#b42318; border:1px solid #b42318; border-radius:6px; padding:4px 10px; font-size:12px; font-weight:700; line-height:1.5; letter-spacing:.08em; margin:0; }"
add = "\nbody:has(#workspace:not([hidden])):has(nav[hidden]) #logout { padding:4px 10px; font-size:12px; line-height:1.5; }"

done = []
missing = []

for path in paths:
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        missing.append(path + " (ไม่พบไฟล์)")
        continue

    if old not in content:
        missing.append(path + " (ไม่พบข้อความที่ต้องการแก้)")
        continue

    if add.strip() in content:
        done.append(path + " (แก้ไว้แล้ว ข้ามซ้ำ)")
        continue

    content = content.replace(old, old + add)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    done.append(path + " (แก้ไขสำเร็จ)")

print("ผลลัพธ์:")
for d in done:
    print(" -", d)
for m in missing:
    print(" - ERROR:", m)
