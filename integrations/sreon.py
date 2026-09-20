import json
import subprocess
import threading


class Sreon:
    def __init__(self, executable):
        self.process = subprocess.Popen([str(executable)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8", bufsize=1)
        self.lock = threading.Lock()
        self.sequence = 0

    def search(self, query, category="web", cursor=None):
        with self.lock:
            self.sequence += 1
            request = {"id": self.sequence, "method": "search", "params": {"q": query, "category": category, "cursor": cursor}}
            self.process.stdin.write(json.dumps(request) + "\n")
            self.process.stdin.flush()
            line = self.process.stdout.readline()
            if not line:
                raise RuntimeError("Sreon API stopped")
            response = json.loads(line)
            if "error" in response:
                raise RuntimeError(response["error"]["message"])
            if response.get("id") != self.sequence:
                raise RuntimeError("Unexpected Sreon response")
            return response["result"]

    def close(self):
        self.process.stdin.close()
        try:
            self.process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.process.stdout.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
