"""Read local credentials without printing them. No third-party dependencies."""
from pathlib import Path
import ssl

ROOT = Path(__file__).resolve().parents[1]

def load_env(path=None):
    values = {}
    for line in Path(path or ROOT / '.env').read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('\"\'')
    return values

def tls_context():
    # Homebrew Python may not locate the macOS CA bundle automatically.
    bundle = Path('/etc/ssl/cert.pem')
    return ssl.create_default_context(cafile=str(bundle) if bundle.exists() else None)
