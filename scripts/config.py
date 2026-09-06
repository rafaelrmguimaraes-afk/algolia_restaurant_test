"""Read local credentials without printing them. No third-party dependencies."""
from pathlib import Path
import ssl

# Shared project root for all scripts; .env lives here, outside the public server allowlist.
ROOT = Path(__file__).resolve().parents[1]

# Parse simple KEY=value lines. This intentionally small reader does not expand shell variables
# or support inline comments; put comments on separate lines in .env.
def load_env(path=None):
    values = {}
    for line in Path(path or ROOT / '.env').read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            # Split only at the first equals sign, preserving any equals signs inside a value.
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('\"\'')
    return values

# HTTPS certificate verification remains enabled. Use the system CA bundle when present.
def tls_context():
    # Homebrew Python may not locate the macOS CA bundle automatically.
    bundle = Path('/etc/ssl/cert.pem')
    return ssl.create_default_context(cafile=str(bundle) if bundle.exists() else None)
