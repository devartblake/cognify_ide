# {{projectName}}

A FastAPI service created with Cognify IDE.

## In the Dev Container
The container installs the dependencies when it is created. Then:
- Test: `pytest`
- Run: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`, then open http://localhost:8000. The server restarts when you save a file; refresh the page to see the change.

## On your machine
Requires Python 3.10 or later.

```sh
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
pytest
uvicorn app.main:app --reload
```
