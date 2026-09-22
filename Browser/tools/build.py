import os
import shutil
import subprocess
import sys
import tarfile
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

def build_installer():
    os.chdir(ROOT)
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    sep = ";" if sys.platform == "win32" else ":"
    entry = "installer/mac_installer.py" if sys.platform == "darwin" else "installer/win_installer.py" if sys.platform == "win32" else "installer/linux_installer.py"
    if not (ROOT / entry).exists():
        print("installer entry not found", entry)
        return
    command = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--windowed", "--name", "Sreon Installer",
        "--hidden-import", "PySide6.QtCore",
        "--hidden-import", "PySide6.QtGui",
        "--hidden-import", "PySide6.QtWidgets",
        "--add-data", f"assets{sep}assets",
        "--add-data", f"installer{sep}installer",
        "--exclude-module", "tkinter",
        "--exclude-module", "matplotlib",
        "--exclude-module", "numpy",
        entry,
    ]
    if sys.platform == "darwin":
        icns = ROOT / "assets" / "icon.icns"
        if icns.is_file():
            command.extend(["--icon", str(icns), "--osx-bundle-identifier", "com.sreon.installer"])
    elif sys.platform == "win32":
        ico = ROOT / "assets" / "icon.ico"
        if ico.is_file():
            command.extend(["--icon", str(ico)])
    run(command)

