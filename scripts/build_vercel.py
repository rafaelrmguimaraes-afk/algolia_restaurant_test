"""Copy only public assets; no datasets, source credentials, or Python files."""
from pathlib import Path
import shutil
ROOT = Path(__file__).resolve().parents[1]
def build():
    output = ROOT / 'dist'
    if output.exists(): shutil.rmtree(output)
    output.mkdir()
    for name in ['index.html','index.css','index.js','mobile-ui.js','location.js','sentence-search.js','debug.js','assets/favicon.ico','assets/images/background.png','assets/images/background_@2X.png']:
        source = ROOT / name
        if source.exists():
            target = output / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
if __name__ == '__main__': build()
