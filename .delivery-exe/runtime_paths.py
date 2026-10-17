import sys
from pathlib import Path
APP_DIR=Path(sys.executable).parent if getattr(sys,'frozen',False) else Path(__file__).parent