def _detach_sreon_volume():
    subprocess.run(["hdiutil", "detach", "/Volumes/Sreon", "-force"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for p in ["/tmp/sreon-verify", "/tmp/sreon-plain-check", "/tmp/sreon-installer-check"]:
        tmp = Path(p)
        if tmp.exists():
            subprocess.run(["hdiutil", "detach", str(tmp), "-force"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def _dmg_ok(path):
    return path.is_file() and path.stat().st_size > 1_000_000

def _clear_quarantine(p):
    try:
        subprocess.run(["xattr", "-cr", str(p)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
    except Exception:
        pass

def _verify_dmg(path):
    try:
        subprocess.run(["hdiutil", "verify", str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60, check=True)
    except Exception:
        return False
    mount = Path("/tmp/sreon-verify")
    if mount.exists():
        shutil.rmtree(mount, ignore_errors=True)
    mount.mkdir(parents=True, exist_ok=True)
    ok = False
    try:
        subprocess.run(["hdiutil", "attach", "-readonly", "-noverify", "-noautoopen", "-mountpoint", str(mount), str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30, check=True)
        ok = (mount / "Sreon.app").exists() or any(mount.iterdir())
    except Exception:
        ok = False
    finally:
        subprocess.run(["hdiutil", "detach", str(mount), "-force"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        _detach_sreon_volume()
        shutil.rmtree(mount, ignore_errors=True)
    return ok

def dmg():
    app = ROOT / "dist" / "Sreon.app"
    if not app.exists():
        nested = ROOT / "dist" / "Sreon" / "Sreon.app"
        app = nested if nested.exists() else None
    if app is None or not Path(app).exists():
        raise SystemExit("Sreon.app was not built")
    app = Path(app)
    _clear_quarantine(app)
    exe = app / "Contents" / "MacOS" / "Sreon"
    if exe.exists():
        try:
            os.chmod(exe, 0o755)
        except Exception:
            pass
    installer_app = ROOT / "dist" / "Sreon Installer.app"
    if not installer_app.exists():
        installer_app = ROOT / "dist" / "Sreon Installer" / "Sreon Installer.app"
    background = ROOT / "assets" / "dmg-background.png"
    dmg_path = ROOT / "dist" / "Sreon.dmg"
    plain_path = ROOT / "dist" / "Sreon-plain.dmg"
    _detach_sreon_volume()
    if dmg_path.exists():
        dmg_path.unlink()
    if plain_path.exists():
        plain_path.unlink()
    plain_stage = ROOT / "dist" / "dmg-plain-stage"
    if plain_stage.exists():
        shutil.rmtree(plain_stage)
    plain_stage.mkdir(parents=True)
    shutil.copytree(app, plain_stage / "Sreon.app", symlinks=True)
    _clear_quarantine(plain_stage / "Sreon.app")
    if installer_app and installer_app.exists():
        shutil.copytree(installer_app, plain_stage / "Sreon Installer.app", symlinks=True)
        _clear_quarantine(plain_stage / "Sreon Installer.app")
    Path(plain_stage / "Applications").symlink_to("/Applications")
    run(["hdiutil", "create", "-volname", "Sreon", "-srcfolder", str(plain_stage), "-ov", "-fs", "HFS+", "-format", "UDZO", "-imagekey", "zlib-level=9", str(plain_path)])
    if not _dmg_ok(plain_path) or not _verify_dmg(plain_path):
        raise SystemExit("plain disk image failed")
    shutil.copy2(plain_path, dmg_path)
    maker = shutil.which("create-dmg")
    if maker and background.is_file():
        stage = ROOT / "dist" / "dmg-stage"
        if stage.exists():
            shutil.rmtree(stage)
        stage.mkdir(parents=True)
        shutil.copytree(app, stage / "Sreon.app", symlinks=True)
        _clear_quarantine(stage / "Sreon.app")
        if installer_app and installer_app.exists():
            shutil.copytree(installer_app, stage / "Sreon Installer.app", symlinks=True)
            _clear_quarantine(stage / "Sreon Installer.app")
        command = [
            maker, "--volname", "Sreon", "--background", str(background),
            "--window-pos", "200", "120", "--window-size", "660", "400",
            "--icon-size", "120", "--icon", "Sreon.app", "150", "200",
            "--icon", "Sreon Installer.app", "150", "320",
            "--app-drop-link", "510", "230", "--format", "UDZO",
            "--no-internet-enable",
        ]
        command.extend([str(dmg_path), str(stage)])
        print("+", *command, flush=True)
        log = ROOT / "freeze.log"
        with log.open("a", encoding="utf-8") as handle:
            handle.write(" ".join(map(str, command)) + "\n")
            try:
                process = subprocess.run(command, stdout=handle, stderr=subprocess.STDOUT, text=True, timeout=240)
            except subprocess.TimeoutExpired:
                handle.write("create-dmg timed out\n")
                process = None
        _detach_sreon_volume()
        if process is not None:
            print(log.read_text(encoding="utf-8", errors="replace")[-6000:], flush=True)
        else:
            print(log.read_text(encoding="utf-8", errors="replace")[-6000:], flush=True)
        if not (_dmg_ok(dmg_path) and _verify_dmg(dmg_path)):
            print("styled image failed, keeping plain", flush=True)
            if dmg_path.exists():
                dmg_path.unlink()
            shutil.copy2(plain_path, dmg_path)
        else:
            print("styled disk image verified", dmg_path, flush=True)
    if not _dmg_ok(dmg_path) or not _verify_dmg(dmg_path):
        raise SystemExit("Sreon.dmg verify failed")
    try:
        import zipfile
        zip_path = ROOT / "dist" / "Sreon.app.zip"
        if zip_path.exists():
            zip_path.unlink()
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            for p in app.rglob("*"):
                if p.is_file():
                    z.write(p, (Path("Sreon.app") / p.relative_to(app)).as_posix())
    except Exception:
        pass

def build_pkg():
    if sys.platform != "darwin":
        return
    app = ROOT / "dist" / "Sreon.app"
    if not app.exists():
        nested = ROOT / "dist" / "Sreon" / "Sreon.app"
        app = nested if nested.exists() else None
    if app is None or not Path(app).exists():
        print("pkg: Sreon.app not found")
        return
    app = Path(app)
    pkg_root = ROOT / "dist" / "pkgroot"
    if pkg_root.exists():
        shutil.rmtree(pkg_root)
    (pkg_root / "Applications").mkdir(parents=True)
    shutil.copytree(app, pkg_root / "Applications" / "Sreon.app", symlinks=True)
    _clear_quarantine(pkg_root / "Applications" / "Sreon.app")
    pkg_path = ROOT / "dist" / "Sreon.pkg"
    if pkg_path.exists():
        pkg_path.unlink()
    try:
        subprocess.run(["pkgbuild", "--root", str(pkg_root), "--identifier", "com.sreon.browser", "--version", "0.5.0", "--install-location", "/", str(pkg_path)], check=True)
        print("pkg built", pkg_path)
    except Exception as e:
        print("pkgbuild failed", e)

def build_nsis():
    if sys.platform != "win32":
        return
    nsi = ROOT / "installer" / "nsis" / "installer.nsi"
    if not nsi.exists():
        print("nsis file not found")
        return
    makensis = shutil.which("makensis")
    if not makensis:
        print("makensis not found")
        return
    os.chdir(nsi.parent)
    try:
        subprocess.run([makensis, str(nsi)], check=True)
        built = nsi.parent / "SreonSetup.exe"
        if built.exists():
            dest = ROOT / "dist" / "SreonSetup.exe"
            shutil.copy2(built, dest)
            print("nsis built", dest)
    except Exception as e:
        print("nsis build failed", e)

def build_deb():
    if not sys.platform.startswith("linux"):
        return
    src = ROOT / "dist" / "Sreon"
    if not src.exists():
        print("deb: Sreon folder not found")
        return
    deb_root = ROOT / "dist" / "deb"
    if deb_root.exists():
        shutil.rmtree(deb_root)
    (deb_root / "DEBIAN").mkdir(parents=True)
    (deb_root / "opt" / "sreon").mkdir(parents=True)
    (deb_root / "usr" / "share" / "applications").mkdir(parents=True)
    (deb_root / "usr" / "share" / "icons" / "hicolor" / "256x256" / "apps").mkdir(parents=True)
    shutil.copytree(src, deb_root / "opt" / "sreon", dirs_exist_ok=True)
    icon = ROOT / "assets" / "mark.png"
    if icon.exists():
        shutil.copy2(icon, deb_root / "usr" / "share" / "icons" / "hicolor" / "256x256" / "apps" / "sreon.png")
    desktop = deb_root / "usr" / "share" / "applications" / "sreon.desktop"
    desktop.write_text("""[Desktop Entry]
Type=Application
Name=Sreon
Comment=Fast private browser
Exec=/opt/sreon/Sreon
Icon=sreon
Categories=Network;WebBrowser;
Terminal=false
StartupWMClass=Sreon
""")
    control = deb_root / "DEBIAN" / "control"
    control.write_text("""Package: sreon
Version: 0.5.0
Section: web
Priority: optional
Architecture: amd64
Depends: libgl1, libnss3, libxkbcommon0, libasound2
Maintainer: Sreon <hello@sreon>
Description: Sreon Browser
 Fast private browser with built-in search.
""")
    try:
        subprocess.run(["chmod", "-R", "755", str(deb_root / "DEBIAN")], check=True)
        subprocess.run(["dpkg-deb", "--build", str(deb_root), str(ROOT / "dist" / "sreon_0.5.0_amd64.deb")], check=True)
        print("deb built")
    except Exception as e:
        print("deb build failed", e)

def linux_tar():
    source = ROOT / "dist" / "Sreon"
    if not source.exists():
        raise SystemExit("Linux app folder was not built")
    note = ROOT.parent / "If-it-says-unverified.txt"
    if note.is_file():
        shutil.copy2(note, source / "If-it-says-unverified.txt")
    archive = ROOT / "dist" / "Sreon-linux.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(source, arcname="Sreon")

def main():
    skip = "--skip-engine" in sys.argv
    if not skip:
        run(["cargo", "build", "--release", "--manifest-path", str(ROOT.parent / "Extra" / "Source" / "src-tauri" / "Cargo.toml"), "--no-default-features", "--features", "api", "--bin", "sreon-api"])
    place_engine()
    pyinstaller()
    build_installer()
    if sys.platform == "darwin":
        dmg()
        build_pkg()
    elif sys.platform.startswith("linux"):
        linux_tar()
        build_deb()
    elif sys.platform == "win32":
        build_nsis()

if __name__ == "__main__":
    main()
