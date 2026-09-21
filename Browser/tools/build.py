import os
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def run(command, **kwargs):
    subprocess.check_call(command, **kwargs)

def engine():
    name = "sreon-api.exe" if sys.platform == "win32" else "sreon-api"
    dest = ROOT / "engine"
    dest.mkdir(exist_ok=True)
    run(["cargo", "build", "--release", "--manifest-path", str(ROOT / "search" / "Cargo.toml")])
    built = ROOT / "search" / "target" / "release" / name
    if not built.is_file():
        raise SystemExit("search engine failed to build")
    shutil.copy2(built, dest / name)
    if sys.platform != "win32":
        os.chmod(dest / name, 0o755)

def pyinstaller():
    os.chdir(ROOT)
    sep = ";" if sys.platform == "win32" else ":"
    icon = ROOT / "assets" / ("icon.icns" if sys.platform == "darwin" else "icon.ico")
    command = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--windowed", "--name", "Sreon",
        "--collect-all", "PySide6",
        "--add-data", f"assets{sep}assets",
        "--add-data", f"engine{sep}engine",
        "--hidden-import", "cryptography",
        "--exclude-module", "tkinter",
        "--exclude-module", "matplotlib",
        "--exclude-module", "numpy",
        "app/main.py",
    ]
    if icon.is_file():
        command.extend(["--icon", str(icon)])
    if sys.platform == "darwin":
        command.extend(["--osx-bundle-identifier", "com.sreon.browser"])
    run(command)

def dmg():
    app = ROOT / "dist" / "Sreon.app"
    if not app.exists():
        nested = ROOT / "dist" / "Sreon" / "Sreon.app"
        if nested.exists():
            app = nested
        else:
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
    archive = ROOT / "dist" / "Sreon-linux.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(source, arcname="Sreon")

def main():
    engine()
    pyinstaller()
    if sys.platform == "darwin":
        dmg()
    elif sys.platform.startswith("linux"):
        linux_tar()

if __name__ == "__main__":
    main()
