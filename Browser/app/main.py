import sys
from pathlib import Path
from PySide6.QtCore import QCoreApplication, Qt
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import QApplication
from .engine import SearchManager
from .paths import ASSETS, data_dir
from .store import Store
from .vault import Vault
from .web import make_profile
from .window import BrowserWindow

class Session:
    def __init__(self):
        self.dir = data_dir()
        self.store = Store(self.dir / "sreon.sqlite")
        self.settings = self.store.settings()
        self.vault = Vault(self.store)
        self.search = SearchManager()
        self.downloads = []
        self.windows = []
        self.profile = None
        self.private_profile = None

    def start(self, app):
        self.profile = make_profile(app, self.dir, False)
        self.private_profile = make_profile(app, self.dir / "private", True)
        self.profile.downloadRequested.connect(self._download)
        self.private_profile.downloadRequested.connect(self._download)
        if not self.settings["third_party_cookies"]:
            self.profile.cookieStore().setCookieFilter(lambda request: not request.thirdParty)
        self.open_window(False)

    def _download(self, item):
        window = self.windows[-1] if self.windows else None
        if window:
            window._download(item)

    def open_window(self, private, url=None):
        window = BrowserWindow(self, private=private, url=url)
        window.show()
        self.windows.append(window)
        return window

    def forget(self, window):
        if window in self.windows:
            self.windows.remove(window)
        if not self.windows:
            QApplication.quit()

    def close(self):
        self.search.close()
        self.store.close()

def main():
    QCoreApplication.setOrganizationName("Sreon")
    QCoreApplication.setApplicationName("Sreon")
    QCoreApplication.setApplicationVersion("0.5.0")
    QApplication.setHighDpiScaleFactorRoundingPolicy(Qt.HighDpiScaleFactorRoundingPolicy.PassThrough)
    app = QApplication(sys.argv)
    app.setApplicationDisplayName("Sreon")
    icon = QIcon(str(ASSETS / "mark.png"))
    if not icon.isNull():
        app.setWindowIcon(icon)
    session = Session()
    app.aboutToQuit.connect(session.close)
    session.start(app)
    raise SystemExit(app.exec())

if __name__ == "__main__":
    main()
