import os
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def run(command, **kwargs):
    print("+", *command, flush=True)
    subprocess.check_call(command, **kwargs)

def cargo():
    found = shutil.which("cargo")
    if not found:
        found = str(Path.home() / ".cargo" / "bin" / ("cargo.exe" if sys.platform == "win32" else "cargo"))
    if not Path(found).is_file() and not shutil.which("cargo"):
        raise SystemExit("cargo not found")
    return found if Path(found).is_file() else "cargo"

def engine():
    name = "sreon-api.exe" if sys.platform == "win32" else "sreon-api"
    dest = ROOT / "engine"
    dest.mkdir(exist_ok=True)
    run([cargo(), "build", "--release", "--manifest-path", str(ROOT / "search" / "Cargo.toml"), "--bin", "sreon-api"])
    built = ROOT / "search" / "target" / "release" / name
    if not built.is_file():
        raise SystemExit("search engine failed to build")
    shutil.copy2(built, dest / name)
    if sys.platform != "win32":
        os.chmod(dest / name, 0o755)

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
        "--collect-binaries", "PySide6",
        "--collect-data", "PySide6",
        "--add-data", f"assets{sep}assets",
        "--add-data", f"engine{sep}engine",
        "--exclude-module", "tkinter",
        "--exclude-module", "matplotlib",
        "--exclude-module", "numpy",
        "--exclude-module", "PySide6.Qt3DCore",
        "--exclude-module", "PySide6.QtCharts",
        "--exclude-module", "PySide6.QtDesigner",
        "--exclude-module", "PySide6.QtBluetooth",
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
    stage = ROOT / "dist" / "dmg"
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    shutil.copytree(app, stage / "Sreon.app", symlinks=True)
    dmg_path = ROOT / "dist" / "Sreon.dmg"
    if dmg_path.exists():
        dmg_path.unlink()
    run(["hdiutil", "create", "-volname", "Sreon", "-srcfolder", str(stage), "-ov", "-format", "UDZO", str(dmg_path)])

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
        engine()
    else:
        place_engine()
    pyinstaller()
    if sys.platform == "darwin":
        dmg()
    elif sys.platform.startswith("linux"):
        linux_tar()

if __name__ == "__main__":
    main()
