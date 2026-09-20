import os
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
folders = {".github", "assets", "src-tauri", "integrations", "scripts", "tests", "o", "games"}
files = {".gitignore", "HOW-IT-WORKS.md", "app.js", "native.js", "theme.js", "styles.css", "index.html", "package.json", "package-lock.json", "playwright.config.js", "sreon.sh", "CNAME", "google8a635a877beef351.html"}
blocked = {"node_modules", "target", "dist", "gen", "__pycache__", ".git", ".cache", "test-results", "playwright-report"}
try:
    names = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
except (subprocess.CalledProcessError, FileNotFoundError):
    names = [str(path.relative_to(root)).replace(os.sep, "/") for path in root.rglob("*") if path.is_file()]
if (root / "src-tauri/Cargo.lock").is_file():
    names.append("src-tauri/Cargo.lock")
output = root / "Sreon-source.zip"
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in sorted(set(names)):
        path = Path(name)
        if not name or path.is_absolute() or ".." in path.parts or blocked.intersection(path.parts):
            continue
        if name not in files and path.parts[0] not in folders:
            continue
        source = root / path
        if not source.is_file() or source.is_symlink() or path.suffix.lower() in {".zip", ".pem", ".key", ".p12", ".dmg", ".exe"} or path.name.startswith(".env"):
            continue
        info = zipfile.ZipInfo("Sreon/" + path.as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
        info.external_attr = (source.stat().st_mode & 0xffff) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, source.read_bytes())
print(output.name)
