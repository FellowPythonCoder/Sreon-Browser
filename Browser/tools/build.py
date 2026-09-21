import os
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def engine_name():
    return "sreon-api.exe" if sys.platform == "win32" else "sreon-api"

def find_engine():
    name = engine_name()
    for path in (
        ROOT / "engine" / name,
        ROOT / "search" / "target" / "release" / name,
        ROOT.parent / "Extra" / "Source" / "src-tauri" / "target" / "release" / name,
    ):
        print("engine candidate", path, path.is_file(), flush=True)
        if path.is_file():
            return path
    return None

def place_engine():
    dest = ROOT / "engine"
    dest.mkdir(exist_ok=True)
    built = find_engine()
    if built is None:
        raise SystemExit("search engine binary missing")
    target = dest / engine_name()
    if built.resolve() != target.resolve():
        shutil.copy2(built, target)
    if sys.platform != "win32":
        os.chmod(target, 0o755)
    print("engine ready", target, flush=True)

def run(command):
    print("+", *command, flush=True)
    log = ROOT / "freeze.log"
    with log.open("a", encoding="utf-8") as handle:
        handle.write(" ".join(map(str, command)) + "\n")
        process = subprocess.run(command, stdout=handle, stderr=subprocess.STDOUT, text=True)
    text = log.read_text(encoding="utf-8", errors="replace")
    print(text[-4000:], flush=True)
    if process.returncode:
        snippet = text[-2000:].replace("\r", " ").replace("%", "/")
        print("::error::" + snippet[:3900], flush=True)
        raise SystemExit(process.returncode)

def pyinstaller():
    os.chdir(ROOT)
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    sep = ";" if sys.platform == "win32" else ":"
    command = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--windowed", "--name", "Sreon",
        "--hidden-import", "PySide6.QtCore",
        "--hidden-import", "PySide6.QtGui",
        "--hidden-import", "PySide6.QtWidgets",
        "--hidden-import", "PySide6.QtNetwork",
        "--hidden-import", "PySide6.QtWebEngineCore",
        "--hidden-import", "PySide6.QtWebEngineWidgets",
        "--hidden-import", "PySide6.QtWebChannel",
        "--hidden-import", "PySide6.QtPrintSupport",
        "--hidden-import", "PySide6.QtTextToSpeech",
        "--hidden-import", "shiboken6",
        "--hidden-import", "cryptography",
        "--add-data", f"assets{sep}assets",
        "--add-data", f"engine{sep}engine",
        "--exclude-module", "tkinter",
        "--exclude-module", "matplotlib",
        "--exclude-module", "numpy",
        "app/main.py",
    ]
    if sys.platform == "darwin":
        icns = ROOT / "assets" / "icon.icns"
        if icns.is_file():
            command.extend(["--icon", str(icns), "--osx-bundle-identifier", "com.sreon.browser"])
    elif sys.platform == "win32":
        ico = ROOT / "assets" / "icon.ico"
        if ico.is_file():
            command.extend(["--icon", str(ico)])
    run(command)

def dmg():
    app = ROOT / "dist" / "Sreon.app"
    if not app.exists():
        nested = ROOT / "dist" / "Sreon" / "Sreon.app"
        app = nested if nested.exists() else None
    if app is None or not Path(app).exists():
        raise SystemExit("Sreon.app was not built")
    background = ROOT / "assets" / "dmg-background.png"
    icns = ROOT / "assets" / "icon.icns"
    stage = ROOT / "dist" / "dmg-stage"
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    shutil.copytree(app, stage / "Sreon.app", symlinks=True)
    Path(stage / "Applications").symlink_to("/Applications")
    hidden = stage / ".background"
    hidden.mkdir()
    shutil.copy2(background, hidden / "background.png")
    dmg_rw = ROOT / "dist" / "sreon-rw.dmg"
    dmg_path = ROOT / "dist" / "Sreon.dmg"
    for path in (dmg_rw, dmg_path):
        if path.exists():
            path.unlink()
    run(["hdiutil", "create", "-srcfolder", str(stage), "-volname", "Sreon", "-fs", "HFS+", "-format", "UDRW", "-ov", str(dmg_rw)])
    attached = subprocess.check_output(["hdiutil", "attach", "-readwrite", "-noverify", "-noautoopen", str(dmg_rw)], text=True)
    print(attached, flush=True)
    device = next(line.split()[0] for line in attached.splitlines() if "/Volumes/Sreon" in line)
    mount = Path("/Volumes/Sreon")
    for _ in range(40):
        if (mount / "Sreon.app").exists():
            break
        time.sleep(0.25)
    else:
        raise SystemExit("Sreon volume did not mount")
    script = (
        'tell application "Finder"\n'
        '  tell disk "Sreon"\n'
        '    open\n'
        '    set current view of container window to icon view\n'
        '    set toolbar visible of container window to false\n'
        '    set statusbar visible of container window to false\n'
        '    set bounds of container window to {280, 140, 940, 540}\n'
        '    set viewOptions to icon view options of container window\n'
        '    set arrangement of viewOptions to not arranged\n'
        '    set icon size of viewOptions to 128\n'
        '    set background picture of viewOptions to file ".background:background.png"\n'
        '    set position of item "Sreon.app" of container window to {165, 185}\n'
        '    set position of item "Applications" of container window to {495, 185}\n'
        '    close\n'
        '    open\n'
        '    update without registering applications\n'
        '    delay 2\n'
        '    close\n'
        '  end tell\n'
        'end tell\n'
    )
    run(["osascript", "-e", script])
    subprocess.call(["chflags", "hidden", str(mount / ".background")])
    if icns.is_file():
        shutil.copy2(icns, mount / ".VolumeIcon.icns")
        subprocess.call(["SetFile", "-c", "icnC", str(mount / ".VolumeIcon.icns")])
        subprocess.call(["SetFile", "-a", "C", str(mount)])
    subprocess.call(["bless", "--folder", str(mount), "--openfolder", str(mount)])
    run(["hdiutil", "detach", device, "-quiet"])
    for _ in range(20):
        if not mount.exists():
            break
        time.sleep(0.25)
    run(["hdiutil", "convert", str(dmg_rw), "-format", "UDZO", "-imagekey", "zlib-level=9", "-ov", "-o", str(dmg_path)])
    dmg_rw.unlink(missing_ok=True)

def linux_tar():
    source = ROOT / "dist" / "Sreon"
    if not source.exists():
        raise SystemExit("Linux app folder was not built")
    archive = ROOT / "dist" / "Sreon-linux.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(source, arcname="Sreon")

def main():
    skip = "--skip-engine" in sys.argv
    if not skip:
        run(["cargo", "build", "--release", "--manifest-path", str(ROOT.parent / "Extra" / "Source" / "src-tauri" / "Cargo.toml"), "--no-default-features", "--features", "api", "--bin", "sreon-api"])
    place_engine()
    pyinstaller()
    if sys.platform == "darwin":
        dmg()
    elif sys.platform.startswith("linux"):
        linux_tar()

if __name__ == "__main__":
    main()
